import { BroadcastService } from './broadcast.service'
import { LiveFeedCallbackHandler, LiveFeedContext } from './live-feed-callback.handler'

describe('LiveFeedCallbackHandler', () => {
  let broadcast: { broadcastToolEvent: jest.Mock }
  let handler: LiveFeedCallbackHandler
  const context: LiveFeedContext = {
    workspaceId: 'ws-1',
    requesterIdentity: 'alice',
    excludeConnectionId: 'conn-a',
    verbosity: 'verbose',
  }

  function serialized(name: string) {
    return { name, id: ['langchain', 'tools', name] } as any
  }

  beforeEach(() => {
    broadcast = { broadcastToolEvent: jest.fn().mockResolvedValue(1) }
    handler = new LiveFeedCallbackHandler(broadcast as unknown as BroadcastService, context)
  })

  it('parses mcp_<server>_<tool> into serverName + toolName', async () => {
    await handler.handleToolStart(serialized('mcp_github_search_code'), '{"q":"foo"}', 'run-1', undefined, [], {}, 'mcp_github_search_code')
    expect(broadcast.broadcastToolEvent).toHaveBeenCalledTimes(1)
    const call = broadcast.broadcastToolEvent.mock.calls[0][0]
    expect(call.serverName).toBe('github')
    expect(call.toolName).toBe('search_code')
    expect(call.kind).toBe('start')
    expect(call.workspaceId).toBe('ws-1')
    expect(call.requesterIdentity).toBe('alice')
    expect(call.excludeConnectionId).toBe('conn-a')
  })

  it('handles local (non-mcp) tool names', async () => {
    await handler.handleToolStart(serialized('statistics_fetcher'), '{}', 'run-2', undefined, [], {}, 'statistics_fetcher')
    const call = broadcast.broadcastToolEvent.mock.calls[0][0]
    expect(call.serverName).toBe('local')
    expect(call.toolName).toBe('statistics_fetcher')
  })

  it('emits end event with duration for same runId', async () => {
    const realNow = Date.now
    let t = 1000
    Date.now = jest.fn(() => t)
    try {
      await handler.handleToolStart(serialized('mcp_github_search_code'), '{}', 'run-3', undefined, [], {}, 'mcp_github_search_code')
      t = 1500
      await handler.handleToolEnd('result text', 'run-3')
    } finally {
      Date.now = realNow
    }
    expect(broadcast.broadcastToolEvent).toHaveBeenCalledTimes(2)
    const endCall = broadcast.broadcastToolEvent.mock.calls[1][0]
    expect(endCall.kind).toBe('end')
    expect(endCall.durationMs).toBe(500)
    expect(endCall.result).toBe('result text')
  })

  it('emits error event with message', async () => {
    await handler.handleToolStart(serialized('mcp_github_search_code'), '{}', 'run-4', undefined, [], {}, 'mcp_github_search_code')
    await handler.handleToolError(new Error('rate limited'), 'run-4')
    const errCall = broadcast.broadcastToolEvent.mock.calls[1][0]
    expect(errCall.kind).toBe('error')
    expect(errCall.error).toBe('rate limited')
  })

  it('drops state from startTimes + toolLabels on end', async () => {
    await handler.handleToolStart(serialized('mcp_github_search_code'), '{}', 'run-5', undefined, [], {}, 'mcp_github_search_code')
    await handler.handleToolEnd('done', 'run-5')
    // Calling handleToolEnd again for the same runId should be a no-op
    broadcast.broadcastToolEvent.mockClear()
    await handler.handleToolEnd('dup', 'run-5')
    expect(broadcast.broadcastToolEvent).not.toHaveBeenCalled()
  })

  it('ignores end/error events for unknown runIds', async () => {
    await handler.handleToolEnd('orphan', 'run-unknown')
    expect(broadcast.broadcastToolEvent).not.toHaveBeenCalled()
  })

  it('parses args in debug verbosity', async () => {
    const debugHandler = new LiveFeedCallbackHandler(broadcast as unknown as BroadcastService, {
      ...context,
      verbosity: 'debug',
    })
    await debugHandler.handleToolStart(
      serialized('mcp_github_search_code'),
      '{"q":"foo","limit":10}',
      'run-6',
      undefined,
      [],
      {},
      'mcp_github_search_code',
    )
    const call = broadcast.broadcastToolEvent.mock.calls[0][0]
    expect(call.args).toEqual({ q: 'foo', limit: 10 })
  })

  it('falls back to raw input if args JSON is malformed', async () => {
    const debugHandler = new LiveFeedCallbackHandler(broadcast as unknown as BroadcastService, {
      ...context,
      verbosity: 'debug',
    })
    await debugHandler.handleToolStart(
      serialized('mcp_github_search_code'),
      'not json',
      'run-7',
      undefined,
      [],
      {},
      'mcp_github_search_code',
    )
    const call = broadcast.broadcastToolEvent.mock.calls[0][0]
    expect(call.args).toEqual({ raw: 'not json' })
  })
})
