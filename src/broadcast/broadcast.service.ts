import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiClient, ApiVersion, TextMessage } from '@2060.io/vs-agent-nestjs-client'
import { WorkspaceMemberService } from '../workspace/workspace-member.service'

export interface BroadcastTextOptions {
  workspaceId: string
  text: string
  /** Omit messages to this connection (e.g., exclude the sender) */
  excludeConnectionId?: string
  /** Rate-limit concurrent delivery. Defaults to 10. */
  concurrency?: number
}

export interface BroadcastToolEventInput {
  workspaceId: string
  requesterIdentity: string
  serverName: string
  toolName: string
  kind: 'start' | 'end' | 'error'
  args?: Record<string, unknown>
  result?: string
  error?: string
  durationMs?: number
  verbosity?: 'minimal' | 'verbose' | 'debug'
  excludeConnectionId?: string
}

/**
 * BroadcastService — fan-out messaging to all online members of a workspace.
 *
 * Every HoloClaw multiplayer feature routes through here: join notifications,
 * live tool execution feed, approval broadcasts, workspace announcements.
 *
 * Implementation: iterate WorkspaceMember rows for the workspace (filtered to
 * those with a non-null connectionId), send one TextMessage per member via the
 * VS Agent admin API. DIDComm is point-to-point, so fan-out happens here.
 *
 * Delivery is best-effort per member: one failure does not block the others.
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name)
  private readonly apiClient: ApiClient

  constructor(
    private readonly memberService: WorkspaceMemberService,
    private readonly configService: ConfigService,
  ) {
    const baseUrl = this.configService.get<string>('appConfig.vsAgentAdminUrl') || 'http://localhost:3001'
    this.apiClient = new ApiClient(baseUrl, ApiVersion.V1)
  }

  /**
   * Send a plain text message to every online member of a workspace.
   * Returns the number of successfully delivered messages.
   */
  async broadcastText(options: BroadcastTextOptions): Promise<number> {
    const members = await this.memberService.onlineMembers(options.workspaceId)
    const targets = members
      .map((m) => m.connectionId)
      .filter((cid): cid is string => !!cid && cid !== options.excludeConnectionId)

    if (targets.length === 0) {
      this.logger.debug(`[BROADCAST] workspace=${options.workspaceId} no recipients`)
      return 0
    }

    this.logger.debug(
      `[BROADCAST] workspace=${options.workspaceId} → ${targets.length} recipient(s): "${options.text.slice(0, 80)}"`,
    )

    const delivered = await this.fanOut(targets, (connectionId) =>
      this.sendText(connectionId, options.text),
    )
    this.logger.log(
      `[BROADCAST] workspace=${options.workspaceId} delivered=${delivered}/${targets.length}`,
    )
    return delivered
  }

  /**
   * Send a tool execution lifecycle event to every online member of a workspace.
   * Respects the configured verbosity (minimal / verbose / debug).
   */
  async broadcastToolEvent(input: BroadcastToolEventInput): Promise<number> {
    const verbosity =
      input.verbosity ??
      (this.configService.get<string>('appConfig.holoclaw.liveFeed.verbosity') as
        | 'minimal'
        | 'verbose'
        | 'debug') ??
      'verbose'

    const enabled = this.configService.get<boolean>('appConfig.holoclaw.liveFeed.enabled') ?? true
    if (!enabled) return 0

    // Minimal: only final results. Verbose: start + result. Debug: everything including args.
    if (verbosity === 'minimal' && input.kind !== 'end') return 0

    const text = this.formatToolEvent(input, verbosity)
    if (!text) return 0

    return this.broadcastText({
      workspaceId: input.workspaceId,
      text,
      excludeConnectionId: input.excludeConnectionId,
    })
  }

  /**
   * Send the same text to a specific list of connections (bypasses workspace lookup).
   * Used when the caller already knows the recipients (e.g., approval notifications).
   */
  async broadcastToConnections(connectionIds: string[], text: string): Promise<number> {
    if (connectionIds.length === 0) return 0
    return this.fanOut(connectionIds, (connectionId) => this.sendText(connectionId, text))
  }

  /**
   * Send a text message to one specific connection.
   * Public wrapper around sendText for direct notifications.
   */
  async sendToConnection(connectionId: string, text: string): Promise<boolean> {
    return this.sendText(connectionId, text)
  }

  private async sendText(connectionId: string, text: string): Promise<boolean> {
    try {
      await this.apiClient.messages.send(
        new TextMessage({
          connectionId,
          content: text,
          timestamp: new Date(),
        }),
      )
      return true
    } catch (err) {
      this.logger.warn(`[BROADCAST] Failed to deliver to ${connectionId}: ${err}`)
      return false
    }
  }

  /**
   * Fan out an async operation over a list of connections with bounded concurrency.
   * Returns the count of successful deliveries.
   */
  private async fanOut(
    connectionIds: string[],
    deliver: (connectionId: string) => Promise<boolean>,
    concurrency = 10,
  ): Promise<number> {
    let successCount = 0
    let cursor = 0
    const worker = async () => {
      while (cursor < connectionIds.length) {
        const i = cursor++
        const cid = connectionIds[i]
        if (!cid) continue
        const ok = await deliver(cid)
        if (ok) successCount++
      }
    }
    const workerCount = Math.min(concurrency, connectionIds.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    return successCount
  }

  private formatToolEvent(input: BroadcastToolEventInput, verbosity: 'minimal' | 'verbose' | 'debug'): string | null {
    const actor = input.requesterIdentity || 'agent'
    const label = `${input.serverName}/${input.toolName}`
    switch (input.kind) {
      case 'start':
        if (verbosity === 'debug') {
          const argsJson = input.args ? JSON.stringify(input.args) : '{}'
          return `🔧 [${actor}] calling ${label}  args=${argsJson}`
        }
        return `🔧 [${actor}] calling ${label}…`
      case 'end': {
        const duration = input.durationMs ? ` (${input.durationMs}ms)` : ''
        if (verbosity === 'debug' && input.result) {
          const snippet = input.result.length > 300 ? input.result.slice(0, 300) + '…' : input.result
          return `✅ [${actor}] ${label} complete${duration}\n${snippet}`
        }
        return `✅ [${actor}] ${label} complete${duration}`
      }
      case 'error': {
        const broadcastErrors =
          this.configService.get<boolean>('appConfig.holoclaw.liveFeed.broadcastToolErrors') ?? true
        if (!broadcastErrors) return null
        return `❌ [${actor}] ${label} failed: ${input.error ?? 'unknown error'}`
      }
    }
  }
}
