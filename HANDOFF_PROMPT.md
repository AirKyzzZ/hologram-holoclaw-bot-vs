# HoloClaw — Handoff Prompt for Opus 4.6 (High Thinking Mode)

## Your mission

You are the architect. Before writing a single line of code, your job is to **deeply explore the
possibilities, design the full architecture, and produce a complete technical specification** for
HoloClaw — a multiplayer AI workspace bot built on the Hologram platform.

A previous Sonnet agent has done extensive research and brainstorming. This document is that agent's
complete knowledge handoff. Read everything here, explore the referenced files yourself, form your
own opinions, challenge assumptions, and produce a spec that is ready to implement.

Do NOT start building yet. Think first.

---

## What is HoloClaw?

**The one-liner:** OpenClaw is single-player. HoloClaw is multiplayer, with your own tools.

HoloClaw is a Hologram bot (a Verifiable Service running on DIDComm) that turns the Hologram
messaging platform into a **collaborative AI workspace**. Multiple people — each with their own
encrypted channel — share a live AI agent session. Each participant has a verified role. The agent
knows who is talking and adapts. Sensitive tool executions require approval from a designated
approver. Anyone can bring their own MCP tools and connect them at runtime.

**Inspiration:** OpenClaw went viral for its autonomous multi-step tool use (browse, code, act).
HoloClaw's differentiator is that it's the first AI agent platform designed for multiple verified
participants — not just one user talking to an AI.

**Target audience:** Teams, enterprises, developers — anyone who needs an AI that works *with*
multiple people, not just one.

---

## The Hologram platform — what you need to know

### How it works

Hologram is a DIDComm-based mobile messaging platform. Users run the Hologram app on their phone.
Bots are called "Verifiable Services" (VS). Each bot runs a **VS Agent** Docker container (the
DIDComm gateway) alongside a **NestJS backend** (the bot logic). The VS Agent handles all
cryptography, key management, and protocol; the NestJS backend receives webhooks and sends messages
back via an admin API.

### Connection model — CRITICAL

**DIDComm is point-to-point. There is no native group connection.** This is confirmed at every layer:
DIDComm v2.1 spec, VS Agent source, and all existing bots. Each user who scans the bot's QR code
gets their own independent, end-to-end encrypted channel identified by a unique `connectionId`.

**Multi-user is implemented as N individual channels + shared server-side state:**
- Each user has their own `connectionId`
- The bot maintains a `WorkspaceEntity` in PostgreSQL that links multiple `connectionId`s
- "Broadcasting" = iterating workspace member `connectionId`s and sending individual messages
- This pattern is already documented in the RBAC approval spec (see below)

This is NOT a limitation — it's a feature. Each channel is independently E2E encrypted. Nobody can
impersonate another user. Roles are credential-verified.

### Message types (complete list)

**Inbound (bot receives):**
- `TextMessage` — user text
- `ContextualMenuSelectMessage` — user tapped a menu button
- `MenuSelectMessage` — user selected from a list
- `MediaMessage` — file/image/audio attachment (received but not processed in any existing bot)
- `ProfileMessage` — user profile including `preferredLanguage`
- `IdentityProofSubmitMessage` — user submitted a Verifiable Credential proof

**Outbound (bot sends):**
- `TextMessage` — text response
- `ContextualMenuUpdateMessage` — updates the persistent bottom menu (title, description, buttons)
- `MenuDisplayMessage` — inline scrollable list with selectable items
- `IdentityProofRequestMessage` — requests a VC proof from the user

**Lower-level DIDComm extensions (available but not wired into the NestJS client):**
- Calls (voice/video via WebRTC — used in `hologram-liveavatar-agent-vs`)
- Read receipts
- Emoji reactions
- Media sharing

### Invitation and QR flows

Three distinct flows exist:
1. **Basic connection** — `GET /invitation` → QR → user scans → persistent DIDComm channel established → `newConnection()` fires on bot
2. **Credential offer** — `POST /v1/invitation/credential-offer` → QR → user scans → gets a VC in their wallet (one-time, no persistent chat)
3. **Presentation request** — `POST /v1/invitation/presentation-request` → QR → user presents VC → callback with claims (no persistent chat)

For HoloClaw, flow 1 is how users connect. Flow 2 is how workspace membership credentials could be issued.

---

## The base codebase — hologram-generic-ai-agent-vs

**Every Hologram bot is a fork of this repo.** HoloClaw will be too. Read it thoroughly:

```
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-generic-ai-agent-vs/
```

Key files to read:
- `src/core/core.service.ts` — state machine, event handler, session lifecycle
- `src/llm/llm.service.ts` — LangChain agent executor, tool binding, multi-provider
- `src/mcp/mcp.service.ts` — MCP client, dynamic tool discovery, user-controlled servers
- `src/mcp/mcp-config.service.ts` — AES-256-GCM per-user credential encryption in PostgreSQL
- `src/memory/memory.service.ts` — Redis/in-memory backends
- `src/chatbot/chatbot.service.ts` — LLM orchestration, language detection
- `docs/agent-pack-schema.md` — full agent-pack.yaml schema
- `docs/rbac-approval-spec.md` — **READ THIS CAREFULLY** — fully designed RBAC + approval system
- `agent-packs/hologram-welcome/agent-pack.yaml` — production example
- `agent-packs/customer-service/agent-pack.yaml` — second production example

### What the base agent already does

| Capability | Status |
|------------|--------|
| LLM providers | OpenAI, Anthropic, Ollama (Ollama: prompt-only, no tools) |
| Tool calling | LangChain `DynamicStructuredTool` + `createToolCallingAgent` |
| MCP integration | Admin-controlled (shared) + user-controlled (per-user encrypted creds) |
| Per-user MCP credentials | AES-256-GCM in PostgreSQL — reusable pattern for BYOK |
| RAG | Pinecone or Redis vector stores, local + remote docs |
| Memory | In-memory or Redis, configurable window, keyed by `connectionId` |
| Authentication | Verifiable Credentials via DIDComm, claims extraction |
| Role system | Binary: admin (`adminAvatars` list) vs. everyone else |
| Session state machine | `StateStep` enum: `START → CHAT ↔ AUTH ↔ MCP_CONFIG` |
| Contextual menus | Dynamic visibility (`visibleWhen`), actions, i18n |
| Multi-language | EN, ES, FR, PT out of the box |
| Persistence | PostgreSQL via TypeORM for sessions, MCP configs |
| Horizontal scaling | Redis + PostgreSQL support |
| Agent packs | Declarative YAML config — full schema in `docs/agent-pack-schema.md` |

### The RBAC + Approval spec — the most important finding

`docs/rbac-approval-spec.md` is a **complete, production-ready specification** for:
- Credential-driven role resolution (`rolesAttribute` from VC → user's role set)
- Per-role per-tool access matrix (union of roles' tool lists)
- Approval workflow with full lifecycle: `PENDING → APPROVED / REJECTED / CANCELLED / EXPIRED`
- Four new components: `RbacService`, `ApprovalService`, `ToolCallInterceptor`, `ApprovalEventHandler`
- Cross-connection notification pattern (iterate connected users by role → individual sends)
- Menu badges: `(3) pending approvals` with dynamic `visibleWhen: hasPendingApprovals`
- Self-approval rule
- LLM tool filtering: denied tools not even shown to LLM

**This spec is not implemented yet.** It is HoloClaw's backbone. Read every line.

### Known limitations of the base agent

- Single LLM instance shared across all users (needs per-session instantiation for BYOK)
- Memory window global (same for all sessions)
- MCP servers defined at startup in agent-pack only (no runtime addition)
- MediaMessage received but fully ignored
- Admin detection via username string matching (brittle — the RBAC spec replaces this)
- Tool discovery is synchronous (first user-controlled MCP connection blocks response)

---

## Other bots to learn from

```
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/
  hologram-twitter-bot-vs-fork/     — role-based access, extended state machine, audit logging
  hologram-concieragent-demo-vs/    — MCP-native (6 MCP servers, 30 tools), Express.js (not NestJS)
  hologram-liveavatar-agent-vs/     — WebRTC video avatar via HeyGen, DIDComm calls extension
  hologram-whisper-bot-vs-fork/     — speech-to-text (Whisper), same MCP pattern as generic agent
```

The Twitter bot shows: extended `StateStep` enum with content workflow states, per-user role from
VC credential claims, audit logging with `actorDid`. Study its `core.service.ts`.

---

## The features brainstormed — with feasibility

These were developed across a full research session. Evaluate them, add your own, and decide what
belongs in MVP vs. later phases.

### Core HoloClaw features

**1. Workspace** — a named, persistent project that persists across disconnects
- `WorkspaceEntity`: id, name, goal, ownerId, toolConfig (JSONB), createdAt
- `WorkspaceMemberEntity`: workspaceId, connectionId, role, identityAttribute, joinedAt
- Memory keyed by `workspaceId` instead of `connectionId`
- Multiple users reference the same workspace
- Feasibility: **Medium** — new DB entities, shared memory key, no protocol changes

**2. Multi-user join via invite token**
- Admin creates workspace → generates invite token (stored in DB with role + expiry)
- Admin shares token out-of-band (copy-paste or displays as QR)
- Invitee connects to bot normally (scans bot's QR) → pastes token in chat
- Bot validates token → links `connectionId` to workspace with the embedded role
- All existing members notified: "[user] joined as collaborator"
- Feasibility: **Medium** — pure bot-side logic, no VS Agent changes needed

**3. Full role system (credential-driven)**
- Roles from VC: `rolesAttribute` in the user's credential (already spec'd in RBAC doc)
- Role set = union of all credential roles
- Roles: `admin`, `collaborator`, `observer`, `approver` — but deployer-defined (not hardcoded)
- `observer` role: receives messages but cannot send any to the AI
- Feasibility: **Medium** — RBAC spec is ready, just needs implementation

**4. BYOMCP — add MCP servers at runtime, from inside the chat**
- Admin types "add MCP server" → bot walks through config flow (URL, transport, optional token)
- Tests connection → discovers tools → adds to workspace's tool set immediately
- Persists added servers per-workspace in `workspaceToolConfig` JSONB
- `McpService` already supports dynamic connections and lazy tool discovery
- The user-controlled MCP config flow is the direct parallel to implement
- Feasibility: **Medium** — new state `ADD_MCP_SERVER`, new `McpService.addServer()` runtime method

**5. Per-role tool permissions for user-added MCP servers**
- When adding an MCP server, admin configures which roles can use which tools
- Extends the existing `toolAccess.roles` schema from the RBAC spec to user-added servers
- Feasibility: **Medium** — schema extension + RBAC integration

**6. Approver gate (HITL at tool execution level)**
- Certain tools flagged as "requires approval" (per-workspace config)
- Agent pauses before executing → sends approval request to all members holding `approver` role
- Approver sees: tool name, arguments, requester identity
- Approver approves / rejects → agent continues or stops
- Fully spec'd in `docs/rbac-approval-spec.md` including the complete component architecture
- Feasibility: **Medium** — spec exists, needs LangChain `ToolCallInterceptor` wrapper

**7. Live tool execution feed**
- All workspace members see tool calls as they happen (not just the final answer)
- "Agent is calling github_search with query: 'authentication middleware'..."
- LangChain `CallbackHandler` on `onToolStart` / `onToolEnd` / `onToolError`
- Each callback calls `broadcastToWorkspace()` → individual TextMessages to all members
- Admin can toggle verbosity: minimal / verbose / debug
- Feasibility: **Easy-Medium** — LangChain callbacks + broadcast pattern

**8. BYOK — bring your own LLM key and model**
- Per-workspace (or per-user) LLM provider + API key + model selection
- Key never stored in cleartext — reuse `McpConfigService` AES-256-GCM encryption pattern
- LlmService needs per-session instantiation (currently shared singleton)
- Config flow: `LLM_CONFIG` state in state machine, same UX as MCP user-controlled config
- Supports: OpenAI, Anthropic, Ollama (local), any OpenAI-compatible endpoint
- Feasibility: **Medium** — encryption pattern exists, per-session LLM instantiation is the main work

**9. Workspace membership credential (optional — advanced)**
- Instead of (or in addition to) invite tokens, HoloClaw issues a `WorkspaceMemberCredential` VC
- Contains: workspaceId, role, issuedAt, validUntil
- User presents this credential to rejoin a workspace across disconnects
- Uses VS Agent `/v1/invitation/credential-offer` (already supported by platform)
- More Hologram-native, persistent across app reinstalls
- Feasibility: **Medium-Hard** — credential issuance not currently in generic agent

**10. File/media processing**
- `MediaMessage` already received by all bots but ignored
- HoloClaw processes it: user uploads PDF, image, code file → agent analyzes and incorporates
- "Drop your architecture doc here and I'll review it"
- Feasibility: **Medium** — need to fetch media content, pass to LLM as context

**11. Tool audit trail**
- Every tool call logged: requester identity, tool, args, result, timestamp, approval status
- New `ToolExecutionLogEntity` in PostgreSQL
- Same LangChain callback handler used for live feed
- Queryable: "show me everything the agent did in this workspace"
- Feasibility: **Easy** — new DB entity, callback hook

**12. Template workspaces**
- Pre-built agent-packs for common scenarios
- `holoclaw-research`: browser + search + note-taking tools
- `holoclaw-code`: GitHub MCP + shell + code execution
- `holoclaw-devops`: Docker + monitoring + deploy tools
- `holoclaw-content`: writing + social + media tools
- Admin picks template at workspace creation; workspace inherits tool set
- Feasibility: **Easy** — just different agent-pack.yaml files

**13. Async task mode**
- User submits a long task, disconnects, agent works in background
- VS Agent delivers the result when user reconnects (messages are queued)
- Requires a job queue (Bull/BullMQ + Redis)
- Feasibility: **Hard** — significant infrastructure addition, not for MVP

**14. Online presence**
- Show which workspace members are currently connected
- `WorkspaceMemberEntity.lastSeenAt` updated on each message
- Displayed in workspace status / contextual menu description
- Feasibility: **Medium** — track last activity, show as part of workspace status

---

## Open architectural questions for you to resolve

These are the decisions that need the most careful thought. Don't just pick the easy answer.

### Q1: Invite token vs. workspace membership credential

Two approaches to workspace joining:
- **Token** (simple): Admin generates a short-lived token string. Invitee pastes it in chat. Cheap to implement, works today, but token must be re-issued after expiry.
- **VC credential** (Hologram-native): HoloClaw issues a `WorkspaceMemberCredential`. Invitee presents it to rejoin anytime. Persistent across app reinstalls. Requires wiring VS Agent credential issuance.

Which is better for MVP? Can both coexist? Does the credential approach create any UX friction
(user has to accept a VC, then present it later)?

### Q2: Role source for MVP

Two options:
- **Credential-driven** (RBAC spec default): Roles come from `rolesAttribute` in the user's VC. Clean, spec-compliant, but requires a real credential issuance setup.
- **Bot-assigned** (simpler): At invite time, admin assigns the role. Role stored in `WorkspaceMemberEntity`. No credential complexity. Upgrade to VC-driven roles in V2.

The RBAC spec supports both (the `adminUsers` field is the bootstrap escape hatch). But what's the
right MVP story?

### Q3: Workspace memory model

Options for shared memory:
- **Fully shared**: All members read and write the same chat history. Everyone sees everything the AI said to anyone.
- **Per-member + shared broadcast**: Each member has their own thread with the AI, but tool execution events and key outputs are broadcast to all.
- **Role-scoped**: `admin` and `collaborator` see full history. `observer` sees a summary feed. `approver` sees only approval requests.

The fully shared model is simplest and most viral ("everyone sees the same AI"). But it may not be
what enterprise users want. What should the default be?

### Q4: BYOK in MVP or V2?

BYOK adds significant complexity (per-session LlmService, encryption/decryption on every request).
But it's part of the core pitch ("your keys, your costs, your privacy").

Without BYOK, HoloClaw uses a shared API key configured at deployment time — fine for a demo, but
not the full vision. Is the viral demo good enough without BYOK, or does BYOK need to be there
from day one to tell the right story?

### Q5: Observer role mechanics

`observer` can join and watch but cannot interact with the AI. Two implementation options:
- **Silent rejection**: Bot receives observer's message, checks role, sends back "you are in observer mode" and discards.
- **Read receipt only**: Bot never processes observer input at all. Observer sees the conversation but cannot even attempt to send.

What's the right UX? Should observers be able to interact with menus (e.g., see the workspace status menu) or truly read-only?

### Q6: Workspace scope vs. bot-wide scope

Is HoloClaw one bot that hosts many workspaces (multi-tenant)? Or one bot = one workspace?

- **Multi-tenant**: Single deployment, many teams, each with their own workspace. More scalable,
  more complex. Requires workspace isolation in memory, tool config, and audit logs.
- **Single-workspace**: One deployment = one team's workspace. Simpler, matches existing bot patterns
  (Twitter bot is per-account). Admin configures everything in the agent-pack at deploy time.

The single-workspace model is closer to existing Hologram bot patterns and reduces complexity.
But multi-tenant is more powerful and more of a platform. Which is the right V1?

---

## The viral demo to keep in mind

When designing, always check: **does this produce a 30-second demo that makes someone say "I've never seen that before"?**

The target demo:
1. Someone opens HoloClaw, creates a workspace "Competitor analysis Q2"
2. Drops in a GitHub MCP server URL → agent immediately gains 20 GitHub tools
3. Asks the agent: "Research our top 5 competitors on GitHub and summarize their recent activity"
4. Agent starts working — everyone in the chat sees tool calls happening live: "Searching repositories... Reading README... Analyzing commits..."
5. A colleague scans a QR, joins as collaborator, sees the live feed
6. One tool call is flagged as "requires approval" (e.g., `create_issue`) → approver gets a notification
7. Approver approves → agent continues
8. Final report delivered to both participants simultaneously

That demo is impossible to replicate in ChatGPT, Claude, or OpenClaw. That's the bar.

---

## Repo context

```
Project repo (empty, ready to build):
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-holoclaw-bot-vs/

Base agent to fork from:
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-generic-ai-agent-vs/

RBAC spec (read this first):
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-generic-ai-agent-vs/docs/rbac-approval-spec.md

Other bots (for patterns):
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-twitter-bot-vs-fork/
/Users/samsepiol/Downloads/GithubRepos/Work/2060-io/hologram-concieragent-demo-vs/

GitHub org (52 public repos):
https://github.com/2060-io
```

Tech stack (consistent with all Hologram bots):
- NestJS + TypeScript (strict)
- TypeORM + PostgreSQL
- Redis (memory + caching)
- LangChain (LLM + tools)
- `@2060.io/vs-agent-nestjs-client` v1.5.5
- VS Agent Docker image: `io2060/vs-agent:latest`
- Docker Compose for local dev

---

## What to produce

Before any implementation, produce:

1. **Architecture decision record** — resolve the 6 open questions above with reasoning
2. **Data model** — all new entities (Workspace, WorkspaceMember, ApprovalRequest, ToolExecutionLog, etc.) with fields and relationships
3. **State machine** — complete `StateStep` enum with all new states and transitions
4. **Agent-pack schema additions** — new fields needed in agent-pack.yaml for HoloClaw
5. **Component inventory** — all new services/modules and what each is responsible for
6. **MVP scope** — exactly what is and is not in the first version
7. **Build sequence** — the order to build things so each step is independently testable

Only after this design work is solid should implementation begin.
