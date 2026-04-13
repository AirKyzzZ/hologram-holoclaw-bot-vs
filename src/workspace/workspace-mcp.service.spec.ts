import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { McpService } from '../mcp/mcp.service'
import { WorkspaceMcpServerEntity } from './workspace-mcp-server.entity'
import { WorkspaceMcpService, workspaceServerSlug } from './workspace-mcp.service'

describe('workspaceServerSlug', () => {
  it('prefixes with the first 8 hex chars of the workspaceId', () => {
    expect(workspaceServerSlug('abcdef01-2345-6789-abcd-ef0123456789', 'github')).toBe('ws-abcdef01-github')
  })

  it('lowercases and sanitizes the name', () => {
    expect(workspaceServerSlug('abcdef01-2345-6789-abcd-ef0123456789', 'GitHub Search')).toBe('ws-abcdef01-github_search')
  })

  it('truncates long names', () => {
    const long = 'x'.repeat(100)
    const slug = workspaceServerSlug('abcdef01-2345-6789-abcd-ef0123456789', long)
    // ws-<8chars>- is 12 chars; plus up to 40 name chars = 52
    expect(slug.length).toBeLessThanOrEqual(52)
    expect(slug.startsWith('ws-abcdef01-')).toBe(true)
  })
})

describe('WorkspaceMcpService', () => {
  // Generate a valid 32-byte key once for all tests
  const TEST_KEY = 'a'.repeat(64)
  const originalEnv = process.env.MCP_CONFIG_ENCRYPTION_KEY

  function createRepoMock() {
    const store: WorkspaceMcpServerEntity[] = []
    return {
      _store: store,
      create: jest.fn((input: Partial<WorkspaceMcpServerEntity>) => ({ ...(input as WorkspaceMcpServerEntity) })),
      save: jest.fn(async (entity: WorkspaceMcpServerEntity) => {
        if (!entity.id) entity.id = `row-${store.length + 1}`
        if (!entity.addedAt) entity.addedAt = new Date()
        const idx = store.findIndex((e) => e.id === entity.id)
        if (idx >= 0) store[idx] = entity
        else store.push(entity)
        return entity
      }),
      find: jest.fn(async ({ where }: any = {}) => {
        if (!where) return [...store]
        return store.filter((e) => Object.entries(where).every(([k, v]) => (e as any)[k] === v))
      }),
      findOne: jest.fn(async ({ where }: any) => {
        return store.find((e) => Object.entries(where).every(([k, v]) => (e as any)[k] === v))
      }),
      delete: jest.fn(async ({ id }: { id: string }) => {
        const idx = store.findIndex((e) => e.id === id)
        if (idx >= 0) store.splice(idx, 1)
        return { affected: 1 }
      }),
    }
  }

  function createMcpServiceMock(options: { addBehavior?: (def: any) => Promise<number> } = {}) {
    const registered: any[] = []
    return {
      _registered: registered,
      addServer: jest.fn(async (def: any) => {
        if (options.addBehavior) {
          return options.addBehavior(def)
        }
        registered.push(def)
        return 5
      }),
      removeServer: jest.fn(async (name: string) => {
        const idx = registered.findIndex((d) => d.name === name)
        if (idx >= 0) registered.splice(idx, 1)
      }),
    }
  }

  async function buildService(
    repoMock: ReturnType<typeof createRepoMock>,
    mcpMock: ReturnType<typeof createMcpServiceMock>,
  ): Promise<WorkspaceMcpService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceMcpService,
        { provide: getRepositoryToken(WorkspaceMcpServerEntity), useValue: repoMock },
        { provide: McpService, useValue: mcpMock },
      ],
    }).compile()
    const service = module.get(WorkspaceMcpService)
    await service.onModuleInit()
    return service
  }

  beforeEach(() => {
    process.env.MCP_CONFIG_ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MCP_CONFIG_ENCRYPTION_KEY
    } else {
      process.env.MCP_CONFIG_ENCRYPTION_KEY = originalEnv
    }
  })

  describe('add', () => {
    it('persists an encrypted row and registers the runtime server', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      const result = await service.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer ghp_xyz' },
        addedBy: 'alice',
      })

      expect(result.toolCount).toBe(5)
      expect(result.slug).toBe('ws-abcdef01-github')
      expect(repo._store).toHaveLength(1)
      const row = repo._store[0]
      expect(row.name).toBe('github')
      // Headers must not leak into plaintext columns
      expect((row as any).headers).toBeUndefined()
      expect(row.encryptedConfig.length).toBeGreaterThan(0)
      expect(row.iv.length).toBe(12)
      expect(row.authTag.length).toBe(16)

      expect(mcp.addServer).toHaveBeenCalledTimes(1)
      const addedDef = mcp.addServer.mock.calls[0][0]
      expect(addedDef.name).toBe('ws-abcdef01-github')
      expect(addedDef.headers).toEqual({ Authorization: 'Bearer ghp_xyz' })
    })

    it('rejects duplicate server names within the same workspace', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await service.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        addedBy: 'alice',
      })

      await expect(
        service.add({
          workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
          name: 'github',
          transport: 'streamable-http',
          url: 'https://api.example.com/mcp',
          addedBy: 'alice',
        }),
      ).rejects.toThrow(/already exists/i)
    })

    it('allows the same name in two different workspaces', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await service.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        addedBy: 'alice',
      })
      await service.add({
        workspaceId: 'fedcba98-7654-3210-fedc-ba9876543210',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        addedBy: 'bob',
      })

      expect(repo._store).toHaveLength(2)
      expect(mcp._registered.map((d) => d.name).sort()).toEqual(
        ['ws-abcdef01-github', 'ws-fedcba98-github'].sort(),
      )
    })

    it('rolls back persisted row when runtime registration fails', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock({
        addBehavior: async () => {
          throw new Error('connection refused')
        },
      })
      const service = await buildService(repo, mcp)

      await expect(
        service.add({
          workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
          name: 'github',
          transport: 'streamable-http',
          url: 'https://api.example.com/mcp',
          addedBy: 'alice',
        }),
      ).rejects.toThrow('connection refused')

      expect(repo._store).toHaveLength(0)
    })

    it('throws a clear error when encryption is disabled', async () => {
      delete process.env.MCP_CONFIG_ENCRYPTION_KEY
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await expect(
        service.add({
          workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
          name: 'github',
          transport: 'streamable-http',
          url: 'https://api.example.com/mcp',
          addedBy: 'alice',
        }),
      ).rejects.toThrow(/BYOMCP is disabled/i)
    })
  })

  describe('remove', () => {
    it('unregisters and deletes the persisted row', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await service.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        addedBy: 'alice',
      })
      await service.remove('abcdef01-2345-6789-abcd-ef0123456789', 'github')
      expect(repo._store).toHaveLength(0)
      expect(mcp.removeServer).toHaveBeenCalledWith('ws-abcdef01-github')
    })

    it('is a no-op when the server does not exist', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await service.remove('abcdef01-2345-6789-abcd-ef0123456789', 'nope')
      expect(mcp.removeServer).not.toHaveBeenCalled()
    })
  })

  describe('restoration', () => {
    it('re-registers persisted servers on module init', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      // First: add a server through a first service instance so we get
      // real encrypted bytes in the store
      const firstService = await buildService(repo, mcp)
      await firstService.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer ghp_xyz' },
        addedBy: 'alice',
      })
      expect(mcp.addServer).toHaveBeenCalledTimes(1)

      // Now build a second service instance reusing the same repo — onModuleInit
      // should re-register everything from persistence.
      const secondMcp = createMcpServiceMock()
      await buildService(repo, secondMcp)
      expect(secondMcp.addServer).toHaveBeenCalledTimes(1)
      const restoredDef = secondMcp.addServer.mock.calls[0][0]
      expect(restoredDef.name).toBe('ws-abcdef01-github')
      expect(restoredDef.headers).toEqual({ Authorization: 'Bearer ghp_xyz' })
    })
  })

  describe('listForWorkspace', () => {
    it('returns only rows for the requested workspace', async () => {
      const repo = createRepoMock()
      const mcp = createMcpServiceMock()
      const service = await buildService(repo, mcp)

      await service.add({
        workspaceId: 'abcdef01-2345-6789-abcd-ef0123456789',
        name: 'github',
        transport: 'streamable-http',
        url: 'https://api.example.com/mcp',
        addedBy: 'alice',
      })
      await service.add({
        workspaceId: 'fedcba98-7654-3210-fedc-ba9876543210',
        name: 'slack',
        transport: 'streamable-http',
        url: 'https://api.slack.com/mcp',
        addedBy: 'bob',
      })

      const aliceList = await service.listForWorkspace('abcdef01-2345-6789-abcd-ef0123456789')
      const bobList = await service.listForWorkspace('fedcba98-7654-3210-fedc-ba9876543210')
      expect(aliceList).toHaveLength(1)
      expect(aliceList[0].name).toBe('github')
      expect(bobList).toHaveLength(1)
      expect(bobList[0].name).toBe('slack')
    })
  })
})
