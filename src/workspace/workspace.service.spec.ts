import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectLiteral, Repository } from 'typeorm'
import { WorkspaceEntity } from './workspace.entity'
import { WorkspaceMemberEntity } from './workspace-member.entity'
import { WorkspaceService } from './workspace.service'

type MockRepo<T extends ObjectLiteral = ObjectLiteral> = Partial<
  Record<keyof Repository<T>, jest.Mock>
> & {
  _store?: T[]
}

function createMockRepo<T extends ObjectLiteral & { id?: string }>(): MockRepo<T> {
  const store: T[] = []
  const repo: MockRepo<T> = {
    _store: store,
    create: jest.fn((input: Partial<T>) => ({ ...(input as any) })),
    save: jest.fn(async (entity: any) => {
      if (!entity.id) entity.id = `id-${store.length + 1}`
      if (!entity.createdAt) entity.createdAt = new Date()
      entity.updatedAt = new Date()
      // upsert by id
      const existing = store.findIndex((e: any) => e.id === entity.id)
      if (existing >= 0) store[existing] = entity
      else store.push(entity)
      return entity
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return store.find((e: any) => {
        return Object.entries(where).every(([k, v]) => (e as any)[k] === v)
      })
    }),
    count: jest.fn(async ({ where }: any) => {
      return store.filter((e: any) => {
        return Object.entries(where).every(([k, v]) => (e as any)[k] === v)
      }).length
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      if (!where) return [...store]
      return store.filter((e: any) => {
        return Object.entries(where).every(([k, v]) => (e as any)[k] === v)
      })
    }),
    createQueryBuilder: jest.fn(() => {
      const state: { ids?: string[] } = {}
      const qb: any = {
        where: jest.fn((_: string, params: { ids: string[] }) => {
          state.ids = params.ids
          return qb
        }),
        orderBy: jest.fn(() => qb),
        getMany: jest.fn(async () => store.filter((e: any) => state.ids?.includes(e.id))),
      }
      return qb
    }),
  }
  return repo
}

describe('WorkspaceService', () => {
  let service: WorkspaceService
  let workspaceRepo: MockRepo<WorkspaceEntity>
  let memberRepo: MockRepo<WorkspaceMemberEntity>

  beforeEach(async () => {
    workspaceRepo = createMockRepo<WorkspaceEntity>()
    memberRepo = createMockRepo<WorkspaceMemberEntity>()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceMemberEntity), useValue: memberRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'appConfig.holoclaw.workspaces.maxPerOwner') return 3
              if (key === 'appConfig.holoclaw.workspaces.nameMaxLength') return 120
              return undefined
            },
          },
        },
      ],
    }).compile()

    service = module.get<WorkspaceService>(WorkspaceService)
  })

  describe('create', () => {
    it('creates a workspace and an owner membership', async () => {
      const ws = await service.create({
        name: 'Demo',
        goal: 'Testing',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })

      expect(ws.name).toBe('Demo')
      expect(ws.ownerIdentity).toBe('alice@example.com')
      expect(ws.id).toBeDefined()
      expect(workspaceRepo._store).toHaveLength(1)

      // Owner membership should exist
      expect(memberRepo._store).toHaveLength(1)
      const membership = memberRepo._store![0]
      expect(membership.workspaceId).toBe(ws.id)
      expect(membership.role).toBe('owner')
      expect(membership.userIdentity).toBe('alice@example.com')
      expect(membership.connectionId).toBe('conn-1')
    })

    it('trims the workspace name', async () => {
      const ws = await service.create({
        name: '  Spaces  ',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      expect(ws.name).toBe('Spaces')
    })

    it('rejects empty names', async () => {
      await expect(
        service.create({
          name: '   ',
          ownerIdentity: 'alice@example.com',
          ownerConnectionId: 'conn-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects names longer than the configured limit', async () => {
      await expect(
        service.create({
          name: 'x'.repeat(121),
          ownerIdentity: 'alice@example.com',
          ownerConnectionId: 'conn-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects duplicate workspace names for the same owner', async () => {
      await service.create({
        name: 'Demo',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      await expect(
        service.create({
          name: 'Demo',
          ownerIdentity: 'alice@example.com',
          ownerConnectionId: 'conn-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('allows the same name for different owners', async () => {
      await service.create({
        name: 'Demo',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      const ws2 = await service.create({
        name: 'Demo',
        ownerIdentity: 'bob@example.com',
        ownerConnectionId: 'conn-2',
      })
      expect(ws2.id).toBeDefined()
    })

    it('enforces the maxPerOwner limit', async () => {
      for (let i = 0; i < 3; i++) {
        await service.create({
          name: `Demo${i}`,
          ownerIdentity: 'alice@example.com',
          ownerConnectionId: 'conn-1',
        })
      }
      await expect(
        service.create({
          name: 'Demo3',
          ownerIdentity: 'alice@example.com',
          ownerConnectionId: 'conn-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('findById', () => {
    it('returns the workspace when it exists', async () => {
      const created = await service.create({
        name: 'Demo',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      const found = await service.findById(created.id)
      expect(found.id).toBe(created.id)
    })

    it('throws NotFoundException for unknown ids', async () => {
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('listForIdentity', () => {
    it('returns all workspaces where the user is a member', async () => {
      await service.create({
        name: 'A',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      await service.create({
        name: 'B',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      await service.create({
        name: 'C',
        ownerIdentity: 'bob@example.com',
        ownerConnectionId: 'conn-2',
      })

      const aliceList = await service.listForIdentity('alice@example.com')
      expect(aliceList.map((w) => w.name).sort()).toEqual(['A', 'B'])

      const bobList = await service.listForIdentity('bob@example.com')
      expect(bobList.map((w) => w.name)).toEqual(['C'])

      const noneList = await service.listForIdentity('carol@example.com')
      expect(noneList).toEqual([])
    })
  })

  describe('isOwner', () => {
    it('returns true for the creator', async () => {
      const ws = await service.create({
        name: 'Demo',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      expect(await service.isOwner(ws.id, 'alice@example.com')).toBe(true)
    })

    it('returns false for non-owners', async () => {
      const ws = await service.create({
        name: 'Demo',
        ownerIdentity: 'alice@example.com',
        ownerConnectionId: 'conn-1',
      })
      expect(await service.isOwner(ws.id, 'bob@example.com')).toBe(false)
    })

    it('returns false for unknown workspaces', async () => {
      expect(await service.isOwner('missing', 'alice@example.com')).toBe(false)
    })
  })
})
