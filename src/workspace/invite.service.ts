import { randomBytes } from 'crypto'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WorkspaceInviteEntity } from './workspace-invite.entity'

export interface CreateInviteInput {
  workspaceId: string
  role: string
  issuedBy: string
  uses?: number
  ttlHours?: number
}

export interface RedeemResult {
  invite: WorkspaceInviteEntity
}

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name)
  private readonly defaultTtlHours: number
  private readonly defaultRole: string
  private readonly allowedRoles: string[]

  constructor(
    @InjectRepository(WorkspaceInviteEntity)
    private readonly inviteRepo: Repository<WorkspaceInviteEntity>,
    private readonly config: ConfigService,
  ) {
    this.defaultTtlHours = this.config.get<number>('appConfig.holoclaw.invites.tokenTTLHours') ?? 168
    this.defaultRole = this.config.get<string>('appConfig.holoclaw.invites.defaultRole') ?? 'collaborator'
    this.allowedRoles = this.config.get<string[]>('appConfig.holoclaw.invites.allowedRoles') ?? [
      'collaborator',
      'observer',
      'approver',
    ]
  }

  async create(input: CreateInviteInput): Promise<WorkspaceInviteEntity> {
    const role = input.role || this.defaultRole
    if (!this.allowedRoles.includes(role)) {
      throw new BadRequestException(
        `Invite role must be one of: ${this.allowedRoles.join(', ')}`,
      )
    }

    const ttlHours = input.ttlHours ?? this.defaultTtlHours
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000)
    const token = this.generateToken()

    const invite = this.inviteRepo.create({
      workspaceId: input.workspaceId,
      token,
      role,
      issuedBy: input.issuedBy,
      expiresAt,
      usesRemaining: input.uses ?? 1,
      revoked: false,
    })
    const saved = await this.inviteRepo.save(invite)
    this.logger.log(
      `[INVITE] Issued token for workspace=${input.workspaceId} role=${role} by=${input.issuedBy}`,
    )
    return saved
  }

  /**
   * Validate a token and decrement usesRemaining. Returns the invite if valid.
   * Throws BadRequestException / NotFoundException on invalid/expired/revoked tokens.
   */
  async redeem(token: string): Promise<RedeemResult> {
    const normalized = token.trim()
    if (!normalized) {
      throw new BadRequestException('Empty invite token')
    }

    const invite = await this.inviteRepo.findOne({ where: { token: normalized } })
    if (!invite) {
      throw new NotFoundException('Invite token not found')
    }
    if (invite.revoked) {
      throw new BadRequestException('Invite token has been revoked')
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invite token has expired')
    }
    if (invite.usesRemaining <= 0) {
      throw new BadRequestException('Invite token has no uses remaining')
    }

    invite.usesRemaining -= 1
    await this.inviteRepo.save(invite)
    return { invite }
  }

  async revoke(token: string): Promise<void> {
    const invite = await this.inviteRepo.findOne({ where: { token } })
    if (!invite) throw new NotFoundException('Invite token not found')
    invite.revoked = true
    await this.inviteRepo.save(invite)
  }

  private generateToken(): string {
    // 24 URL-safe characters from 18 random bytes
    return randomBytes(18).toString('base64url')
  }
}
