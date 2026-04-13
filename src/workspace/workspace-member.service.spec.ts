import { ConflictException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { WorkspaceMemberEntity } from './workspace-member.entity'
import { WorkspaceMemberService } from './workspace-member.service'

function createMemberRepoMock() {
  const store: WorkspaceMemberEntity[] = []
  return {
    _store: store,
    create: jest.fn((input: Partial<WorkspaceMemberEntity>) => ({ ...(input as WorkspaceMemberEntity) })),
    save: jest.fn(async (entity: WorkspaceMemberEntity) => {
      if (!entity.id) entity.id = `m-${store.length + 1}`
      if (!entity.joinedAt) entity.joinedAt = new Date()
      entity.lastSeenAt = new Date()
      const idx = store.findIndex((e) => e.id === entity.id)
      if (idx >= 0) store[idx] = entity
      else store.push(entity)
      return entity
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      return store.filter((e) => {
        return Object.entries(where).every(([k, v]) => {
          // Handle TypeORM Not(IsNull()) operator — our mock treats it as "not undefined and not null"
          const actual = (e as any)[k]
          if (typeof v === 'object' && v !== null && '_type' in v) {
            return actual != null
          }
          return actual === v
        })
      })
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return store.find((e) => {
        return Object.entries(where).every(([k, v]) => (e as any)[k] === v)
      })
    }),
  }
}

describe('WorkspaceMemberService', () => {
  let service: WorkspaceMemberService
  let repo: ReturnType<typeof createMemberRepoMock>

  beforeEach(async () => {
    repo = createMemberRepoMock()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceMemberService,
        { provide: getRepositoryToken(WorkspaceMemberEntity), useValue: repo },
      ],
    }).compile()
    service = module.get<WorkspaceMemberService>(WorkspaceMemberService)
  })

  describe('add', () => {
    it('adds a new member', async () => {
      const member = await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
        connectionId: 'conn-1',
      })
      expect(member.id).toBeDefined()
      expect(member.role).toBe('collaborator')
      expect(repo._store).toHaveLength(1)
    })

    it('throws Conflict when the same identity is added twice', async () => {
      await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
        connectionId: 'conn-1',
      })
      await expect(
        service.add({
          workspaceId: 'ws-1',
          userIdentity: 'alice@example.com',
          role: 'observer',
          connectionId: 'conn-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('attaches a new connectionId on re-add if identity exists with a different connection', async () => {
      await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
        connectionId: 'conn-old',
      })
      const updated = await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
        connectionId: 'conn-new',
      })
      expect(updated.connectionId).toBe('conn-new')
    })
  })

  describe('rolesFor', () => {
    it('returns the membership role', async () => {
      await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
      })
      const roles = await service.rolesFor('ws-1', 'alice@example.com')
      expect(roles).toEqual(['collaborator'])
    })

    it('returns empty array for non-members', async () => {
      const roles = await service.rolesFor('ws-1', 'ghost@example.com')
      expect(roles).toEqual([])
    })
  })

  describe('findByConnection', () => {
    it('returns all memberships for a connectionId', async () => {
      await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'owner',
        connectionId: 'conn-1',
      })
      await service.add({
        workspaceId: 'ws-2',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
        connectionId: 'conn-1',
      })
      const found = await service.findByConnection('conn-1')
      expect(found).toHaveLength(2)
    })
  })

  describe('attachConnection', () => {
    it('attaches a new connectionId to an existing membership', async () => {
      await service.add({
        workspaceId: 'ws-1',
        userIdentity: 'alice@example.com',
        role: 'collaborator',
      })
      const updated = await service.attachConnection('ws-1', 'alice@example.com', 'conn-1')
      expect(updated?.connectionId).toBe('conn-1')
    })

    it('returns null for unknown membership', async () => {
      const updated = await service.attachConnection('ws-1', 'ghost@example.com', 'conn-1')
      expect(updated).toBeNull()
    })
  })
})
