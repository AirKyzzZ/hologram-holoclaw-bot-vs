import {
  ApiClient,
  ApiVersion,
  EventHandler,
  StatProducerService,
  BaseMessage,
  ContextualMenuItem,
  ContextualMenuSelectMessage,
  ContextualMenuUpdateMessage,
  IdentityProofRequestMessage,
  IdentityProofSubmitMessage,
  MediaMessage,
  MenuDisplayMessage,
  MenuSelectMessage,
  ProfileMessage,
  StatEnum,
  TextMessage,
  VerifiableCredentialRequestedProofItem,
  VerifiableCredentialSubmittedProofItem,
} from '@2060.io/vs-agent-nestjs-client'
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common'
import { SessionEntity } from './models'
import { JsonTransformer } from '@credo-ts/core'
import { STAT_KPI } from './common'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { OnEvent } from '@nestjs/event-emitter'
import { StateStep } from './common/enums/state-step.enum'
import { ChatbotService } from '../chatbot/chatbot.service'
import { MemoryService } from '../memory/memory.service'
import { AgentContentService } from './agent-content.service'
import { McpConfigService } from '../mcp/mcp-config.service'
import { McpService } from '../mcp/mcp.service'
import { RbacService } from '../rbac/rbac.service'
import { ApprovalService } from '../rbac/approval.service'
import type { AuthFlowConfig } from '../config/agent-pack.loader'
import { WorkspaceService } from '../workspace/workspace.service'
import { WorkspaceMemberService } from '../workspace/workspace-member.service'
import { InviteService } from '../workspace/invite.service'
import { WorkspaceMcpService } from '../workspace/workspace-mcp.service'
import { BroadcastService } from '../broadcast/broadcast.service'
import { SttService } from '../stt/stt.service'
import { WorkspaceEntity } from '../workspace/workspace.entity'

@Injectable()
export class CoreService implements EventHandler, OnModuleInit {
  private readonly apiClient: ApiClient
  private readonly logger = new Logger(CoreService.name)

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly configService: ConfigService,
    private readonly chatBotService: ChatbotService,
    private readonly memoryService: MemoryService,
    @Optional() private readonly statProducer: StatProducerService,
    private readonly agentContent: AgentContentService,
    private readonly mcpConfigService: McpConfigService,
    private readonly mcpService: McpService,
    @Optional() private readonly rbacService: RbacService,
    @Optional() private readonly approvalService: ApprovalService,
    private readonly workspaceService: WorkspaceService,
    private readonly memberService: WorkspaceMemberService,
    private readonly inviteService: InviteService,
    private readonly workspaceMcpService: WorkspaceMcpService,
    private readonly broadcastService: BroadcastService,
    private readonly sttService: SttService,
  ) {
    const baseUrl = configService.get<string>('appConfig.vsAgentAdminUrl') || 'http://localhost:3001'
    this.apiClient = new ApiClient(baseUrl, ApiVersion.V1)
    this.menuItems = this.agentContent.getMenuItems()
    this.menuActions = this.menuItems.reduce<Record<string, string | undefined>>((acc, item) => {
      if (item.action) acc[item.id] = item.action
      return acc
    }, {})
    this.welcomeFlowConfig = this.agentContent.getWelcomeFlowConfig()
    this.authFlowConfig = this.agentContent.getAuthFlowConfig()
    this.credentialDefinitionId = this.authFlowConfig.credentialDefinitionId
    this.logger.log(
      `[INIT] authFlowConfig: enabled=${this.authFlowConfig.enabled}, credDefId=${this.credentialDefinitionId?.substring(0, 40)}..., adminAvatars=${JSON.stringify(this.authFlowConfig.adminAvatars)}`,
    )
    this.logger.log(`[INIT] menuItems: ${JSON.stringify(this.menuItems.map((i) => i.id))}`)
  }

  private readonly menuItems: {
    id: string
    labelKey?: string
    label?: string
    action?: string
    visibleWhen?: string
    badge?: string
  }[]
  private readonly menuActions: Record<string, string | undefined>
  private readonly welcomeFlowConfig: { enabled: boolean; sendOnProfile: boolean; templateKey: string }
  private readonly authFlowConfig: AuthFlowConfig
  private readonly credentialDefinitionId?: string

  private isAdmin(session: SessionEntity): boolean {
    // New RBAC: check adminUsers by identity
    if (session.userIdentity && this.rbacService?.isAdminUser(session.userIdentity)) {
      return true
    }
    // Legacy: check adminAvatars by userName
    if (!session.userName) return false
    const normalize = (s: string) => s.replace(/^@/, '').toLowerCase()
    const name = normalize(session.userName)
    return this.authFlowConfig.adminAvatars.some((a) => normalize(a) === name)
  }

  async onModuleInit() {}

  /**
   * Handles incoming messages and manages the input flow.
   * Routes the message to the appropriate handler based on its type.
   *
   * @param message - The incoming message to process.
   */
  async inputMessage(message: BaseMessage): Promise<void> {
    let content
    const session: SessionEntity = await this.handleSession(message.connectionId)

    try {
      this.logger.debug('inputMessage: ' + JSON.stringify(message))

      switch (message.type) {
        case TextMessage.type:
          content = JsonTransformer.fromJSON(message, TextMessage)
          //entry message user to chatbot agent service ,send session connection
          break
        case ContextualMenuSelectMessage.type: {
          const inMsg = JsonTransformer.fromJSON(
            message,
            ContextualMenuSelectMessage,
          ) as unknown as ContextualMenuSelectMessage
          const selectionId = inMsg.selectionId as string | undefined
          const action = selectionId ? this.menuActions[selectionId] : undefined
          if (selectionId && action) {
            this.logger.debug(`ContextualMenuSelectMessage with selectionId: ${selectionId} and action: ${action}`)
            await this.handleContextualAction(action, session)
          } else {
            this.logger.warn(`Invalid or missing selectionId: ${selectionId}`)
          }
          break
        }
        case MenuSelectMessage.type: {
          const rawItems = (message as any).menuItems as Array<{ id: string }> | undefined
          const selectedId = rawItems?.[0]?.id
          if (selectedId && selectedId.startsWith('switch-workspace:')) {
            // HoloClaw: workspace picker selection — dispatch via handleContextualAction
            await this.handleContextualAction(selectedId, session)
          } else if (session.state === StateStep.MCP_CONFIG && !session.mcpConfigServer && rawItems?.length) {
            if (selectedId) {
              await this.startMcpConfigForServer(selectedId, session)
            }
          }
          break
        }
        case MediaMessage.type: {
          const mediaMsg = JsonTransformer.fromJSON(message, MediaMessage)
          const audioItem = mediaMsg.items?.find((item) => this.sttService.isAudioMimeType(item.mimeType))

          if (audioItem && this.sttService.isEnabled) {
            if (!this.sttService.isAllowed(session.isAuthenticated ?? false)) {
              this.logger.log(`[STT] Blocked voice note from unauthenticated user ${session.connectionId}`)
              await this.sendText(session.connectionId, this.getText('VOICE_AUTH_REQUIRED', session.lang), session.lang)
              break
            }
            try {
              const result = await this.sttService.transcribeFromUrl(
                audioItem.uri,
                audioItem.mimeType,
                audioItem.ciphering,
              )
              const text = result.text.trim()
              if (text.length === 0) {
                this.logger.log(`[STT] Empty transcript for voice note from ${session.connectionId}`)
                await this.sendText(
                  session.connectionId,
                  this.getText('VOICE_TRANSCRIPTION_EMPTY', session.lang),
                  session.lang,
                )
                break
              }
              content = new TextMessage({
                connectionId: message.connectionId,
                content: `[Voice note] ${text}`,
                ...(message.threadId ? { threadId: message.threadId } : {}),
              })
            } catch (err) {
              this.logger.error(`[STT] Transcription failed: ${err}`)
              await this.sendText(session.connectionId, this.getText('ERROR_MESSAGES', session.lang), session.lang)
            }
            break
          }

          // Non-audio media (or STT disabled): hand the LLM a bounded text
          // stub so it still has context for what the user sent.
          {
            const desc = (mediaMsg.items ?? []).map((it) => it.mimeType).join(', ')
            content = new TextMessage({
              connectionId: message.connectionId,
              content: `[Media received: ${desc || 'unknown'}]`,
              ...(message.threadId ? { threadId: message.threadId } : {}),
            })
          }
          break
        }
        case ProfileMessage.type: {
          const inMsg = JsonTransformer.fromJSON(message, ProfileMessage) as unknown as ProfileMessage
          if (inMsg.preferredLanguage) {
            session.lang = inMsg.preferredLanguage
          }
          if (this.welcomeFlowConfig.enabled && this.welcomeFlowConfig.sendOnProfile) {
            await this.sendGreetingMessage(session.connectionId)
          }
          break
        }
        case IdentityProofSubmitMessage.type:
          content = JsonTransformer.fromJSON(message, IdentityProofSubmitMessage)
          break
        default:
          break
      }

      if (content != null) {
        if (typeof content === 'string') content = content.trim()
        if (typeof content === 'string' && content.length === 0) {
          content = null
        }
      }
    } catch (error) {
      this.logger.error(`inputMessage: ${error}`)
    }
    await this.handleStateInput(content, session)
  }

  /**
   * Handles the `ConnectionStateUpdated` event for establishing a new connection.
   *
   * HoloClaw: new connections land in LOBBY unless the user already has an
   * active workspace membership that can be reconciled (reconnect after restart).
   */
  async newConnection(connectionId: string): Promise<void> {
    const session = await this.handleSession(connectionId)
    await this.sendStats(STAT_KPI.USER_CONNECTED, session)

    // Try to reconcile an existing membership by connectionId (reconnect path)
    try {
      const memberships = await this.memberService.findByConnection(connectionId)
      if (memberships.length > 0 && !session.activeWorkspaceId) {
        session.activeWorkspaceId = memberships[0].workspaceId
        session.state = StateStep.CHAT
        await this.sessionRepository.save(session)
        this.logger.log(
          `[HOLOCLAW] Reconciled connection ${connectionId} with existing workspace ${session.activeWorkspaceId}`,
        )
      }
    } catch (err) {
      this.logger.warn(`[HOLOCLAW] Membership reconcile failed: ${err}`)
    }

    // Send welcome text for lobby users so they know what to do
    if (session.state === StateStep.LOBBY) {
      await this.sendText(connectionId, this.getText('LOBBY_WELCOME', session.lang), session.lang)
    }
    await this.sendContextualMenu(session)
  }

  /**
   * Handles the `ConnectionStateUpdated` event to close an active connection.
   *
   * This method is part of the event handler implementation for managing
   * connection lifecycle events. It ensures that the session associated with
   * the given connection is updated and purged of sensitive or user-specific data
   * before finalizing the connection closure.
   *
   * Steps:
   * 1. Retrieves the session associated with the `connectionId` from the event.
   * 2. Purges user-specific data from the session using `purgeUserData`,
   *    resetting the session state and clearing sensitive fields.
   *
   * @param event - The `ConnectionStateUpdated` event containing details of
   *                the connection to be closed (e.g., `connectionId`).
   *
   * @returns {Promise<void>} - Resolves when the connection is successfully closed
   *                            and the session is updated.
   *
   * @note This method ensures that the session's `connectionId` and other essential
   *       metadata remain intact while cleaning up unnecessary or sensitive data.
   */
  async closeConnection(connectionId: string): Promise<void> {
    const session = await this.handleSession(connectionId)
    await this.purgeUserData(session)
  }

  private async sendGreetingMessage(connectionId: string) {
    const userLang = (await this.handleSession(connectionId)).lang

    const greetingMessage = this.agentContent.getGreetingMessage(userLang, this.welcomeFlowConfig.templateKey)
    this.logger.debug(`LLM generated answer: "${greetingMessage}"`)
    await this.sendText(connectionId, greetingMessage, userLang)
  }

  /**
   * Sends a text message to a specific connection.
   *
   * @param connectionId - Identifier of the target connection.
   * @param text - The content of the message.
   * @param lang - The language of the message.
   */
  private async sendText(connectionId: string, text: string, lang: string) {
    await this.apiClient.messages.send(
      new TextMessage({
        connectionId: connectionId,
        content: this.getText(text, lang),
      }),
    )
  }

  /**
   * Retrieves localized text for the given key and language.
   *
   * @param text - The key for the desired text.
   * @param lang - The language of the text.
   */
  private getText(key: string, lang: string): string {
    return this.agentContent.getString(lang ?? this.agentContent.getDefaultLanguage(), key)
  }

  /**
   * Processes actions related to `ContextualMenuSelectMessage` messages.
   * Updates the session based on the selected option.
   *
   * @param action - The resolved action name (e.g. 'authenticate', 'logout', 'mcp-config').
   * @param session - The current session associated with the message.
   */
  private async handleContextualAction(action: string, session: SessionEntity): Promise<SessionEntity> {
    const { connectionId, lang } = session

    // HoloClaw: dynamic prefix-based actions (switch-workspace:<id>, invite-member:<role>, …)
    if (action.startsWith('switch-workspace:')) {
      await this.handleSwitchWorkspace(action.substring('switch-workspace:'.length), session)
      return await this.sessionRepository.save(session)
    }

    // Actions available regardless of state (LOBBY or CHAT) — workspace navigation
    if (action === 'create-workspace') {
      await this.startCreateWorkspaceFlow(session)
      return await this.sessionRepository.save(session)
    }
    if (action === 'join-workspace') {
      await this.startJoinWorkspaceFlow(session)
      return await this.sessionRepository.save(session)
    }
    if (action === 'switch-workspace') {
      await this.showWorkspacePicker(session)
      return await this.sessionRepository.save(session)
    }
    if (action === 'leave-workspace') {
      await this.handleLeaveWorkspace(session)
      return await this.sessionRepository.save(session)
    }
    if (action === 'invite-member') {
      await this.handleCreateInvite(session)
      return await this.sessionRepository.save(session)
    }
    if (action === 'add-mcp-server') {
      await this.startAddMcpServerFlow(session)
      return await this.sessionRepository.save(session)
    }

    switch (session.state) {
      case StateStep.CHAT: {
        this.logger.debug(`this.authFlowConfig.enabled: ${this.authFlowConfig.enabled}`)
        if (action === 'authenticate' && this.authFlowConfig.enabled) {
          const credentialDefinitionId = this.credentialDefinitionId
          this.logger.debug(`credentialDefinition: ${credentialDefinitionId}`)
          if (!credentialDefinitionId) {
            throw new Error('Missing config: credentialDefinitionId')
          }

          const body = new IdentityProofRequestMessage({
            connectionId,
            requestedProofItems: [],
          })
          const requestedProofItem = new VerifiableCredentialRequestedProofItem({
            id: '1',
            type: 'verifiable-credential',
            credentialDefinitionId,
          })
          body.requestedProofItems.push(requestedProofItem)

          await this.apiClient.messages.send(body)

          session.state = StateStep.AUTH
          this.logger.debug(`[AUTH] Proof request sent to ${connectionId}`)
          await this.sendText(connectionId, this.getText('AUTH_PROCESS_STARTED', lang), lang)
        }

        if (action === 'logout') {
          await this.sendText(connectionId, this.getText('LOGOUT_CONFIRMATION', lang), lang)
          session.isAuthenticated = false
          session.userName = ''
          await this.sessionRepository.save(session)
          await this.closeConnection(connectionId)
          await this.memoryService.clear(connectionId)
        }

        if (action === 'mcp-config') {
          await this.beginMcpConfigFlow(session)
        }

        if (action === 'my-approval-requests') {
          await this.handleMyApprovalRequests(session)
        }

        if (action === 'pending-approvals') {
          await this.handlePendingApprovals(session)
        }
        break
      }
      case StateStep.MCP_CONFIG: {
        if (action === 'abort-config') {
          await this.abortMcpConfigFlow(session)
        }
        break
      }
      default:
        break
    }
    return await this.sessionRepository.save(session)
  }

  /**
   * Handles message input using a state machine.
   * Determines the next session state based on the message content.
   *
   * @param content - The content of the message.
   * @param session - The active session to update.
   */
  private async handleStateInput(content: unknown, session: SessionEntity): Promise<SessionEntity> {
    const { connectionId, lang: userLang } = session
    this.logger.debug(`New Message ${JSON.stringify(content)}`)
    try {
      switch (session.state) {
        case StateStep.LOBBY:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()
            if (textContent.length === 0) break
            // Convenience: if it looks like an invite token (base64url, 20+ chars, no spaces),
            // try redeeming immediately. Otherwise nudge the user to use the menu.
            if (/^[A-Za-z0-9_-]{20,}$/.test(textContent)) {
              await this.tryRedeemInvite(textContent, session)
            } else {
              await this.sendText(connectionId, this.getText('LOBBY_NO_ACTIONS', userLang), userLang)
            }
          }
          break

        case StateStep.CREATE_WORKSPACE:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()
            await this.handleCreateWorkspaceInput(textContent, session)
          }
          break

        case StateStep.JOIN_WORKSPACE:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()
            if (textContent.length > 0) {
              await this.tryRedeemInvite(textContent, session)
            }
          }
          break

        case StateStep.ADD_MCP_SERVER:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()
            await this.handleAddMcpServerInput(textContent, session)
          }
          break

        case StateStep.CHAT:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()

            // Guest access check: when auth is required, block unauthenticated messages
            if (textContent.length > 0 && !session.isAuthenticated && this.authFlowConfig.required) {
              this.logger.log(`[GUEST] Blocked message from unauthenticated user ${connectionId}`)
              await this.sendText(connectionId, this.getText('AUTH_REQUIRED', userLang), userLang)
              break
            }

            // HoloClaw: no active workspace means the user was moved to CHAT
            // by a legacy flow. Bounce them back to LOBBY rather than letting
            // them talk to a connection-scoped LLM.
            if (textContent.length > 0 && !session.activeWorkspaceId) {
              await this.sendText(connectionId, this.getText('WORKSPACE_NOT_IN_WORKSPACE', userLang), userLang)
              session.state = StateStep.LOBBY
              break
            }

            // HoloClaw observer guard: observers cannot talk to the LLM.
            if (textContent.length > 0 && session.activeWorkspaceId) {
              const ctx = await this.resolveWorkspaceContext(session)
              if (ctx.memberRole === 'observer') {
                this.logger.log(`[HOLOCLAW] Observer ${this.resolveMemberIdentity(session)} blocked in chat`)
                await this.sendText(connectionId, this.getText('WORKSPACE_OBSERVER_READONLY', userLang), userLang)
                break
              }
              // Update lastSeenAt for presence tracking
              const member = await this.memberService.findByIdentityInWorkspace(
                session.activeWorkspaceId,
                this.resolveMemberIdentity(session),
              )
              if (member) await this.memberService.touch(member)
            }

            if (textContent.length > 0) {
              const answer = await this.chatBotService.chat({
                userInput: textContent,
                session,
                isAdmin: this.isAdmin(session),
              })
              await this.sendText(connectionId, answer, userLang)
            }
          }

          break
        case StateStep.AUTH:
          if (
            typeof content === 'object' &&
            content !== null &&
            'type' in content &&
            (content as IdentityProofSubmitMessage).type === IdentityProofSubmitMessage.type &&
            'submittedProofItems' in content
          ) {
            const submitMessage = content as IdentityProofSubmitMessage
            const proofItem = submitMessage.submittedProofItems?.[0] as
              | VerifiableCredentialSubmittedProofItem
              | undefined

            if (proofItem?.type === VerifiableCredentialSubmittedProofItem.type && !proofItem.errorCode) {
              session.isAuthenticated = true

              const claims = proofItem.claims as { name: string; value: string }[] | undefined
              if (claims) {
                const firstName = claims.find((c) => c.name === 'firstName')?.value
                const lastName = claims.find((c) => c.name === 'lastName')?.value
                const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
                session.userName = fullName || claims.find((c) => c.name === 'name')?.value || ''

                // RBAC: extract identity and roles from credential attributes
                if (this.rbacService) {
                  const claimsMap: Record<string, string> = {}
                  for (const c of claims) {
                    claimsMap[c.name] = c.value
                  }
                  session.userIdentity = this.rbacService.resolveIdentity(claimsMap)
                  session.userRoles = this.rbacService.resolveRoles(claimsMap)
                  this.logger.log(
                    `[AUTH] RBAC: identity="${session.userIdentity}", roles=${JSON.stringify(session.userRoles)}`,
                  )
                }
              }

              session.state = StateStep.CHAT
              await this.sessionRepository.save(session)

              const isAdmin = this.isAdmin(session)
              this.logger.log(`[AUTH] User ${connectionId} authenticated as "${session.userName}" (admin=${isAdmin})`)
              const message = session.userName
                ? this.getText('AUTH_SUCCESS_NAME', userLang).replace('{name}', session.userName)
                : this.getText('AUTH_SUCCESS', userLang)

              await this.sendText(connectionId, message, userLang)
            } else if (proofItem?.errorCode) {
              this.logger.warn(`[AUTH] Proof submission failed with error: ${proofItem.errorCode}`)
              await this.sendText(
                connectionId,
                `${this.getText('AUTH_ERROR', userLang)}: ${proofItem.errorCode}`,
                userLang,
              )
            } else {
              await this.sendText(connectionId, this.getText('WAITING_CREDENTIAL', userLang), userLang)
            }
          } else {
            await this.sendText(connectionId, this.getText('WAITING_CREDENTIAL', userLang), userLang)
          }
          break
        case StateStep.MCP_CONFIG:
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            typeof (content as Record<string, unknown>).content === 'string'
          ) {
            const textContent = (content as { content: string }).content.trim()
            if (textContent.length > 0) {
              await this.handleMcpConfigInput(textContent, session)
            }
          }
          break
        default:
          break
      }
    } catch (error) {
      this.logger.error('handleStateInput: ' + error)
      await this.sendText(connectionId, this.getText('ERROR_MESSAGES', userLang), userLang)
    }
    return await this.sendContextualMenu(session)
  }

  /**
   * Retrieves or initializes the session associated with a specific connection.
   * Ensures consistent and secure operations.
   *
   * @param connectionId - Identifier of the active connection.
   */
  private async handleSession(connectionId: string): Promise<SessionEntity> {
    let session = await this.sessionRepository.findOneBy({
      connectionId: connectionId,
    })
    this.logger.debug('handleSession session: ' + JSON.stringify(session))

    if (!session) {
      // HoloClaw: new sessions start in LOBBY; multi-tenant is the default.
      session = this.sessionRepository.create({
        connectionId: connectionId,
        state: StateStep.LOBBY,
        isAuthenticated: false,
      })

      await this.sessionRepository.save(session)
      this.logger.debug('New session: ' + JSON.stringify(session))
    }
    return await this.sessionRepository.save(session)
  }

  /**
   * Resolve the member identity for a session. Falls back to connectionId when
   * the user is unauthenticated so HoloClaw works without verifiable credentials.
   */
  private resolveMemberIdentity(session: SessionEntity): string {
    return session.userIdentity || session.userName || session.connectionId
  }

  /**
   * Is this connection the owner/admin of the active workspace?
   * Synchronous cache via resolveWorkspaceContext; prefer that for menu resolution.
   */
  private async isWorkspaceAdmin(session: SessionEntity): Promise<boolean> {
    if (!session.activeWorkspaceId) return false
    return this.workspaceService.isOwner(session.activeWorkspaceId, this.resolveMemberIdentity(session))
  }

  /**
   * Pre-resolve workspace context for menu visibility. Called once per menu
   * refresh so the synchronous isMenuItemVisible() can answer role predicates.
   */
  private async resolveWorkspaceContext(session: SessionEntity): Promise<{
    activeWorkspace: WorkspaceEntity | null
    isWorkspaceAdmin: boolean
    memberRole: string | null
  }> {
    if (!session.activeWorkspaceId) {
      return { activeWorkspace: null, isWorkspaceAdmin: false, memberRole: null }
    }
    const identity = this.resolveMemberIdentity(session)
    const [activeWorkspace, member] = await Promise.all([
      this.workspaceService.findByIdOrNull(session.activeWorkspaceId),
      this.memberService.findByIdentityInWorkspace(session.activeWorkspaceId, identity),
    ])
    return {
      activeWorkspace,
      isWorkspaceAdmin: activeWorkspace?.ownerIdentity === identity,
      memberRole: member?.role ?? null,
    }
  }

  // Special flows
  /**
   * Purges user-specific data from the provided session.
   *
   * This method resets the session's `state` to `StateStep.START` and ensures that
   * any additional parameters in the session (user-specific or sensitive data)
   * are set to `null`. It updates the session in the database, keeping the
   * `connectionId`, `id`, `lang`, and timestamps intact.
   *
   * @param session - The session entity to be purged.
   *                  It must be a valid session retrieved from the database.
   *
   * @returns {Promise<SessionEntity>} - The updated session entity after the purge.
   *
   * @note This method should be used to reset a session to its initial state
   *       while preserving its connection details and essential metadata.
   */
  private async purgeUserData(session: SessionEntity): Promise<SessionEntity> {
    session.state = StateStep.START
    session.mcpConfigServer = undefined
    session.mcpConfigFieldIndex = undefined
    session.userIdentity = undefined
    session.userRoles = undefined
    return await this.sessionRepository.save(session)
  }

  private async sendContextualMenu(session: SessionEntity): Promise<SessionEntity> {
    const isConfiguring = session.state === StateStep.MCP_CONFIG

    // Resolve dynamic badge counts for approval menu items
    const badgeCounts = await this.resolveBadgeCounts(session)

    // HoloClaw: pre-resolve workspace context so isMenuItemVisible can answer
    // workspace-role predicates synchronously.
    const workspaceCtx = await this.resolveWorkspaceContext(session)

    const options: ContextualMenuItem[] = this.menuItems
      .filter(
        (item) =>
          this.isMenuItemVisible(item.visibleWhen, session, isConfiguring, badgeCounts, workspaceCtx) &&
          this.isMenuActionEnabled(item.action),
      )
      .map((item) => {
        let title = item.label ?? this.getText(item.labelKey ?? item.id, session.lang)
        // Prepend badge count if configured
        if (item.badge && badgeCounts[item.badge] > 0) {
          title = `(${badgeCounts[item.badge]}) ${title}`
        }
        return new ContextualMenuItem({ id: item.id, title })
      })

    this.logger.log(
      `[MENU] options=${options.length}, isAuth=${session.isAuthenticated}, items=${this.menuItems.length}`,
    )
    if (options.length === 0) {
      this.logger.log('[MENU] Skipping contextual menu: no visible options.')
      return await this.sessionRepository.save(session)
    }

    const title = this.getText('ROOT_TITLE', session.lang)
    const description = session.isAuthenticated
      ? session.userName
        ? `Authenticated as ${session.userName}${this.isAdmin(session) ? ' (Admin)' : ''}`
        : 'Authenticated'
      : 'Not Authenticated'

    this.logger.log(
      `[MENU] Sending ContextualMenuUpdate: title="${title}", desc="${description}", options=${JSON.stringify(options.map((o) => o.id))}`,
    )
    await this.apiClient.messages.send(
      new ContextualMenuUpdateMessage({
        title,
        description,
        connectionId: session.connectionId,
        options,
        timestamp: new Date(),
      }),
    )
    this.logger.log(`[MENU] ContextualMenuUpdate sent successfully.`)
    return await this.sessionRepository.save(session)
  }

  /**
   * Resolve dynamic badge counts for approval-related menu items.
   */
  private async resolveBadgeCounts(session: SessionEntity): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      approvalRequestCount: 0,
      pendingApprovalCount: 0,
    }

    if (!this.approvalService || !session.isAuthenticated) return counts

    if (session.userIdentity) {
      counts.approvalRequestCount = await this.approvalService.countByRequester(session.userIdentity)
    }

    if (session.userRoles?.length) {
      counts.pendingApprovalCount = await this.approvalService.countPendingForApprover(session.userRoles)
    }

    return counts
  }

  async sendStats(kpi: STAT_KPI, session: SessionEntity) {
    this.logger.debug(`***send stats***`)
    const stats = [STAT_KPI[kpi]]
    if (session !== null && this.statProducer)
      await this.statProducer.spool(stats, session.connectionId, [new StatEnum(0, 'string')])
  }

  private isMenuItemVisible(
    visibleWhen: string | undefined,
    session: SessionEntity,
    isConfiguring = false,
    badgeCounts: Record<string, number> = {},
    workspaceCtx: { isWorkspaceAdmin: boolean; memberRole: string | null; activeWorkspace: WorkspaceEntity | null } = {
      isWorkspaceAdmin: false,
      memberRole: null,
      activeWorkspace: null,
    },
  ) {
    const isAuthenticated = session.isAuthenticated ?? false
    const inWorkspace = !!session.activeWorkspaceId
    switch (visibleWhen) {
      case 'authenticated':
        return !!isAuthenticated
      case 'unauthenticated':
        return !isAuthenticated
      case 'configuring':
        return isConfiguring
      case 'notConfiguring':
        return !!isAuthenticated && !isConfiguring
      case 'hasApprovalRequests':
        return !!isAuthenticated && (badgeCounts.approvalRequestCount ?? 0) > 0
      case 'hasPendingApprovals':
        return !!isAuthenticated && (badgeCounts.pendingApprovalCount ?? 0) > 0
      // HoloClaw predicates
      case 'inWorkspace':
        return inWorkspace
      case 'noWorkspace':
        return !inWorkspace
      case 'isWorkspaceAdmin':
        return inWorkspace && workspaceCtx.isWorkspaceAdmin
      default:
        return true
    }
  }

  private isMenuActionEnabled(action?: string) {
    if (!action) return true
    if (action === 'authenticate')
      return this.authFlowConfig.enabled && !!this.authFlowConfig.credentialDefinitionId?.trim()
    if (action === 'mcp-config')
      return this.mcpConfigService.isAvailable && this.agentContent.getUserControlledServers().length > 0
    return true
  }

  // ── Approval Menu Handlers ─────────────────────────────────────

  /**
   * Show the user's own pending approval requests. They can cancel them.
   */
  private async handleMyApprovalRequests(session: SessionEntity): Promise<void> {
    if (!this.approvalService || !session.userIdentity) return
    const requests = await this.approvalService.getByRequester(session.userIdentity)
    if (requests.length === 0) {
      await this.sendText(session.connectionId, this.getText('NO_APPROVAL_REQUESTS', session.lang), session.lang)
      return
    }

    const menuItems = requests.map((r) => ({
      id: `cancel-approval:${r.id}`,
      text: `${r.toolName} (${r.serverName}) - ${r.createdAt.toISOString().split('T')[0]}`,
      action: `cancel-approval:${r.id}`,
    }))

    await this.apiClient.messages.send(
      new MenuDisplayMessage({
        connectionId: session.connectionId,
        prompt: this.getText('MY_APPROVAL_REQUESTS_PROMPT', session.lang),
        menuItems,
      }),
    )
  }

  /**
   * Show pending approval requests the user can approve/reject.
   */
  private async handlePendingApprovals(session: SessionEntity): Promise<void> {
    if (!this.approvalService || !session.userRoles?.length) return
    const requests = await this.approvalService.getPendingForApprover(session.userRoles)
    if (requests.length === 0) {
      await this.sendText(session.connectionId, this.getText('NO_PENDING_APPROVALS', session.lang), session.lang)
      return
    }

    const menuItems = requests.map((r) => ({
      id: `review-approval:${r.id}`,
      text: `${r.requesterIdentity}: ${r.toolName} (${r.serverName})`,
      action: `review-approval:${r.id}`,
    }))

    await this.apiClient.messages.send(
      new MenuDisplayMessage({
        connectionId: session.connectionId,
        prompt: this.getText('PENDING_APPROVALS_PROMPT', session.lang),
        menuItems,
      }),
    )
  }

  /**
   * Handle menu.refresh events emitted by ApprovalEventHandler.
   */
  @OnEvent('menu.refresh')
  async onMenuRefresh(payload: { connectionId: string }): Promise<void> {
    this.logger.debug(`[EVENT] menu.refresh for ${payload.connectionId}`)
    try {
      const session = await this.sessionRepository.findOne({
        where: { connectionId: payload.connectionId },
      })
      if (session) {
        await this.sendContextualMenu(session)
      }
    } catch (err) {
      this.logger.error(`[EVENT] Error refreshing menu for ${payload.connectionId}: ${err}`)
    }
  }

  // ── HoloClaw Workspace Flows ─────────────────────────────────────

  /**
   * Enter CREATE_WORKSPACE state and prompt for the workspace name.
   */
  private async startCreateWorkspaceFlow(session: SessionEntity): Promise<void> {
    session.state = StateStep.CREATE_WORKSPACE
    session.workspaceFlowStep = 'name'
    session.workspaceFlowData = {}
    await this.sessionRepository.save(session)
    await this.sendText(session.connectionId, this.getText('WORKSPACE_CREATE_PROMPT_NAME', session.lang), session.lang)
  }

  private async handleCreateWorkspaceInput(text: string, session: SessionEntity): Promise<void> {
    const { lang } = session
    const step = session.workspaceFlowStep ?? 'name'
    const data = (session.workspaceFlowData ?? {}) as { name?: string; goal?: string }

    if (step === 'name') {
      if (!text) {
        await this.sendText(session.connectionId, this.getText('WORKSPACE_NAME_EMPTY', lang), lang)
        return
      }
      data.name = text
      session.workspaceFlowData = data
      session.workspaceFlowStep = 'goal'
      await this.sessionRepository.save(session)
      await this.sendText(session.connectionId, this.getText('WORKSPACE_CREATE_PROMPT_GOAL', lang), lang)
      return
    }

    if (step === 'goal') {
      const normalizedGoal = text.toLowerCase() === 'skip' ? undefined : text || undefined
      try {
        const workspace = await this.workspaceService.create({
          name: data.name!,
          goal: normalizedGoal,
          ownerIdentity: this.resolveMemberIdentity(session),
          ownerConnectionId: session.connectionId,
        })
        session.activeWorkspaceId = workspace.id
        session.state = StateStep.CHAT
        session.workspaceFlowStep = undefined
        session.workspaceFlowData = undefined
        await this.sessionRepository.save(session)
        await this.sendText(
          session.connectionId,
          this.getText('WORKSPACE_CREATE_SUCCESS', lang).replace('{name}', workspace.name),
          lang,
        )
      } catch (err) {
        this.logger.error(`[HOLOCLAW] create workspace failed: ${err}`)
        const msg = err instanceof Error ? err.message : String(err)
        await this.sendText(session.connectionId, msg, lang)
        session.state = StateStep.LOBBY
        session.workspaceFlowStep = undefined
        session.workspaceFlowData = undefined
        await this.sessionRepository.save(session)
      }
    }
  }

  /**
   * Enter JOIN_WORKSPACE state and prompt for the invite token.
   */
  private async startJoinWorkspaceFlow(session: SessionEntity): Promise<void> {
    session.state = StateStep.JOIN_WORKSPACE
    session.workspaceFlowStep = 'token'
    await this.sessionRepository.save(session)
    await this.sendText(session.connectionId, this.getText('WORKSPACE_JOIN_PROMPT', session.lang), session.lang)
  }

  /**
   * Validate and redeem an invite token. Works from both JOIN_WORKSPACE state
   * and directly-pasted LOBBY text.
   */
  private async tryRedeemInvite(token: string, session: SessionEntity): Promise<void> {
    const { lang, connectionId } = session
    try {
      const { invite } = await this.inviteService.redeem(token)
      const workspace = await this.workspaceService.findById(invite.workspaceId)
      const identity = this.resolveMemberIdentity(session)

      // Attach this connection to the membership (create if absent, reconnect if exists)
      const existing = await this.memberService.findByIdentityInWorkspace(workspace.id, identity)
      if (existing) {
        await this.memberService.attachConnection(workspace.id, identity, connectionId)
      } else {
        await this.memberService.add({
          workspaceId: workspace.id,
          userIdentity: identity,
          role: invite.role,
          connectionId,
        })
      }

      session.activeWorkspaceId = workspace.id
      session.state = StateStep.CHAT
      session.workspaceFlowStep = undefined
      await this.sessionRepository.save(session)

      await this.sendText(
        connectionId,
        this.getText('WORKSPACE_JOIN_SUCCESS', lang).replace('{name}', workspace.name).replace('{role}', invite.role),
        lang,
      )

      // Broadcast to other members
      const broadcastText = this.getText('WORKSPACE_JOIN_BROADCAST', lang)
        .replace('{identity}', identity)
        .replace('{role}', invite.role)
      try {
        await this.broadcastService.broadcastText({
          workspaceId: workspace.id,
          text: broadcastText,
          excludeConnectionId: connectionId,
        })
      } catch (err) {
        this.logger.warn(`[HOLOCLAW] Join broadcast failed: ${err}`)
      }
    } catch (err) {
      this.logger.warn(`[HOLOCLAW] Invite redemption failed: ${err}`)
      await this.sendText(connectionId, this.getText('WORKSPACE_JOIN_INVALID', lang), lang)
      session.state = session.activeWorkspaceId ? StateStep.CHAT : StateStep.LOBBY
      session.workspaceFlowStep = undefined
      await this.sessionRepository.save(session)
    }
  }

  /**
   * Send a MenuDisplayMessage listing the user's workspaces so they can switch.
   */
  private async showWorkspacePicker(session: SessionEntity): Promise<void> {
    const identity = this.resolveMemberIdentity(session)
    const workspaces = await this.workspaceService.listForIdentity(identity)
    if (workspaces.length === 0) {
      await this.sendText(session.connectionId, this.getText('WORKSPACE_SWITCH_NONE', session.lang), session.lang)
      return
    }
    const menuItems = workspaces.map((w) => ({
      id: `switch-workspace:${w.id}`,
      text: w.name,
      action: `switch-workspace:${w.id}`,
    }))
    await this.apiClient.messages.send(
      new MenuDisplayMessage({
        connectionId: session.connectionId,
        prompt: this.getText('WORKSPACE_SWITCH_PROMPT', session.lang),
        menuItems,
      }),
    )
  }

  /**
   * Resolve a workspace picker selection and activate it for this connection.
   */
  private async handleSwitchWorkspace(workspaceId: string, session: SessionEntity): Promise<void> {
    const identity = this.resolveMemberIdentity(session)
    const member = await this.memberService.findByIdentityInWorkspace(workspaceId, identity)
    if (!member) {
      this.logger.warn(`[HOLOCLAW] switch-workspace: ${identity} is not a member of ${workspaceId}`)
      await this.sendText(session.connectionId, this.getText('WORKSPACE_SWITCH_NONE', session.lang), session.lang)
      return
    }
    await this.memberService.attachConnection(workspaceId, identity, session.connectionId)
    const workspace = await this.workspaceService.findById(workspaceId)
    session.activeWorkspaceId = workspaceId
    session.state = StateStep.CHAT
    session.workspaceFlowStep = undefined
    await this.sessionRepository.save(session)
    await this.sendText(
      session.connectionId,
      this.getText('WORKSPACE_SWITCH_SUCCESS', session.lang).replace('{name}', workspace.name),
      session.lang,
    )
  }

  /**
   * Return to LOBBY without destroying membership rows.
   */
  private async handleLeaveWorkspace(session: SessionEntity): Promise<void> {
    session.activeWorkspaceId = undefined
    session.state = StateStep.LOBBY
    session.workspaceFlowStep = undefined
    await this.sessionRepository.save(session)
    await this.sendText(session.connectionId, this.getText('WORKSPACE_LEAVE_SUCCESS', session.lang), session.lang)
  }

  /**
   * Admin creates a single-use invite token for the active workspace.
   * MVP: immediate issuance with the default role, no role-selection detour.
   */
  private async handleCreateInvite(session: SessionEntity): Promise<void> {
    if (!session.activeWorkspaceId) {
      await this.sendText(session.connectionId, this.getText('WORKSPACE_NOT_IN_WORKSPACE', session.lang), session.lang)
      return
    }
    const isAdmin = await this.isWorkspaceAdmin(session)
    if (!isAdmin) {
      await this.sendText(session.connectionId, this.getText('WORKSPACE_NOT_ADMIN', session.lang), session.lang)
      return
    }
    const role = this.configService.get<string>('appConfig.holoclaw.invites.defaultRole') ?? 'collaborator'
    const ttlHours = this.configService.get<number>('appConfig.holoclaw.invites.tokenTTLHours') ?? 168
    try {
      const invite = await this.inviteService.create({
        workspaceId: session.activeWorkspaceId,
        role,
        issuedBy: this.resolveMemberIdentity(session),
      })
      await this.sendText(
        session.connectionId,
        this.getText('WORKSPACE_INVITE_CREATED', session.lang)
          .replace('{token}', invite.token)
          .replace('{role}', role)
          .replace('{hours}', String(ttlHours)),
        session.lang,
      )
    } catch (err) {
      this.logger.error(`[HOLOCLAW] create invite failed: ${err}`)
      const msg = err instanceof Error ? err.message : String(err)
      await this.sendText(session.connectionId, msg, session.lang)
    }
  }

  /**
   * Begin the ADD_MCP_SERVER form flow. Admin only.
   * NOTE: the final save step is wired in the BYOMCP iteration; this prompt-chain
   * is ready to accept inputs but will return a "coming soon" message until the
   * WorkspaceMcpService is implemented.
   */
  private async startAddMcpServerFlow(session: SessionEntity): Promise<void> {
    if (!session.activeWorkspaceId) {
      await this.sendText(session.connectionId, this.getText('WORKSPACE_NOT_IN_WORKSPACE', session.lang), session.lang)
      return
    }
    const isAdmin = await this.isWorkspaceAdmin(session)
    if (!isAdmin) {
      await this.sendText(session.connectionId, this.getText('WORKSPACE_NOT_ADMIN', session.lang), session.lang)
      return
    }
    session.state = StateStep.ADD_MCP_SERVER
    session.workspaceFlowStep = 'name'
    session.workspaceFlowData = {}
    await this.sessionRepository.save(session)
    await this.sendText(session.connectionId, this.getText('WORKSPACE_ADD_MCP_PROMPT_NAME', session.lang), session.lang)
  }

  private async handleAddMcpServerInput(text: string, session: SessionEntity): Promise<void> {
    const step = session.workspaceFlowStep ?? 'name'
    const data = (session.workspaceFlowData ?? {}) as { name?: string; url?: string; header?: string }

    if (step === 'name') {
      data.name = text
      session.workspaceFlowData = data
      session.workspaceFlowStep = 'url'
      await this.sessionRepository.save(session)
      await this.sendText(
        session.connectionId,
        this.getText('WORKSPACE_ADD_MCP_PROMPT_URL', session.lang),
        session.lang,
      )
      return
    }
    if (step === 'url') {
      data.url = text
      session.workspaceFlowData = data
      session.workspaceFlowStep = 'header'
      await this.sessionRepository.save(session)
      await this.sendText(
        session.connectionId,
        this.getText('WORKSPACE_ADD_MCP_PROMPT_HEADER', session.lang),
        session.lang,
      )
      return
    }
    if (step === 'header') {
      const header = text.toLowerCase() === 'skip' ? undefined : text
      await this.finalizeAddMcpServer(session, data.name!, data.url!, header)
    }
  }

  /**
   * BYOMCP: register the workspace-scoped MCP server at runtime.
   * Supports streamable-http URLs (https://…) and sse URLs (sse://…).
   * On success: broadcasts the addition to all workspace members and returns
   * the user to CHAT state with a success confirmation.
   */
  private async finalizeAddMcpServer(
    session: SessionEntity,
    name: string,
    url: string,
    header: string | undefined,
  ): Promise<void> {
    const { lang, connectionId, activeWorkspaceId } = session
    if (!activeWorkspaceId) return

    const reset = async (failureMessage?: string) => {
      session.state = StateStep.CHAT
      session.workspaceFlowStep = undefined
      session.workspaceFlowData = undefined
      await this.sessionRepository.save(session)
      if (failureMessage) {
        await this.sendText(
          connectionId,
          this.getText('WORKSPACE_ADD_MCP_FAILED', lang).replace('{name}', name).replace('{reason}', failureMessage),
          lang,
        )
      }
    }

    // Pick transport + normalize URL
    let transport: 'streamable-http' | 'sse'
    let normalizedUrl = url
    if (url.startsWith('sse://')) {
      transport = 'sse'
      normalizedUrl = 'http' + url.substring(3) // sse://host → http://host
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      transport = 'streamable-http'
    } else {
      await reset(`unsupported URL scheme "${url.slice(0, 16)}…"`)
      return
    }

    // Build headers (optional auth)
    const headers: Record<string, string> = {}
    if (header) {
      const [headerName, ...rest] = header.includes(':')
        ? header.split(':').map((s) => s.trim())
        : ['Authorization', header]
      headers[headerName || 'Authorization'] = rest.length ? rest.join(':').trim() : header
    }

    try {
      const result = await this.workspaceMcpService.add({
        workspaceId: activeWorkspaceId,
        name,
        transport,
        url: normalizedUrl,
        headers,
        addedBy: this.resolveMemberIdentity(session),
      })
      session.state = StateStep.CHAT
      session.workspaceFlowStep = undefined
      session.workspaceFlowData = undefined
      await this.sessionRepository.save(session)
      await this.sendText(
        connectionId,
        this.getText('WORKSPACE_ADD_MCP_SUCCESS', lang)
          .replace('{name}', name)
          .replace('{tools}', String(result.toolCount)),
        lang,
      )
      // Broadcast to all other workspace members
      try {
        await this.broadcastService.broadcastText({
          workspaceId: activeWorkspaceId,
          text: this.getText('WORKSPACE_ADD_MCP_BROADCAST', lang)
            .replace('{identity}', this.resolveMemberIdentity(session))
            .replace('{name}', name)
            .replace('{tools}', String(result.toolCount)),
          excludeConnectionId: connectionId,
        })
      } catch (err) {
        this.logger.warn(`[BYOMCP] broadcast failed: ${err}`)
      }
    } catch (err) {
      this.logger.error(`[BYOMCP] finalizeAddMcpServer failed: ${err}`)
      const reason = err instanceof Error ? err.message : String(err)
      await reset(reason)
    }
  }

  // ── MCP Config Flow ──────────────────────────────────────────────

  /** Transient in-memory store for config fields being collected (connectionId → field values) */
  private readonly mcpConfigCollected = new Map<string, Record<string, string>>()

  /**
   * Step 1: User clicked "MCP Server Config" → show server selection menu.
   */
  private async beginMcpConfigFlow(session: SessionEntity): Promise<void> {
    const servers = this.agentContent.getUserControlledServers()
    if (servers.length === 0) {
      await this.sendText(session.connectionId, 'No configurable MCP servers available.', session.lang)
      return
    }

    session.state = StateStep.MCP_CONFIG
    session.mcpConfigServer = undefined
    session.mcpConfigFieldIndex = undefined
    await this.sessionRepository.save(session)

    const menuItems = await Promise.all(
      servers.map(async (s) => {
        const configured = session.userName ? await this.mcpConfigService.hasConfig(session.userName, s.name) : false
        const status = configured ? '✅' : '⚠️'
        return { id: s.name, text: `${status} ${s.name}`, action: s.name }
      }),
    )

    await this.apiClient.messages.send(
      new MenuDisplayMessage({
        connectionId: session.connectionId,
        prompt: this.getText('MCP_CONFIG_SELECT_SERVER', session.lang),
        menuItems,
      }),
    )

    this.logger.log(`[MCP_CONFIG] Server selection menu sent to ${session.connectionId}`)
  }

  /**
   * Step 2: User selected a server from the menu → start asking config fields.
   */
  private async startMcpConfigForServer(serverName: string, session: SessionEntity): Promise<void> {
    const serverDef = this.agentContent.getUserControlledServer(serverName)
    if (!serverDef?.userConfig?.fields?.length) {
      await this.sendText(session.connectionId, `Server "${serverName}" has no configurable fields.`, session.lang)
      await this.abortMcpConfigFlow(session)
      return
    }

    session.mcpConfigServer = serverName
    session.mcpConfigFieldIndex = 0
    await this.sessionRepository.save(session)
    this.mcpConfigCollected.set(session.connectionId, {})

    this.logger.log(
      `[MCP_CONFIG] Starting config for server "${serverName}" (${serverDef.userConfig.fields.length} field(s))`,
    )
    await this.askCurrentConfigField(session, serverDef)
  }

  /**
   * Step 3: User sent a text message while in MCP_CONFIG state → store field value and advance.
   */
  private async handleMcpConfigInput(text: string, session: SessionEntity): Promise<void> {
    const { connectionId, lang, mcpConfigServer, mcpConfigFieldIndex } = session
    if (!mcpConfigServer || mcpConfigFieldIndex == null) {
      await this.abortMcpConfigFlow(session)
      return
    }

    const serverDef = this.agentContent.getUserControlledServer(mcpConfigServer)
    if (!serverDef?.userConfig?.fields?.length) {
      await this.abortMcpConfigFlow(session)
      return
    }

    const fields = serverDef.userConfig.fields
    const currentField = fields[mcpConfigFieldIndex]
    if (!currentField) {
      await this.abortMcpConfigFlow(session)
      return
    }

    // Store the value in transient map
    const collected = this.mcpConfigCollected.get(connectionId) ?? {}
    collected[currentField.name] = text
    this.mcpConfigCollected.set(connectionId, collected)

    const nextIndex = mcpConfigFieldIndex + 1
    if (nextIndex < fields.length) {
      // More fields to collect
      session.mcpConfigFieldIndex = nextIndex
      await this.sessionRepository.save(session)
      await this.askCurrentConfigField(session, serverDef)
    } else {
      // All fields collected → encrypt and save, then validate
      try {
        await this.mcpConfigService.saveConfig(session.userName!, mcpConfigServer, collected)
        this.logger.log(`[MCP_CONFIG] Config saved for avatar="${session.userName}" server="${mcpConfigServer}"`)

        // Validate: attempt a real connection with the provided credentials
        const valid = await this.mcpService.testUserConnection(session.userName!, mcpConfigServer)
        if (valid) {
          const msg = this.getText('MCP_CONFIG_SAVED', lang).replace('{server}', mcpConfigServer)
          await this.sendText(connectionId, msg, lang)
        } else {
          // Credentials are invalid → remove saved config so user can retry
          await this.mcpConfigService.deleteConfig(session.userName!, mcpConfigServer)
          const msg = this.getText('MCP_CONFIG_INVALID', lang).replace('{server}', mcpConfigServer)
          await this.sendText(connectionId, msg, lang)
        }
      } catch (err) {
        this.logger.error(`[MCP_CONFIG] Failed to save/validate config: ${err}`)
        await this.sendText(connectionId, this.getText('MCP_CONFIG_ERROR', lang), lang)
      }

      // Clean up and return to CHAT state
      this.mcpConfigCollected.delete(connectionId)
      session.state = StateStep.CHAT
      session.mcpConfigServer = undefined
      session.mcpConfigFieldIndex = undefined
      await this.sessionRepository.save(session)
    }
  }

  /**
   * Abort: User clicked "Abort Configuration" or something went wrong → reset to CHAT.
   */
  private async abortMcpConfigFlow(session: SessionEntity): Promise<void> {
    this.mcpConfigCollected.delete(session.connectionId)
    session.state = StateStep.CHAT
    session.mcpConfigServer = undefined
    session.mcpConfigFieldIndex = undefined
    await this.sessionRepository.save(session)

    await this.sendText(session.connectionId, this.getText('MCP_CONFIG_ABORTED', session.lang), session.lang)
    this.logger.log(`[MCP_CONFIG] Config flow aborted for ${session.connectionId}`)
  }

  /**
   * Sends the prompt for the current config field to the user.
   */
  private async askCurrentConfigField(
    session: SessionEntity,
    serverDef: { userConfig?: { fields: { name: string; label: Record<string, string>; type: string }[] } },
  ): Promise<void> {
    const field = serverDef.userConfig?.fields[session.mcpConfigFieldIndex ?? 0]
    if (!field) return

    const langKey = session.lang?.split('-')[0] ?? 'en'
    const label = field.label[langKey] ?? field.label['en'] ?? field.name
    await this.sendText(session.connectionId, label, session.lang)
  }
}
