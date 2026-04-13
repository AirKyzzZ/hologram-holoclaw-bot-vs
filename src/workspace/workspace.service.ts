import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WorkspaceEntity } from './workspace.entity'
import { WorkspaceMemberEntity, WorkspaceRole } from './workspace-member.entity'

export interface CreateWorkspaceInput {
  name: string
  goal?: string
  ownerIdentity: string
  ownerConnectionId: string
}

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name)
  private readonly maxPerOwner: number
  private readonly nameMaxLength: number

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly memberRepo: Repository<WorkspaceMemberEntity>,
    private readonly config: ConfigService,
  ) {
    this.maxPerOwner = this.config.get<number>('appConfig.holoclaw.workspaces.maxPerOwner') ?? 10
    this.nameMaxLength = this.config.get<number>('appConfig.holoclaw.workspaces.nameMaxLength') ?? 120
  }

  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const name = input.name.trim()
    if (!name) {
      throw new BadRequestException('Workspace name is required')
    }
    if (name.length > this.nameMaxLength) {
      throw new BadRequestException(`Workspace name must be ≤ ${this.nameMaxLength} characters`)
    }

    const ownedCount = await this.workspaceRepo.count({
      where: { ownerIdentity: input.ownerIdentity },
    })
    if (ownedCount >= this.maxPerOwner) {
      throw new BadRequestException(`Workspace limit reached (${this.maxPerOwner})`)
    }

    const duplicate = await this.workspaceRepo.findOne({
      where: { ownerIdentity: input.ownerIdentity, name },
    })
    if (duplicate) {
      throw new BadRequestException(`You already own a workspace named "${name}"`)
    }

    const workspace = this.workspaceRepo.create({
      name,
      goal: input.goal?.trim() || undefined,
      ownerIdentity: input.ownerIdentity,
    })
    const saved = await this.workspaceRepo.save(workspace)

    await this.memberRepo.save(
      this.memberRepo.create({
        workspaceId: saved.id,
        connectionId: input.ownerConnectionId,
        userIdentity: input.ownerIdentity,
        role: 'owner',
      }),
    )

    this.logger.log(`[WORKSPACE] Created "${saved.name}" (${saved.id}) for ${input.ownerIdentity}`)
    return saved
  }

  async findById(id: string): Promise<WorkspaceEntity> {
    const workspace = await this.workspaceRepo.findOne({ where: { id } })
    if (!workspace) {
      throw new NotFoundException(`Workspace ${id} not found`)
    }
    return workspace
  }

  async findByIdOrNull(id: string): Promise<WorkspaceEntity | null> {
    return this.workspaceRepo.findOne({ where: { id } })
  }

  async listForIdentity(userIdentity: string): Promise<WorkspaceEntity[]> {
    const memberships = await this.memberRepo.find({ where: { userIdentity } })
    if (memberships.length === 0) return []
    const ids = memberships.map((m) => m.workspaceId)
    return this.workspaceRepo
      .createQueryBuilder('w')
      .where('w.id IN (:...ids)', { ids })
      .orderBy('w.updatedAt', 'DESC')
      .getMany()
  }

  async isOwner(workspaceId: string, userIdentity: string): Promise<boolean> {
    const workspace = await this.findByIdOrNull(workspaceId)
    return workspace?.ownerIdentity === userIdentity
  }
}
