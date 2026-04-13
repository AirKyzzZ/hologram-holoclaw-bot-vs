# HoloClaw — Architecture Specification

**Status:** Design — not yet implemented.
**Audience:** Implementers (you, future collaborators, reviewers).
**Scope:** This is the complete technical spec the handoff asked for. Read it in order — the ADRs at the top inform every downstream choice.

HoloClaw is a Hologram Verifiable Service that turns N individual DIDComm channels into a single multiplayer AI workspace with verified roles, runtime-added MCP tools, and human-in-the-loop approval gates. It is built by forking `hologram-generic-ai-agent-vs` and adding a **workspace overlay** that keys memory, tool configuration, and event broadcasting by a new `workspaceId` — not by `connectionId`. The base agent's single-user model becomes a special case (one workspace, one member) of the multi-tenant multiplayer model.

---

## 1. Architecture Decision Record

The six open questions from the handoff are resolved here. Each decision is non-obvious and each reasoning section exists so the next person reading this can challenge the choice on its merits.

### ADR-01 — Invite token for MVP; workspace membership credential as an opt-in V2 layer

**Decision.** Ship invite tokens in MVP. Do not wire credential issuance for joining. Keep credential-based rejoin as a V2 toggle (`flows.workspaceCredentials.issueOnJoin`).

**Reasoning.**
- Tokens are cheap: one entity, one random-string generator, one paste-in-chat handler. Budget: half a day.
- A `WorkspaceMemberCredential` requires VS Agent credential-offer wiring, a credential definition registered with the VDR, an issuer flow, and a UX where the user must (a) accept a VC into their wallet then (b) later present it to rejoin. That's two extra taps per join, which kills the viral 30-second demo.
- The demo's moment of surprise is _"colleague scans QR, pastes code, joins the live feed."_ Tokens hit that immediately. Credentials don't.
- Migration path is clean: after a successful token join, if `issueOnJoin` is true, the bot calls `POST /v1/invitation/credential-offer` via the VS Agent admin API and issues a `WorkspaceMemberCredential{ workspaceId, role, issuedAt, validUntil }`. Token is the key that buys the credential for future rejoins. Both mechanisms coexist without schema changes.

**Tradeoff accepted.** Users rejoining after an app reinstall will lose their membership (no persistent credential). For MVP this is fine because the demo is "join a live session," not "rejoin next week."

### ADR-02 — Role source is hybrid: invite token primary, credential `rolesAttribute` UNIONed if present

**Decision.** The role column lives on `WorkspaceMemberEntity`, set at join time from the invite token. If the workspace's `flows.authentication.credentialDefinitionId` is configured AND the user presents a matching credential, the roles parsed from `rolesAttribute` are UNIONed onto the membership role set. `adminUsers` stays intact as the bootstrap escape hatch.

**Reasoning.**
- The RBAC spec already models both sources — we keep the whole spec intact and just make the credential part optional.
- Day-one teams can run without any credential infrastructure: invite tokens do all the role assignment.
- Teams that already issue role credentials (finance, cfo, employee) get automatic role promotion layered on top of their invite-granted `collaborator` role. Example: an invite-granted `collaborator` who presents a `cfo` credential gets `{collaborator, cfo}` — and therefore gains approver rights on any tool with `approvers: [cfo]`.
- Role recomputation happens once on credential presentation and again on any workspace switch. Cached on `SessionEntity.roles` per active workspace.

**Tradeoff accepted.** An admin who wants to strictly enforce credential-only roles needs to set the invite role to `observer` (minimum privilege), and rely on the credential to promote. This is an operator pattern, not a product feature, and it's adequate.

### ADR-03 — Memory is fully shared per workspace. Role-scoped reads deferred.

**Decision.** All workspace members read and write the same LangChain memory keyed by `workspaceId`. Observers see the same stream read-only. Per-member threads are rejected. Role-scoped summary feeds are a V2 feature.

**Reasoning.**
- The demo's _"we're in this together"_ punchline only works if every member sees the same AI context. Per-member threads make HoloClaw feel like N parallel copies of ChatGPT, not a shared workspace.
- Implementation is trivial: change the key passed into `LangchainSessionMemory` from `connectionId` to `workspaceId`. Everything downstream works.
- Concurrent writes happen in strict message-order. Each incoming user message is processed sequentially per NestJS request, and `saveContext` is a single atomic append. No interleaving risk because LangChain memory saves happen inside one turn.
- V2 can wrap `loadMemoryVariables()` with a role filter — observers could see a digest while collaborators see the full thread. Cheap to add later.

**Corollary.** Because the memory is shared but the LLM must know who said what, `ChatbotService.chat()` will prepend a speaker tag (`[alice:collaborator]: <text>`) to user input before handing it to `LlmService.generate()`. The system prompt is updated to explain the multi-speaker format.

### ADR-04 — BYOK deferred to V2. MVP uses a shared key from agent-pack/env.

**Decision.** MVP keeps the singleton `LlmService` pattern. API keys come from `agent-pack.yaml` + env. BYOK ships in V2 as per-workspace `WorkspaceLlmConfigEntity` with encrypted keys.

**Reasoning.**
- Per-workspace LLM means per-session `LlmService` instantiation, a per-workspace `AgentExecutor` cache, and key decryption on every turn. That's 3–5 days of careful refactor with real concurrency risk (agent rebuilds racing with in-flight tool calls).
- The viral demo does NOT require BYOK. Nobody watching says "but whose API key is this?"
- The `McpConfigService` AES-256-GCM pattern is proven and reusable. V2 BYOK is cheap once MVP validates the thesis.
- Cost containment in MVP: a simple per-workspace turn-count rate limit (`holoclaw.llmBudget.perWorkspaceTurnLimitPerHour`) prevents a single workspace from burning the shared key.

**Ship-but-hide.** The `WorkspaceLlmConfigEntity` table ships in MVP migrations (empty) so V2 doesn't need a schema migration in prod. Just wire up the service.

### ADR-05 — Observers are silent read-only receivers; input is intercepted and politely refused

**Decision.** Observers receive all broadcast messages and menu updates. When they send text, `CoreService.handleStateInput()` intercepts the message before reaching `ChatbotService.chat()` and replies with a canned TextMessage: _"You are in observer mode. Ask an admin for collaborator access to interact with the AI."_ Menu items that trigger actions (add MCP, invite, approve, create workspace) are hidden via `visibleWhen: isWorkspaceAdmin` and similar predicates.

**Reasoning.**
- Read-only-with-friendly-refusal is less confusing than silent drops. Users think a silent bot is broken.
- No protocol-level muting is possible: DIDComm channels are bidirectional by design. The mute lives in bot logic.
- Intercepting at `CoreService` prevents observers from wasting LLM tokens or polluting the shared memory with discarded inputs.
- Observers can still interact with harmless menus (see workspace status, switch workspaces, leave).

### ADR-06 — Multi-tenant in MVP. One deployment hosts many workspaces.

**Decision.** One HoloClaw deployment hosts many workspaces. A single user can create multiple workspaces and belong to multiple. Workspace selection lives in the menu. When a user has no active workspace they land in a `LOBBY` state.

**Reasoning.**
- Single-workspace is a degenerate case of multi-tenant — the marginal cost is mostly `WHERE workspaceId = ?` on every query.
- Multi-tenant is viral: one demo deployment can serve many users simultaneously without rebuild/redeploy.
- Workspace switching via `SessionEntity.activeWorkspaceId` is a single column read.
- Data isolation: every new entity carries `workspaceId`, and every query filters on it. There is no cross-workspace code path. This is enforced by a `git grep` check in the demo acceptance criteria (§ 6).

**Tradeoff accepted.** The admin bootstrap (`adminUsers`) is still bot-wide, not per-workspace. That's consistent with the RBAC spec and acceptable for MVP — admins can bootstrap any workspace they own. A per-workspace admin list is a V1.5 feature if needed.

---

## 2. Data Model

All new entities live in the HoloClaw bot's Postgres. Existing base-agent entities (`SessionEntity`, `McpConfigEntity`) stay; `SessionEntity` gets a couple of columns added.

### 2.1 Extensions to existing entities

**SessionEntity** (base agent) adds:

| Column | Type | Notes |
| --- | --- | --- |
| `activeWorkspaceId` | `uuid null` | Current workspace context for this connection. Null = in LOBBY. |
| `roles` | `text[]` | Cached union of membership role + credential roles for the active workspace. Recomputed on workspace switch and on credential presentation. |

### 2.2 New entities

**WorkspaceEntity** — the top-level tenant object.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `name` | `varchar(120)` | Required. Unique per owner. |
| `goal` | `text` | Free-form description. |
| `ownerIdentity` | `varchar(255)` | Matches `userIdentityAttribute` from credentials — or the `connectionId` fallback when unauthenticated. |
| `llmConfigRef` | `uuid null fk → workspace_llm_config.id` | Null in MVP (shared key). Used in V2 BYOK. |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |

**WorkspaceMemberEntity** — link between a user identity and a workspace.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workspaceId` | `uuid fk` | |
| `connectionId` | `varchar(255) null fk → session.connectionId` | Null until the user first connects. |
| `userIdentity` | `varchar(255)` | Pre-filled from invite; reconciled on connect. |
| `role` | `varchar(64)` | `owner`, `collaborator`, `observer`, `approver`, or a custom role defined in agent-pack. |
| `joinedAt` | `timestamptz` | |
| `lastSeenAt` | `timestamptz null` | Updated on every incoming message. |
| Unique | `(workspaceId, userIdentity)` | One membership per user per workspace. |

**WorkspaceInviteEntity** — generated tokens that grant membership.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workspaceId` | `uuid fk` | |
| `token` | `varchar(32)` | URL-safe random. Indexed unique. |
| `role` | `varchar(64)` | Role granted to the redeemer. Constrained to `holoclaw.invites.allowedRoles`. |
| `issuedBy` | `varchar(255)` | |
| `expiresAt` | `timestamptz` | Derived from `holoclaw.invites.tokenTTLHours`. |
| `usesRemaining` | `integer` | Default `1` (single-use). |
| `revoked` | `boolean` | Default `false`. |

**WorkspaceMcpServerEntity** — runtime-added MCP servers (BYOMCP).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workspaceId` | `uuid fk` | |
| `name` | `varchar(120)` | Tool-name namespace. |
| `transport` | `enum('streamable-http','sse','stdio')` | |
| `url` | `text null` | Null for stdio. |
| `encryptedHeaders` | `bytea` | AES-256-GCM. Same crypto primitives as `McpConfigService`. |
| `iv` | `bytea` | 12 bytes. |
| `authTag` | `bytea` | 16 bytes. |
| `toolAccess` | `jsonb` | `{ default, roles: {role: tools[]}, approval: [{tools, approvers, timeoutMinutes}] }`. Same schema as agent-pack `mcp.servers[].toolAccess`. |
| `addedBy` | `varchar(255)` | |
| `addedAt` | `timestamptz` | |
| Unique | `(workspaceId, name)` | |

**WorkspaceLlmConfigEntity** (V2, ship the table now for migration safety)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workspaceId` | `uuid fk` | |
| `provider` | `enum('openai','anthropic','ollama','custom')` | |
| `model` | `varchar(120)` | |
| `encryptedApiKey` | `bytea` | |
| `iv` | `bytea` | |
| `authTag` | `bytea` | |
| `baseUrl` | `text null` | For custom OpenAI-compatible endpoints. |

**ApprovalRequestEntity** — matches RBAC spec Section 9 verbatim, plus a `workspaceId` column for multi-tenant scoping.

**ToolExecutionLogEntity** — append-only audit log.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workspaceId` | `uuid fk` | |
| `requesterIdentity` | `varchar(255)` | |
| `serverName` | `varchar(120)` | |
| `toolName` | `varchar(120)` | |
| `args` | `jsonb` | |
| `result` | `text` | Truncated to 8 KB. |
| `status` | `enum('success','error','denied','pending_approval','approved','rejected','expired')` | |
| `approvalRequestId` | `uuid null fk → approval_request.id` | |
| `startedAt` | `timestamptz` | |
| `completedAt` | `timestamptz null` | |
| `durationMs` | `integer null` | |

---

## 3. State Machine

The base agent's `StateStep` enum is replaced wholesale. `START` becomes an internal bootstrap value that immediately transitions to `LOBBY` or `CHAT`.

### 3.1 Full enum

```
LOBBY               // No active workspace — landing state for new connections
CHAT                // Active workspace, normal conversation
AUTH                // Presenting a verifiable credential (existing flow)
MCP_CONFIG          // Per-user MCP credential entry (existing flow)
CREATE_WORKSPACE    // Collecting name + goal
JOIN_WORKSPACE      // Awaiting invite token paste
ADD_MCP_SERVER      // Admin configuring a new workspace-scoped MCP server
APPROVAL_REVIEW     // Approver reviewing a pending tool request
```

### 3.2 Transitions

```
(boot)
  └─> LOBBY                               // on newConnection with no activeWorkspaceId

LOBBY
  ├─> CREATE_WORKSPACE                    // menu: "create workspace"
  ├─> JOIN_WORKSPACE                      // menu: "join with invite"
  └─> CHAT                                // menu: select one of "my workspaces"

CREATE_WORKSPACE
  ├─> CHAT                                // name+goal collected → workspace + owner membership inserted
  └─> LOBBY                               // abort

JOIN_WORKSPACE
  ├─> CHAT                                // token valid → WorkspaceMemberEntity created
  └─> LOBBY                               // token invalid / expired / revoked

CHAT
  ├─> AUTH                                // menu: authenticate
  ├─> MCP_CONFIG                          // menu: per-user MCP credential entry
  ├─> ADD_MCP_SERVER                      // menu (admin only): add workspace MCP
  ├─> APPROVAL_REVIEW                     // menu (approver only): review pending
  ├─> LOBBY                               // menu: switch workspace / leave
  └─> CHAT                                // normal text message

AUTH
  └─> CHAT                                // credential accepted — may unlock new roles for active workspace

MCP_CONFIG
  └─> CHAT                                // config complete or aborted

ADD_MCP_SERVER
  └─> CHAT                                // server validated + connected, or aborted

APPROVAL_REVIEW
  └─> CHAT                                // approve / reject / cancel
```

Every transition ends with `sendContextualMenu(session)` so menu visibility always reflects the new state.

### 3.3 New `visibleWhen` predicates

| Value | Condition |
| --- | --- |
| `inWorkspace` | `session.activeWorkspaceId` is not null |
| `noWorkspace` | `session.activeWorkspaceId` is null |
| `isWorkspaceAdmin` | User's role on the active workspace is `owner` (or a custom role with `isAdmin: true` in agent-pack) |
| `isApprover` | User holds any role that appears in any `toolAccess.approval.approvers` across the active workspace's MCP servers (global + workspace-added) |
| `hasApprovalRequests` | Per RBAC spec |
| `hasPendingApprovals` | Per RBAC spec |
| `always`, `authenticated`, `unauthenticated`, `configuring`, `notConfiguring` | Existing values from the base agent — unchanged |

---

## 4. Agent-pack schema additions

A new top-level section `holoclaw` extends the base schema. Everything under `holoclaw` is optional; unset values fall back to the defaults shown.

```yaml
holoclaw:
  workspaces:
    multiTenant: true                       # MVP default
    maxPerOwner: 10                         # rate-limit workspace creation
    nameMaxLength: 120

  invites:
    tokenTTLHours: 168                      # 7 days
    defaultRole: collaborator
    allowedRoles: [collaborator, observer, approver]

  llmBudget:
    perWorkspaceTurnLimitPerHour: 60        # cost guardrail for shared-key MVP
    rejectOnExceed: true

  liveFeed:
    enabled: true
    verbosity: verbose                      # minimal | verbose | debug
    broadcastToolErrors: true

  audit:
    retentionDays: 90

  workspaceCredentials:                      # V2 only
    issueOnJoin: false
    credentialDefinitionId: ${HOLOCLAW_WORKSPACE_CRED_DEF_ID}
    validForDays: 365

  byok:                                      # V2 only
    enabled: false
    allowedProviders: [openai, anthropic, ollama]
```

Extensions to existing sections:

```yaml
flows:
  authentication:
    required: false                          # workspaces work without VC presentation
    # rolesAttribute still consulted when a credential IS presented — ADR-02

  menu:
    items:
      - id: create-workspace
        labelKey: CREATE_WORKSPACE
        action: create-workspace
        visibleWhen: noWorkspace

      - id: join-workspace
        labelKey: JOIN_WORKSPACE
        action: join-workspace
        visibleWhen: noWorkspace

      - id: switch-workspace
        labelKey: SWITCH_WORKSPACE
        action: switch-workspace
        visibleWhen: inWorkspace

      - id: invite-member
        labelKey: INVITE_MEMBER
        action: invite-member
        visibleWhen: isWorkspaceAdmin

      - id: add-mcp-server
        labelKey: ADD_MCP
        action: add-mcp-server
        visibleWhen: isWorkspaceAdmin

      - id: pending-approvals                # per RBAC spec
        labelKey: PENDING_APPROVALS
        action: pending-approvals
        visibleWhen: hasPendingApprovals
        badge: pendingApprovalCount

      - id: my-approval-requests
        labelKey: MY_APPROVAL_REQUESTS
        action: my-approval-requests
        visibleWhen: hasApprovalRequests
        badge: approvalRequestCount
```

The existing `mcp.servers[].toolAccess` schema is unchanged. Workspace-added MCP servers persist an object with the same shape in `WorkspaceMcpServerEntity.toolAccess`.

---

## 5. Component Inventory

### New modules and services

Every service below is a NestJS `@Injectable` unless noted. Modules are listed in the dependency order that `HoloclawModule` imports them.

| Service | Responsibility | Depends on |
| --- | --- | --- |
| `WorkspaceService` | CRUD on workspaces, ownership checks, active-workspace switch, `maxPerOwner` enforcement | TypeORM |
| `WorkspaceMemberService` | Add / remove / lookup members. Role union (membership + credential roles). `lastSeenAt` updates. | `WorkspaceService`, `RbacService` |
| `InviteService` | Generate / validate / revoke invite tokens. Single-use by default. | `WorkspaceService` |
| `RbacService` | Implements RBAC spec §12.1. Queries consult both the agent-pack `mcp.servers[].toolAccess` AND the workspace-scoped `WorkspaceMcpServerEntity.toolAccess`. | `WorkspaceService`, `WorkspaceMcpService` |
| `ApprovalService` | Implements RBAC spec §12.2. `ApprovalRequestEntity` persisted per-workspace. | NestJS `EventEmitter` |
| `ToolCallInterceptor` | Implements RBAC spec §12.3. **The sole choke point for all tool calls.** Handles ALLOW / DENY / APPROVAL branches. On every call: (a) writes `ToolExecutionLogEntity`, (b) broadcasts live-feed start/end/error via `BroadcastService`, (c) carries `workspaceId` through to `McpService.callTool`. | `RbacService`, `ApprovalService`, `McpService`, `BroadcastService`, `ToolLogService` |
| `ApprovalEventHandler` | Implements RBAC spec §12.4. Menu badge updates + cross-connection notifications via `BroadcastService`. | `BroadcastService`, `MenuService` |
| `BroadcastService` | Single choke point for **"send to all online members of a workspace."** Implementation: iterate `WorkspaceMemberEntity` rows for the workspace with non-null `connectionId`, send one `TextMessage` / `ContextualMenuUpdateMessage` per member via VS Agent `ApiClient`. Optional `excludeConnectionId` param. Supports `broadcastText`, `broadcastMenuUpdate`, `broadcastToolEvent`. | `WorkspaceMemberService`, VS Agent `ApiClient` |
| `WorkspaceMcpService` | Adds runtime MCP server registration. Holds the missing `addServer(workspaceId, def)` plus connect/disconnect logic. Delegates transport-level work to `McpService`. Overlays workspace-scope tool filtering in `getToolsForWorkspace(workspaceId, userRoles)`. | `McpService`, `WorkspaceService`, `RbacService` |
| `ToolLogService` | Writes `ToolExecutionLogEntity` rows. Query methods for the V1.5 audit viewer. | TypeORM |
| `LiveFeedCallbackHandler` | LangChain `BaseCallbackHandler` subclass. On `onToolStart` / `onToolEnd` / `onToolError`, calls `BroadcastService.broadcastToolEvent()`. Respects `holoclaw.liveFeed.verbosity`. | `BroadcastService` |
| `WorkspaceLlmConfigService` (V2) | Encrypted storage for per-workspace LLM keys. Mirrors `McpConfigService` primitives. | TypeORM + crypto |
| `WorkspaceLlmService` (V2) | Per-workspace `AgentExecutor` cache. Decrypts LLM keys on-demand. | `WorkspaceLlmConfigService`, `LlmService` |

### Existing services that need surgical changes

| Service | Change |
| --- | --- |
| `CoreService` | Add LOBBY, CREATE_WORKSPACE, JOIN_WORKSPACE, ADD_MCP_SERVER, APPROVAL_REVIEW branches to `handleStateInput()`. `newConnection` routes to LOBBY by default. `sendContextualMenu()` resolves new `visibleWhen` predicates. Observer input intercept before `ChatbotService.chat()`. |
| `LlmService` | Replace direct `McpService.callTool` call sites with `ToolCallInterceptor.execute`. Install `LiveFeedCallbackHandler` in the `AgentExecutor` constructor. `generate()` accepts `{ workspaceId, userRoles }` and calls `McpService.getToolsForUser(workspaceId, userRoles)` for LLM-level tool filtering. `refreshMcpTools()` watches `WorkspaceMcpServerEntity` changes, not just boot config. |
| `McpService` | New method: `addServer(def: McpServerDef, scope: {workspaceId: string} \| {global: true})`. Extend `runWithCaller` to carry `{ avatarName, workspaceId }`. New method: `getToolsForUser(workspaceId, userRoles)` returns the union of global + workspace-scoped tools, filtered through `RbacService`. `callTool` signature accepts `workspaceId` for workspace-scoped connection routing. |
| `MemoryService` | Primary key changes from `connectionId` to `workspaceId`. When `activeWorkspaceId` is null (lobby), fall back to `lobby:${connectionId}` so LOBBY still has ephemeral memory. |
| `ChatbotService` | Prepend speaker tag `[<userIdentity>:<role>]: ` to user input before handing to `LlmService`. Update system prompt to explain the multi-speaker format. |
| Menu resolver inside `CoreService` | Add new `visibleWhen` predicates. Resolve `badge` fields from `ApprovalService.countFor(...)`. |

### Module graph

```
HoloclawModule
├─ WorkspaceModule        (WorkspaceService, WorkspaceMemberService, InviteService, entities)
├─ RbacModule             (RbacService — imports WorkspaceModule)
├─ ApprovalModule         (ApprovalService, ApprovalEventHandler)
├─ BroadcastModule        (BroadcastService, LiveFeedCallbackHandler)
├─ AuditModule            (ToolLogService + entity)
├─ WorkspaceMcpModule     (WorkspaceMcpService — wraps McpModule)
├─ ToolCallInterceptorModule (ToolCallInterceptor — imports Rbac, Approval, Broadcast, Audit)
├─ CoreModule             (patched CoreService)
├─ ChatbotModule          (patched ChatbotService)
├─ LlmModule              (patched LlmService; V2 adds WorkspaceLlmService)
└─ McpModule              (patched McpService)
```

**Hard invariant:** `ToolCallInterceptor` is a mandatory middleware. After the refactor, no code path calls `McpService.callTool()` directly. `git grep "mcpService.callTool"` in the finished bot should return exactly one match — inside `ToolCallInterceptor.execute()`.

---

## 6. MVP Scope

### IN — must ship for the viral demo

1. Multi-tenant workspaces (create, switch, list) — **ADR-06**
2. Invite token join flow (create, paste, redeem) — **ADR-01**
3. Shared memory keyed by `workspaceId` with speaker tags — **ADR-03**
4. Four built-in roles: `owner`, `collaborator`, `observer`, `approver`. Custom roles supported via agent-pack.
5. Hybrid role resolution (invite + optional credential union) — **ADR-02**
6. `BroadcastService` with fan-out to online members
7. BYOMCP from inside chat (`ADD_MCP_SERVER` state) with AES-256-GCM encrypted headers
8. Runtime tool discovery + LLM agent rebuild on new server
9. Live tool execution feed via LangChain `CallbackHandler` → broadcast
10. Full RBAC per spec: per-role tool filtering at the LLM binding level
11. Approval workflow: `PENDING → APPROVED / REJECTED / CANCELLED / EXPIRED` per spec
12. Per-role menu items with dynamic `visibleWhen` and `badge`
13. Observer silent-refusal input guard — **ADR-05**
14. `ToolExecutionLogEntity` writes on every tool call
15. English + French i18n strings

### OUT — V2 or later

1. **BYOK** per-workspace LLM keys — **ADR-04**. Table ships empty.
2. **WorkspaceMemberCredential** issuance — **ADR-01**. Schema fields ship unused.
3. **Media/file processing** (`MediaMessage` handling) — V2.
4. **Async task mode** with BullMQ — out of scope entirely for the foreseeable near term.
5. **Template workspaces** (preset agent-packs: research, code, devops, content) — V1.5 "free win" — just new agent-pack.yaml files.
6. **Online presence** beyond `lastSeenAt` — ship the column in MVP, display it in V1.5.
7. **Role-scoped memory** (observer summary digest) — V2.
8. **Tool output verbosity toggle** (minimal / debug) — MVP ships `verbose` only.
9. **Per-workspace admin list** — global `adminUsers` bootstrap is enough for MVP.

### Demo acceptance criteria

Before calling MVP "done":

1. User A scans bot QR and creates workspace "Demo"; transitions into CHAT.
2. User A types "add MCP server" → walks through URL + header entry → server connects, tools discovered, success broadcast.
3. User A generates an invite token → shares out-of-band.
4. User B scans bot QR → pastes token → joins as `collaborator` → sees welcome broadcast. User A also sees "[B] joined as collaborator."
5. User A asks a question that invokes the new MCP server's tool → both A and B see `[tool:github_search] starting... → complete (1.2s)` live in their threads.
6. A subsequent tool call flagged `requires approval` → User A (who also has the `approver` role) sees pending-approvals menu badge → taps it → approves → tool executes → result broadcast to both A and B.
7. User C scans bot QR and joins as `observer` (via a separate invite) → sees all prior messages, tool events, and new broadcasts. C types a message → receives the canned "observer mode" reply. C's message never reaches the LLM.
8. `git grep workspaceId src/` shows every workspace-touching query filters on it. Manually verified: no cross-workspace data leak path exists.

---

## 7. Build Sequence

Each step is independently testable. Do not start the next step until the current one has a passing test. Rough estimates assume a single focused developer.

**Step 1 — Fork and clean baseline (0.5 day)**
Fork `hologram-generic-ai-agent-vs` to `hologram-holoclaw-bot-vs`. Rename package in `package.json`. Strip `agent-packs/customer-service` and `agent-packs/hologram-welcome`. Add skeleton `agent-packs/holoclaw-base/agent-pack.yaml`. **Verify:** `docker-compose up` runs the unchanged base bot end-to-end and a QR scan produces a working CHAT session.

**Step 2 — Workspace entities + LOBBY state (1 day)**
Add `WorkspaceEntity`, `WorkspaceMemberEntity`, `WorkspaceInviteEntity` with TypeORM migrations. Extend `SessionEntity` with `activeWorkspaceId` and `roles`. Add `LOBBY` to the state enum. New connections route to LOBBY. Add two menu items: "create workspace" + "join with invite." **Verify:** a new user lands in LOBBY with the right menu visible; chat input in LOBBY replies "please create or join a workspace first."

**Step 3 — Create workspace flow (0.5 day)**
`CREATE_WORKSPACE` state captures name then goal, inserts `WorkspaceEntity` + owner `WorkspaceMemberEntity` + sets `activeWorkspaceId`. **Verify:** user creates a workspace and transitions to CHAT; existing LLM chat still works (memory still keyed by `connectionId` at this step).

**Step 4 — Memory re-keying (0.5 day)**
`LangchainSessionMemory` constructor takes `workspaceId`. `MemoryService` keys by workspace, with lobby fallback. **Verify:** a test where two connections in the same workspace send messages sequentially — the second connection's LLM context includes the first's messages. Shared memory works.

**Step 5 — Invite token + join flow (0.5 day)**
`InviteService` generates URL-safe 24-char tokens persisted with `role` and `expiresAt`. `JOIN_WORKSPACE` state accepts pasted token, validates, creates `WorkspaceMemberEntity`, switches active workspace. **Verify:** user B joins user A's workspace and both see shared memory.

**Step 6 — BroadcastService + join notification (0.5 day)**
`BroadcastService.broadcastText(workspaceId, text, excludeConnectionId?)` iterates members and sends individual `TextMessage`s. On `WorkspaceMemberEntity` insert, emit join notification. **Verify:** B's join lands in A's chat window in real time.

**Step 7 — Speaker tag in ChatbotService (0.25 day)**
Prepend `[identity:role]: ` before calling `LlmService.generate()`. Update system prompt to explain multi-speaker context. **Verify:** LLM correctly addresses users by name in a multi-speaker turn.

**Step 8 — RbacService + per-user tool filter (1 day)**
Implement `RbacService` per spec §12.1. `LlmService.generate()` calls `getToolsForUser(workspaceId, userRoles)` before agent invoke. Roles come from `WorkspaceMemberEntity.role` plus (optional) credential roles. **Verify:** observer's LLM call has no workspace tools; collaborator has the full set.

**Step 9 — ToolCallInterceptor + ToolExecutionLog (1 day)**
Implement `ToolCallInterceptor.execute()` per spec §12.3 without the approval branch yet. Route **every** tool call through it. Write `ToolExecutionLogEntity` on every call. **Verify:** tool invocations appear in DB with correct `workspaceId`, `requesterIdentity`, `durationMs`. `git grep mcpService.callTool` returns exactly one hit (inside the interceptor).

**Step 10 — LiveFeedCallbackHandler + broadcast (0.5 day)**
LangChain `BaseCallbackHandler` subclass on `onToolStart` / `onToolEnd` / `onToolError`. Installed in the `AgentExecutor`. Broadcasts formatted text lines via `BroadcastService`. **Verify:** A asks a question, B sees "agent is calling github_search..." in real time.

**Step 11 — ApprovalService + state + menu badges (1 day)**
Implement `ApprovalService` per spec §12.2 and `ApprovalEventHandler` per §12.4. Add `ApprovalRequestEntity`. Wire the APPROVAL branch in `ToolCallInterceptor`. Add `APPROVAL_REVIEW` state and `pending-approvals` / `my-approval-requests` menu items with dynamic badges. **Verify:** demo acceptance step 6 works end to end.

**Step 12 — BYOMCP: ADD_MCP_SERVER state (1.5 days)**
State collects: name, transport, url, optional header name + secret value. On submit: encrypt headers via existing crypto, insert `WorkspaceMcpServerEntity`, call `WorkspaceMcpService.addServer()` which delegates to `McpService.addServer()` + `discoverAndCacheTools()`. Bump `toolsVersion`. `LlmService.refreshMcpTools()` rebuilds the agent. **Verify:** admin adds a test MCP server; tools appear in the agent's tool set; success message broadcast; subsequent tool calls reach the new server.

**Step 13 — Observer guard (0.25 day)**
`CoreService.handleStateInput()` checks role before calling `ChatbotService.chat()`. Observer gets canned refusal. **Verify:** demo acceptance step 7.

**Step 14 — i18n + final menu polish (0.5 day)**
Add EN and FR strings for every new menu label and system message. **Verify:** FR user sees French menus and French system prompts.

**Step 15 — Demo acceptance run (0.5 day)**
Run all 8 demo criteria end to end on a staging deployment. Record the video. This is the viral demo rehearsal — if anything here feels clunky, fix it before shipping.

**Total:** approximately 10 days of focused work for a single developer. Budget 14 with review and sharp-edge fixing. V2 (BYOK, credentials, media) adds 5–7 days.

---

## 8. Critical risks

1. **LangChain callback ordering.** `onToolStart` fires before tool execution begins inside LangChain, but `ToolCallInterceptor` runs at a different layer (between LLM tool-call and `McpService.callTool`). We need to confirm the broadcast ordering seen by users is "calling X" → "X returned Y" and never interleaved with other tool calls from the same turn. Mitigation: serialize broadcasts per `(workspaceId, turnId)` in `BroadcastService`.
2. **Agent rebuild on new MCP servers.** The current `LlmService` rebuilds the global `publicAgent` / `adminAgent` on `toolsVersion` bump. With workspace-scoped servers this global rebuild is wasteful and risks tool-set collisions across workspaces. MVP accepts it: rebuild the global agent on any workspace change and let `getToolsForUser` filter per-request. Acceptable because tool binding is fast. V2 moves to per-workspace agent caches.
3. **Concurrent workspace mutations.** Two admins adding MCP servers to the same workspace simultaneously could race during rebuild. Serialize workspace mutations via an in-process `Map<workspaceId, Mutex>` from day one — it's five lines and avoids an entire class of bug.
4. **Broadcast fan-out size.** `BroadcastService` sends one `TextMessage` per online member per event. A workspace with 50 members and a verbose live feed = 50× messages per tool call. Not a correctness problem but watch the VS Agent admin API for rate limits during the demo. Mitigation: debounce tool events at 100 ms granularity in V1.5.
5. **Token leak in logs.** Invite tokens must never appear in application logs. Enforce by storing only the hash in `WorkspaceInviteEntity.token`? **No** — the user needs to share the raw token out-of-band, so we must keep the raw value. Instead: redact tokens in all log lines via a NestJS logger interceptor that masks values matching the token regex. Add to Step 5.
6. **Migration safety.** First deploy has no existing data — safe. Subsequent schema changes must use TypeORM migrations from day one (not `synchronize: true`). Lock this in the `TypeOrmModule.forRoot` config during Step 1.

---

## 9. Open questions to confirm before Step 1

These are the things the architect spec cannot resolve from the handoff alone. Confirm them with the 2060.io team before building.

1. **RBAC spec merge status.** Is `docs/rbac-approval-spec.md` implemented in `hologram-generic-ai-agent-vs` main, or still only in docs? If spec-only, HoloClaw is the first implementation and we should consider upstreaming `RbacService` / `ApprovalService` / `ToolCallInterceptor` as generic base-agent features, with HoloClaw contributing only the workspace overlay.
2. **Hologram app client support for badges.** Does the current Hologram mobile app render `ContextualMenuUpdateMessage` with `badge` fields? The RBAC spec assumes yes. Verify with a live test before investing in badge UX — fallback plan is plain-text suffix `(3 pending)` in menu labels.
3. **Workspace credential definition ID (V2 prep).** If BYOK and workspace credentials will come in V2, it's worth registering the `WorkspaceMemberCredential` schema in the VDR now, even unused, so V2 doesn't block on governance.
4. **Per-workspace agent caching vs global rebuild.** Confirm with the team that rebuilding the global agent on any workspace change is acceptable for MVP performance. If not, Step 12 needs to ship per-workspace agent caches from day one (+1 day of work).
5. **Rate limit source for `llmBudget.perWorkspaceTurnLimitPerHour`.** Redis counter or Postgres count? Redis is faster but adds an assumption; Postgres is one more query per turn. Recommend Redis when `AGENT_MEMORY_BACKEND=redis`, Postgres otherwise. Flag in Step 4.

---

## 10. Naming and conventions

- **Identifiers.** Use `userIdentity` everywhere for the credential-derived unique identity. Avoid `avatarName` (base agent's legacy term) in new code. Where the base agent forces `avatarName`, wrap once at the boundary.
- **UUIDs.** All `id` columns are `uuid` generated by Postgres `gen_random_uuid()` (pgcrypto extension — enable in migration Step 2).
- **Table names.** `workspace`, `workspace_member`, `workspace_invite`, `workspace_mcp_server`, `workspace_llm_config`, `approval_request`, `tool_execution_log`. Singular for consistency with the base agent's `session`.
- **Event names.** `workspace.created`, `workspace.member.joined`, `workspace.mcp.added`, `approval.created`, `approval.resolved`, `tool.start`, `tool.end`, `tool.error`. Dispatched via NestJS `EventEmitter2`.
- **Log prefixes.** `[Holoclaw]`, `[Workspace]`, `[Approval]`, `[Broadcast]`, `[ToolFeed]`. Consistent with the base agent's logger style.

---

**Next step.** Confirm the five open questions in §9, then begin Step 1 of the build sequence. Do not skip steps — each is independently testable and the sequence is optimized for catching integration issues early.
