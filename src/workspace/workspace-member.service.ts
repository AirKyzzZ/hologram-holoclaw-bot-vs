import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { WorkspaceMemberEntity, WorkspaceRole } from './workspace-member.entity'

export interface AddMemberInput {
  workspaceId: string
  userIdentity: string
  role: WorkspaceRole
  connectionId?: string
}

@Injectable()
export class WorkspaceMemberService {
  private readonly logger = new Logger(WorkspaceMemberService.name)

  constructor(
    @InjectRepository(WorkspaceMemberEntity)
    private readonly memberRepo: Repository<WorkspaceMemberEntity>,
  ) {}

  async add(input: AddMemberInput): Promise<WorkspaceMemberEntity> {
    const existing = await this.memberRepo.findOne({
      where: { workspaceId: input.workspaceId, userIdentity: input.userIdentity },
    })
    if (existing) {
      if (input.connectionId && existing.connectionId !== input.connectionId) {
        existing.connectionId = input.connectionId
        return this.memberRepo.save(existing)
      }
      throw new ConflictException(`${input.userIdentity} is already a member of this workspace`)
    }

    const member = this.memberRepo.create(input)
    const saved = await this.memberRepo.save(member)
    this.logger.log(
      `[MEMBER] Added ${input.userIdentity} to workspace ${input.workspaceId} as ${input.role}`,
    )
    return saved
  }

  async findByConnection(connectionId: string): Promise<WorkspaceMemberEntity[]> {
    return this.memberRepo.find({ where: { connectionId } })
  }

  async findByIdentityInWorkspace(
    workspaceId: string,
    userIdentity: string,
  ): Promise<WorkspaceMemberEntity | null> {
    return this.memberRepo.findOne({ where: { workspaceId, userIdentity } })
  }

  /**
   * Roles for a given user in a given workspace. Empty array if not a member.
   */
  async rolesFor(workspaceId: string, userIdentity: string): Promise<WorkspaceRole[]> {
    const member = await this.findByIdentityInWorkspace(workspaceId, userIdentity)
    return member ? [member.role] : []
  }

  /**
   * Return all members of a workspace who currently have a connectionId attached
   * (i.e., are or have been connected in this process lifetime).
   */
  async onlineMembers(workspaceId: string): Promise<WorkspaceMemberEntity[]> {
    return this.memberRepo.find({
      where: { workspaceId, connectionId: Not(IsNull()) },
    })
  }

  async touch(member: WorkspaceMemberEntity): Promise<void> {
    member.lastSeenAt = new Date()
    await this.memberRepo.save(member)
  }

  async attachConnection(
    workspaceId: string,
    userIdentity: string,
    connectionId: string,
  ): Promise<WorkspaceMemberEntity | null> {
    const member = await this.findByIdentityInWorkspace(workspaceId, userIdentity)
    if (!member) return null
    member.connectionId = connectionId
    return this.memberRepo.save(member)
  }
}
