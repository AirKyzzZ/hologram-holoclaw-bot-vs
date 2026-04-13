import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { BroadcastService, BroadcastToolEventInput } from './broadcast.service'
import { WorkspaceMemberService } from '../workspace/workspace-member.service'
import { WorkspaceMemberEntity } from '../workspace/workspace-member.entity'

type SendResult = { ok: boolean; error?: string }

type SentMessage = { connectionId: string; content: string }
const mockSend = jest.fn(async (_msg: SentMessage): Promise<SendResult> => ({ ok: true }))

function sentAt(index: number): SentMessage {
  const call = (mockSend.mock.calls as unknown as SentMessage[][])[index]
  if (!call || !call[0]) throw new Error(`No mockSend call at index ${index}`)
  return call[0]
}

jest.mock('@2060.io/vs-agent-nestjs-client', () => {
  return {
    ApiClient: jest.fn().mockImplementation(() => ({
      messages: {
        send: (msg: { content: string; connectionId: string }) => mockSend(msg),
      },
    })),
    ApiVersion: { V1: 'v1' },
    TextMessage: jest.fn().mockImplementation((fields: any) => ({ ...fields, type: 'text' })),
  }
})

function mkMember(workspaceId: string, connectionId: string | undefined, identity: string): WorkspaceMemberEntity {
  return {
    id: `m-${identity}`,
    workspaceId,
    connectionId,
    userIdentity: identity,
    role: 'collaborator',
    joinedAt: new Date(),
    lastSeenAt: new Date(),
  }
}

describe('BroadcastService', () => {
  let service: BroadcastService
  let memberService: jest.Mocked<Partial<WorkspaceMemberService>>
  let config: jest.Mocked<Partial<ConfigService>>

  const configValues: Record<string, unknown> = {
    'appConfig.vsAgentAdminUrl': 'http://localhost:3001',
    'appConfig.holoclaw.liveFeed.enabled': true,
    'appConfig.holoclaw.liveFeed.verbosity': 'verbose',
    'appConfig.holoclaw.liveFeed.broadcastToolErrors': true,
  }

  beforeEach(async () => {
    mockSend.mockClear()
    mockSend.mockImplementation(async () => ({ ok: true }))

    memberService = {
      onlineMembers: jest.fn(),
    }
    config = {
      get: jest.fn((key: string) => configValues[key]) as any,
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastService,
        { provide: WorkspaceMemberService, useValue: memberService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()

    service = module.get<BroadcastService>(BroadcastService)
  })

  describe('broadcastText', () => {
    it('delivers text to every online member', async () => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([
        mkMember('ws-1', 'conn-a', 'alice'),
        mkMember('ws-1', 'conn-b', 'bob'),
        mkMember('ws-1', 'conn-c', 'carol'),
      ])

      const delivered = await service.broadcastText({
        workspaceId: 'ws-1',
        text: 'hello workspace',
      })

      expect(delivered).toBe(3)
      expect(mockSend).toHaveBeenCalledTimes(3)
      const targets = (mockSend.mock.calls as unknown as SentMessage[][])
        .map((call) => call[0]?.connectionId)
        .filter((cid): cid is string => !!cid)
      expect(targets.sort()).toEqual(['conn-a', 'conn-b', 'conn-c'])
    })

    it('excludes the configured connectionId', async () => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([
        mkMember('ws-1', 'conn-a', 'alice'),
        mkMember('ws-1', 'conn-b', 'bob'),
      ])

      const delivered = await service.broadcastText({
        workspaceId: 'ws-1',
        text: '[alice] joined',
        excludeConnectionId: 'conn-a',
      })

      expect(delivered).toBe(1)
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend.mock.calls[0][0].connectionId).toBe('conn-b')
    })

    it('skips members without a connectionId', async () => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([
        mkMember('ws-1', undefined, 'alice'),
        mkMember('ws-1', 'conn-b', 'bob'),
      ])
      const delivered = await service.broadcastText({ workspaceId: 'ws-1', text: 'hi' })
      expect(delivered).toBe(1)
    })

    it('returns 0 when workspace has no online members', async () => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([])
      const delivered = await service.broadcastText({ workspaceId: 'ws-1', text: 'hi' })
      expect(delivered).toBe(0)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('counts failures separately from successes', async () => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([
        mkMember('ws-1', 'conn-a', 'alice'),
        mkMember('ws-1', 'conn-b', 'bob'),
        mkMember('ws-1', 'conn-c', 'carol'),
      ])
      let call = 0
      mockSend.mockImplementation(async () => {
        call++
        if (call === 2) throw new Error('network')
        return { ok: true }
      })

      const delivered = await service.broadcastText({ workspaceId: 'ws-1', text: 'hi' })
      expect(delivered).toBe(2)
      expect(mockSend).toHaveBeenCalledTimes(3)
    })
  })

  describe('broadcastToolEvent', () => {
    beforeEach(() => {
      memberService.onlineMembers = jest.fn().mockResolvedValue([mkMember('ws-1', 'conn-a', 'alice')])
    })

    it('broadcasts a verbose "start" event', async () => {
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'start',
      })
      expect(delivered).toBe(1)
      expect(sentAt(0).content).toContain('calling github/search_code')
    })

    it('broadcasts an "end" event with duration', async () => {
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'end',
        durationMs: 1234,
      })
      expect(delivered).toBe(1)
      expect(sentAt(0).content).toContain('complete (1234ms)')
    })

    it('broadcasts an error event with reason', async () => {
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'error',
        error: 'rate limited',
      })
      expect(delivered).toBe(1)
      expect(sentAt(0).content).toContain('failed: rate limited')
    })

    it('minimal verbosity suppresses start events', async () => {
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'start',
        verbosity: 'minimal',
      })
      expect(delivered).toBe(0)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('minimal verbosity still broadcasts end events', async () => {
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'end',
        durationMs: 500,
        verbosity: 'minimal',
      })
      expect(delivered).toBe(1)
    })

    it('debug verbosity includes arg and result snippets', async () => {
      const startDelivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'start',
        args: { query: 'foo' },
        verbosity: 'debug',
      })
      expect(startDelivered).toBe(1)
      expect(sentAt(0).content).toContain('args={"query":"foo"}')
    })

    it('disables all broadcasts when liveFeed.enabled=false', async () => {
      configValues['appConfig.holoclaw.liveFeed.enabled'] = false
      const input: BroadcastToolEventInput = {
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'end',
        durationMs: 100,
      }
      const delivered = await service.broadcastToolEvent(input)
      expect(delivered).toBe(0)
      expect(mockSend).not.toHaveBeenCalled()
      configValues['appConfig.holoclaw.liveFeed.enabled'] = true
    })

    it('suppresses error broadcasts when broadcastToolErrors=false', async () => {
      configValues['appConfig.holoclaw.liveFeed.broadcastToolErrors'] = false
      const delivered = await service.broadcastToolEvent({
        workspaceId: 'ws-1',
        requesterIdentity: 'alice',
        serverName: 'github',
        toolName: 'search_code',
        kind: 'error',
        error: 'boom',
      })
      expect(delivered).toBe(0)
      configValues['appConfig.holoclaw.liveFeed.broadcastToolErrors'] = true
    })
  })

  describe('broadcastToConnections', () => {
    it('sends to a list of connections directly', async () => {
      const delivered = await service.broadcastToConnections(['conn-a', 'conn-b'], 'direct')
      expect(delivered).toBe(2)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it('returns 0 for empty connection list', async () => {
      const delivered = await service.broadcastToConnections([], 'direct')
      expect(delivered).toBe(0)
      expect(mockSend).not.toHaveBeenCalled()
    })
  })
})
