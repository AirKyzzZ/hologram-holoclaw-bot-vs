import { Logger } from '@nestjs/common'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { Serialized } from '@langchain/core/load/serializable'
import { BroadcastService } from './broadcast.service'

/**
 * Per-turn context passed from LlmService.generate() into the callback.
 * Captures the workspace scope + requester so the callback can fan out
 * tool events to every online workspace member.
 */
export interface LiveFeedContext {
  workspaceId: string
  requesterIdentity: string
  /** Exclude the requester's own connection from broadcasts (avoids self-echo). */
  excludeConnectionId?: string
  verbosity?: 'minimal' | 'verbose' | 'debug'
}

/**
 * LiveFeedCallbackHandler
 *
 * LangChain BaseCallbackHandler subclass that broadcasts tool execution
 * events to every online member of a HoloClaw workspace. Installed on the
 * AgentExecutor in LlmService.generate() only when there is an active
 * workspace context.
 *
 * Per turn, the sequence looks like:
 *   handleToolStart  → 🔧 [alice] calling github/search…
 *   <tool runs>
 *   handleToolEnd    → ✅ [alice] github/search complete (1.2s)
 *
 * On failure, handleToolError fires with ❌. Start/end/error delivery
 * respects the configured verbosity and the liveFeed.enabled flag.
 */
export class LiveFeedCallbackHandler extends BaseCallbackHandler {
  name = 'holoclaw_live_feed'
  private readonly logger = new Logger(LiveFeedCallbackHandler.name)

  /**
   * runId → start timestamp, for computing durationMs on handleToolEnd.
   */
  private readonly startTimes = new Map<string, number>()

  /**
   * runId → label, so handleToolEnd / handleToolError can recover the tool
   * name without relying on handleToolEnd's argument (which LangChain doesn't
   * populate with the original tool name).
   */
  private readonly toolLabels = new Map<string, { serverName: string; toolName: string }>()

  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly context: LiveFeedContext,
  ) {
    super()
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
  ): Promise<void> {
    try {
      const label = this.extractLabel(tool, runName)
      if (!label) return
      this.startTimes.set(runId, Date.now())
      this.toolLabels.set(runId, label)

      // Best-effort arg extraction for debug verbosity
      let args: Record<string, unknown> | undefined
      if (this.context.verbosity === 'debug') {
        try {
          args = JSON.parse(input)
        } catch {
          args = { raw: input.slice(0, 200) }
        }
      }

      await this.broadcastService.broadcastToolEvent({
        workspaceId: this.context.workspaceId,
        requesterIdentity: this.context.requesterIdentity,
        serverName: label.serverName,
        toolName: label.toolName,
        kind: 'start',
        args,
        verbosity: this.context.verbosity,
        excludeConnectionId: this.context.excludeConnectionId,
      })
    } catch (err) {
      this.logger.warn(`[LIVE_FEED] handleToolStart failed: ${err}`)
    }
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    try {
      const label = this.toolLabels.get(runId)
      if (!label) return
      const startedAt = this.startTimes.get(runId)
      const durationMs = startedAt ? Date.now() - startedAt : undefined
      await this.broadcastService.broadcastToolEvent({
        workspaceId: this.context.workspaceId,
        requesterIdentity: this.context.requesterIdentity,
        serverName: label.serverName,
        toolName: label.toolName,
        kind: 'end',
        result: output,
        durationMs,
        verbosity: this.context.verbosity,
        excludeConnectionId: this.context.excludeConnectionId,
      })
    } catch (err) {
      this.logger.warn(`[LIVE_FEED] handleToolEnd failed: ${err}`)
    } finally {
      this.startTimes.delete(runId)
      this.toolLabels.delete(runId)
    }
  }

  async handleToolError(err: unknown, runId: string): Promise<void> {
    try {
      const label = this.toolLabels.get(runId)
      if (!label) return
      const message = err instanceof Error ? err.message : String(err)
      await this.broadcastService.broadcastToolEvent({
        workspaceId: this.context.workspaceId,
        requesterIdentity: this.context.requesterIdentity,
        serverName: label.serverName,
        toolName: label.toolName,
        kind: 'error',
        error: message,
        verbosity: this.context.verbosity,
        excludeConnectionId: this.context.excludeConnectionId,
      })
    } catch (inner) {
      this.logger.warn(`[LIVE_FEED] handleToolError failed: ${inner}`)
    } finally {
      this.startTimes.delete(runId)
      this.toolLabels.delete(runId)
    }
  }

  /**
   * Parse a LangChain tool name to extract (serverName, toolName).
   * We use the convention from LlmService.buildMcpTools:
   *   mcp_<server>_<tool>
   * For non-MCP tools we fall back to ('local', toolName).
   */
  private extractLabel(tool: Serialized, runName?: string): { serverName: string; toolName: string } | null {
    const raw =
      runName ||
      ((tool as { id?: string[]; name?: string })?.name as string | undefined) ||
      ((tool as { id?: string[] }).id?.slice(-1)[0] as string | undefined)
    if (!raw) return null
    if (raw.startsWith('mcp_')) {
      // mcp_<server>_<tool> — server may itself contain underscores, so we
      // treat the first segment after "mcp_" as the server up to the next
      // underscore that is followed by a letter. Practical heuristic: split
      // on the first `_` after `mcp_`.
      const rest = raw.substring(4) // strip "mcp_"
      const firstUnderscore = rest.indexOf('_')
      if (firstUnderscore > 0) {
        return {
          serverName: rest.substring(0, firstUnderscore),
          toolName: rest.substring(firstUnderscore + 1),
        }
      }
      return { serverName: 'mcp', toolName: rest }
    }
    return { serverName: 'local', toolName: raw }
  }
}
