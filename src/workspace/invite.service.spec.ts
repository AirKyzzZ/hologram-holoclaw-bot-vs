import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { InviteService } from './invite.service'
import { WorkspaceInviteEntity } from './workspace-invite.entity'

function createInviteRepoMock() {
  const store: WorkspaceInviteEntity[] = []
  return {
    _store: store,
    create: jest.fn((input: Partial<WorkspaceInviteEntity>) => ({ ...(input as WorkspaceInviteEntity) })),
    save: jest.fn(async (entity: WorkspaceInviteEntity) => {
      if (!entity.id) entity.id = `invite-${store.length + 1}`
      if (!entity.createdAt) entity.createdAt = new Date()
      const idx = store.findIndex((e) => e.id === entity.id)
      if (idx >= 0) store[idx] = entity
      else store.push(entity)
      return entity
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<WorkspaceInviteEntity> }) => {
      return store.find((e) => {
        return Object.entries(where).every(([k, v]) => (e as any)[k] === v)
      })
    }),
  }
}

describe('InviteService', () => {
  let service: InviteService
  let repo: ReturnType<typeof createInviteRepoMock>

  beforeEach(async () => {
    repo = createInviteRepoMock()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        { provide: getRepositoryToken(WorkspaceInviteEntity), useValue: repo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'appConfig.holoclaw.invites.tokenTTLHours') return 24
              if (key === 'appConfig.holoclaw.invites.defaultRole') return 'collaborator'
              if (key === 'appConfig.holoclaw.invites.allowedRoles')
                return ['collaborator', 'observer', 'approver']
              return undefined
            },
          },
        },
      ],
    }).compile()

    service = module.get<InviteService>(InviteService)
  })

  describe('create', () => {
    it('issues a random token with default TTL and role', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
      })
      expect(invite.token).toBeDefined()
      expect(invite.token.length).toBeGreaterThanOrEqual(20)
      expect(invite.role).toBe('collaborator')
      expect(invite.usesRemaining).toBe(1)
      expect(invite.revoked).toBe(false)
      expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('rejects roles not in allowedRoles', async () => {
      await expect(
        service.create({ workspaceId: 'ws-1', role: 'owner', issuedBy: 'alice' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('generates unique tokens across invites', async () => {
      const i1 = await service.create({ workspaceId: 'ws-1', role: 'collaborator', issuedBy: 'alice' })
      const i2 = await service.create({ workspaceId: 'ws-1', role: 'collaborator', issuedBy: 'alice' })
      expect(i1.token).not.toBe(i2.token)
    })
  })

  describe('redeem', () => {
    it('decrements usesRemaining on successful redemption', async () => {
      const created = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
      })
      const { invite } = await service.redeem(created.token)
      expect(invite.usesRemaining).toBe(0)
    })

    it('rejects empty tokens', async () => {
      await expect(service.redeem('   ')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects unknown tokens', async () => {
      await expect(service.redeem('not-a-real-token')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects revoked tokens', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
      })
      await service.revoke(invite.token)
      await expect(service.redeem(invite.token)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects expired tokens', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
        ttlHours: 1,
      })
      // Forcibly expire by rewinding
      invite.expiresAt = new Date(Date.now() - 1000)
      await repo.save(invite as any)
      await expect(service.redeem(invite.token)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects tokens with no uses remaining', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
      })
      await service.redeem(invite.token) // 1 → 0
      await expect(service.redeem(invite.token)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('supports multi-use tokens', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
        uses: 3,
      })
      const r1 = await service.redeem(invite.token)
      expect(r1.invite.usesRemaining).toBe(2)
      const r2 = await service.redeem(invite.token)
      expect(r2.invite.usesRemaining).toBe(1)
      const r3 = await service.redeem(invite.token)
      expect(r3.invite.usesRemaining).toBe(0)
      await expect(service.redeem(invite.token)).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('revoke', () => {
    it('marks an invite as revoked', async () => {
      const invite = await service.create({
        workspaceId: 'ws-1',
        role: 'collaborator',
        issuedBy: 'alice',
      })
      await service.revoke(invite.token)
      const stored = repo._store.find((i) => i.token === invite.token)
      expect(stored?.revoked).toBe(true)
    })

    it('throws when revoking an unknown token', async () => {
      await expect(service.revoke('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
