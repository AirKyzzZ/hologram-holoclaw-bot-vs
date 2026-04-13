import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TextMessage, ContextualMenuSelectMessage } from '@2060.io/vs-agent-nestjs-client'
import { CoreService } from './core.service'
import { StateStep } from './common/enums/state-step.enum'
import { SessionEntity } from './models'
import { AgentContentService } from './agent-content.service'
import { ChatbotService } from '../chatbot/chatbot.service'
import { MemoryService } from '../memory/memory.service'
import { McpConfigService } from '../mcp/mcp-config.service'
import { McpService } from '../mcp/mcp.service'
import { RbacService } from '../rbac/rbac.service'
import { ApprovalService } from '../rbac/approval.service'
import { WorkspaceService } from '../workspace/workspace.service'
import { WorkspaceMemberService } from '../workspace/workspace-member.service'
import { InviteService } from '../workspace/invite.service'
import { WorkspaceMcpService } from '../workspace/workspace-mcp.service'
import { BroadcastService } from '../broadcast/broadcast.service'
import { WorkspaceEntity } from '../workspace/workspace.entity'
import { WorkspaceMemberEntity } from '../workspace/workspace-member.entity'

// Mock credo's JsonTransformer so plain-object test messages flow through unchanged
jest.mock('@credo-ts/core', () => ({
  JsonTransformer: {
    fromJSON: (obj: unknown, _Class: unknown) => obj,
    toJSON: (obj: unknown) => obj,
  },
}))

// Mock the VS Agent client so CoreService's ApiClient constructor + sends are inert
jest.mock('@2060.io/vs-agent-nestjs-client', () => {
  const actual = jest.requireActual('@2060.io/vs-agent-nestjs-client')
  return {
    ...actual,
    ApiClient: jest.fn().mockImplementation(() => ({
      messages: { send: jest.fn().mockResolvedValue(undefined) },
    })),
    // Minimal TextMessage/ContextualMenuSelectMessage stubs that expose `type`
    TextMessage: class TextMessage {
      static type = 'text'
      type = 'text'
      content: string
      connectionId: string
      constructor(fields: any) {
        this.content = fields.content
        this.connectionId = fields.connectionId
      }
    },
    ContextualMenuSelectMessage: class ContextualMenuSelectMessage {
      static type = 'contextual-menu-select'
      type = 'contextual-menu-select'
      selectionId: string
      connectionId: string
      constructor(fields: any) {
        this.selectionId = fields.selectionId
        this.connectionId = fields.connectionId
      }
    },
  }
})

function sessionRepoMock() {
  const store: SessionEntity[] = []
  return {
    _store: store,
    create: jest.fn((input: Partial<SessionEntity>) => ({ ...(input as SessionEntity) })),
    save: jest.fn(async (session: SessionEntity) => {
      if (!session.id) session.id = `s-${store.length + 1}`
      const idx = store.findIndex((s) => s.id === session.id)
      if (idx >= 0) store[idx] = session
      else store.push(session)
      return session
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return store.find((s) => Object.entries(where).every(([k, v]) => (s as any)[k] === v))
    }),
    findOneBy: jest.fn(async (where: any) => {
      return store.find((s) => Object.entries(where).every(([k, v]) => (s as any)[k] === v))
    }),
  }
}

describe('CoreService — HoloClaw workspace flows', () => {
  let service: CoreService
  let sessionRepo: ReturnType<typeof sessionRepoMock>
  let workspaceService: WorkspaceService
  let memberService: WorkspaceMemberService
  let inviteService: InviteService
  let broadcast: { broadcastText: jest.Mock; broadcastToolEvent: jest.Mock; broadcastToConnections: jest.Mock; sendToConnection: jest.Mock }

  const configValues: Record<string, unknown> = {
    'appConfig.vsAgentAdminUrl': 'http://localhost:3001',
    'appConfig.holoclaw.workspaces.maxPerOwner': 3,
    'appConfig.holoclaw.workspaces.nameMaxLength': 120,
    'appConfig.holoclaw.invites.tokenTTLHours': 24,
    'appConfig.holoclaw.invites.defaultRole': 'collaborator',
    'appConfig.holoclaw.invites.allowedRoles': ['collaborator', 'observer', 'approver'],
    'appConfig.adminAvatars': [],
  }

  beforeEach(async () => {
    sessionRepo = sessionRepoMock()

    const workspaceRepo = createTypeOrmMock<WorkspaceEntity>()
    const memberRepo = createTypeOrmMock<WorkspaceMemberEntity>()
    const inviteRepo = createInviteRepo()

    broadcast = {
      broadcastText: jest.fn().mockResolvedValue(0),
      broadcastToolEvent: jest.fn().mockResolvedValue(0),
      broadcastToConnections: jest.fn().mockResolvedValue(0),
      sendToConnection: jest.fn().mockResolvedValue(true),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoreService,
        { provide: getRepositoryToken(SessionEntity), useValue: sessionRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        { provide: ChatbotService, useValue: { chat: jest.fn().mockResolvedValue('ai response') } },
        { provide: MemoryService, useValue: { clear: jest.fn() } },
        {
          provide: AgentContentService,
          useValue: {
            getMenuItems: () => [
              { id: 'create-workspace', labelKey: 'CREATE_WORKSPACE', action: 'create-workspace', visibleWhen: 'noWorkspace' },
              { id: 'join-workspace', labelKey: 'JOIN_WORKSPACE', action: 'join-workspace', visibleWhen: 'noWorkspace' },
              { id: 'switch-workspace', labelKey: 'SWITCH_WORKSPACE', action: 'switch-workspace', visibleWhen: 'inWorkspace' },
              { id: 'leave-workspace', labelKey: 'LEAVE_WORKSPACE', action: 'leave-workspace', visibleWhen: 'inWorkspace' },
              { id: 'invite-member', labelKey: 'INVITE_MEMBER', action: 'invite-member', visibleWhen: 'isWorkspaceAdmin' },
            ],
            getGreetingMessage: () => 'welcome',
            getWelcomeFlowConfig: () => ({ enabled: true, sendOnProfile: false, templateKey: 'greetingMessage' }),
            getAuthFlowConfig: () => ({
              enabled: false,
              required: false,
              credentialDefinitionId: undefined,
              userIdentityAttribute: 'name',
              rolesAttribute: undefined,
              defaultRole: 'collaborator',
              adminUsers: [],
              adminAvatars: [],
            }),
            getDefaultLanguage: () => 'en',
            getString: (_lang: string, key: string) => `[${key}]`,
            getUserControlledServers: () => [],
            getUserControlledServer: () => undefined,
          },
        },
        { provide: McpConfigService, useValue: { isAvailable: false, saveConfig: jest.fn(), getConfig: jest.fn(), hasConfig: jest.fn() } },
        { provide: McpService, useValue: { testUserConnection: jest.fn() } },
        { provide: RbacService, useValue: { isAdminUser: () => false, isRbacActive: () => false } },
        { provide: ApprovalService, useValue: { countByRequester: jest.fn().mockResolvedValue(0), countPendingForApprover: jest.fn().mockResolvedValue(0) } },
        // Real workspace services backed by the in-memory repo mocks
        WorkspaceService,
        WorkspaceMemberService,
        InviteService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceMemberEntity), useValue: memberRepo },
        { provide: 'WorkspaceInviteEntityRepository', useValue: inviteRepo },
        {
          provide: getRepositoryToken(require('../workspace/workspace-invite.entity').WorkspaceInviteEntity),
          useValue: inviteRepo,
        },
        { provide: WorkspaceMcpService, useValue: { add: jest.fn() } },
        { provide: BroadcastService, useValue: broadcast },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile()

    service = module.get(CoreService)
    workspaceService = module.get(WorkspaceService)
    memberService = module.get(WorkspaceMemberService)
    inviteService = module.get(InviteService)
  })

  // ── Helpers ────────────────────────────────────────────────────────

  function createSession(connectionId: string, overrides: Partial<SessionEntity> = {}): SessionEntity {
    const session: SessionEntity = {
      id: `s-${connectionId}`,
      connectionId,
      lang: 'en',
      state: StateStep.LOBBY,
      isAuthenticated: false,
      ...overrides,
    } as SessionEntity
    sessionRepo._store.push(session)
    return session
  }

  async function textInput(connectionId: string, text: string) {
    await service.inputMessage({
      type: 'text',
      connectionId,
      content: text,
    } as any)
  }

  async function menuSelect(connectionId: string, selectionId: string) {
    await service.inputMessage({
      type: 'contextual-menu-select',
      connectionId,
      selectionId,
    } as any)
  }

  // ── Tests ──────────────────────────────────────────────────────────

  describe('newConnection', () => {
    it('lands new connections in LOBBY', async () => {
      await service.newConnection('conn-1')
      const session = sessionRepo._store.find((s) => s.connectionId === 'conn-1')!
      expect(session.state).toBe(StateStep.LOBBY)
    })
  })

  describe('create workspace flow', () => {
    it('transitions LOBBY → CREATE_WORKSPACE → CHAT with a workspace row', async () => {
      createSession('conn-alice')

      await menuSelect('conn-alice', 'create-workspace')
      let session = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!
      expect(session.state).toBe(StateStep.CREATE_WORKSPACE)
      expect(session.workspaceFlowStep).toBe('name')

      await textInput('conn-alice', 'Demo')
      session = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!
      expect(session.workspaceFlowStep).toBe('goal')

      await textInput('conn-alice', 'Testing multiplayer')
      session = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!
      expect(session.state).toBe(StateStep.CHAT)
      expect(session.activeWorkspaceId).toBeDefined()

      const workspaces = await workspaceService.listForIdentity('conn-alice')
      expect(workspaces).toHaveLength(1)
      expect(workspaces[0].name).toBe('Demo')
      expect(workspaces[0].goal).toBe('Testing multiplayer')
    })

    it('accepts "skip" as the goal', async () => {
      createSession('conn-alice')
      await menuSelect('conn-alice', 'create-workspace')
      await textInput('conn-alice', 'NoGoal')
      await textInput('conn-alice', 'skip')
      const workspaces = await workspaceService.listForIdentity('conn-alice')
      expect(workspaces[0].goal).toBeUndefined()
    })
  })

  describe('join workspace flow', () => {
    it('alice creates, bob joins via invite token, broadcast fires', async () => {
      createSession('conn-alice')
      await menuSelect('conn-alice', 'create-workspace')
      await textInput('conn-alice', 'Demo')
      await textInput('conn-alice', 'skip')
      const aliceSession = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!

      // Alice creates invite
      await menuSelect('conn-alice', 'invite-member')
      const aliceInvites = (await inviteServiceInternalList(inviteService, aliceSession.activeWorkspaceId!)) as any[]
      expect(aliceInvites.length).toBeGreaterThan(0)
      const token = aliceInvites[0].token

      // Bob joins
      createSession('conn-bob')
      await menuSelect('conn-bob', 'join-workspace')
      let bobSession = sessionRepo._store.find((s) => s.connectionId === 'conn-bob')!
      expect(bobSession.state).toBe(StateStep.JOIN_WORKSPACE)

      await textInput('conn-bob', token)
      bobSession = sessionRepo._store.find((s) => s.connectionId === 'conn-bob')!
      expect(bobSession.state).toBe(StateStep.CHAT)
      expect(bobSession.activeWorkspaceId).toBe(aliceSession.activeWorkspaceId)

      // Bob should be a member
      const bobMember = await memberService.findByIdentityInWorkspace(
        aliceSession.activeWorkspaceId!,
        'conn-bob',
      )
      expect(bobMember?.role).toBe('collaborator')

      // Broadcast fired with exclusion (i18n keys are stubbed in the mock;
      // we assert on workspaceId + exclude instead of the localized string)
      expect(broadcast.broadcastText).toHaveBeenCalled()
      const call = broadcast.broadcastText.mock.calls.find(
        (c: any[]) => c[0].workspaceId === aliceSession.activeWorkspaceId && c[0].excludeConnectionId === 'conn-bob',
      )
      expect(call).toBeDefined()
    })

    it('rejects invalid invite tokens', async () => {
      createSession('conn-carol')
      await menuSelect('conn-carol', 'join-workspace')
      await textInput('conn-carol', 'not-a-valid-token-abcdefghi')

      const session = sessionRepo._store.find((s) => s.connectionId === 'conn-carol')!
      expect(session.state).toBe(StateStep.LOBBY)
      expect(session.activeWorkspaceId).toBeUndefined()
    })
  })

  describe('observer guard', () => {
    it('refuses observer input in CHAT state without calling the LLM', async () => {
      // Create workspace as alice, invite bob as observer, bob joins, bob sends message
      createSession('conn-alice')
      await menuSelect('conn-alice', 'create-workspace')
      await textInput('conn-alice', 'Demo')
      await textInput('conn-alice', 'skip')
      const aliceSession = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!

      // Create observer invite directly via service
      const invite = await inviteService.create({
        workspaceId: aliceSession.activeWorkspaceId!,
        role: 'observer',
        issuedBy: 'conn-alice',
      })

      createSession('conn-bob')
      await menuSelect('conn-bob', 'join-workspace')
      await textInput('conn-bob', invite.token)

      const chatbotMock = (service as unknown as { chatBotService: { chat: jest.Mock } }).chatBotService
      ;(chatbotMock.chat as jest.Mock).mockClear()

      await textInput('conn-bob', 'hello AI')
      expect(chatbotMock.chat).not.toHaveBeenCalled()
    })
  })

  describe('leave workspace', () => {
    it('returns to LOBBY without deleting membership', async () => {
      createSession('conn-alice')
      await menuSelect('conn-alice', 'create-workspace')
      await textInput('conn-alice', 'Demo')
      await textInput('conn-alice', 'skip')

      await menuSelect('conn-alice', 'leave-workspace')
      const session = sessionRepo._store.find((s) => s.connectionId === 'conn-alice')!
      expect(session.state).toBe(StateStep.LOBBY)
      expect(session.activeWorkspaceId).toBeUndefined()

      const workspaces = await workspaceService.listForIdentity('conn-alice')
      expect(workspaces).toHaveLength(1) // membership still exists
    })
  })
})

// ── TypeORM repo mock helper ───────────────────────────────────────

function createTypeOrmMock<T extends { id?: string } = any>() {
  const store: T[] = []
  return {
    _store: store,
    create: jest.fn((input: Partial<T>) => ({ ...(input as any) })),
    save: jest.fn(async (entity: any) => {
      if (!entity.id) entity.id = `id-${store.length + 1}`
      if (!entity.createdAt) entity.createdAt = new Date()
      entity.updatedAt = new Date()
      if (!entity.joinedAt) entity.joinedAt = new Date()
      if (!entity.lastSeenAt) entity.lastSeenAt = new Date()
      const idx = store.findIndex((e: any) => e.id === entity.id)
      if (idx >= 0) store[idx] = entity
      else store.push(entity)
      return entity
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return store.find((e: any) =>
        Object.entries(where).every(([k, v]) => (e as any)[k] === v),
      )
    }),
    findOneBy: jest.fn(async (where: any) => {
      return store.find((e: any) =>
        Object.entries(where).every(([k, v]) => (e as any)[k] === v),
      )
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      if (!where) return [...store]
      return store.filter((e: any) => {
        return Object.entries(where).every(([k, v]) => {
          const actual = (e as any)[k]
          if (typeof v === 'object' && v !== null && '_type' in v) {
            return actual != null
          }
          return actual === v
        })
      })
    }),
    count: jest.fn(async ({ where }: any) => {
      return store.filter((e: any) =>
        Object.entries(where).every(([k, v]) => (e as any)[k] === v),
      ).length
    }),
    delete: jest.fn(async ({ id }: { id: string }) => {
      const idx = store.findIndex((e: any) => e.id === id)
      if (idx >= 0) store.splice(idx, 1)
      return { affected: 1 }
    }),
    createQueryBuilder: jest.fn(() => {
      const state: { ids?: string[] } = {}
      const qb: any = {
        where: jest.fn((_: string, params: { ids: string[] }) => {
          state.ids = params.ids
          return qb
        }),
        orderBy: jest.fn(() => qb),
        getMany: jest.fn(async () =>
          store.filter((e: any) => state.ids?.includes(e.id)),
        ),
      }
      return qb
    }),
  }
}

function createInviteRepo() {
  return createTypeOrmMock()
}

async function inviteServiceInternalList(inviteService: InviteService, workspaceId: string) {
  // InviteService has no public list method — read directly from the store via a hack
  const repo = (inviteService as any).inviteRepo
  return repo._store.filter((i: any) => i.workspaceId === workspaceId)
}
