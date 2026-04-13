import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { McpService } from '../mcp/mcp.service'
import { WorkspaceMcpServerEntity, WorkspaceMcpTransport } from './workspace-mcp-server.entity'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/** Short prefix derived from workspaceId — keeps tool names stable + unique. */
export function workspaceServerSlug(workspaceId: string, name: string): string {
  const short = workspaceId.replace(/-/g, '').slice(0, 8)
  const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40)
  return `ws-${short}-${safeName}`
}

export interface AddWorkspaceMcpInput {
  workspaceId: string
  name: string
  transport: WorkspaceMcpTransport
  url?: string
  /** Plain-text headers — encrypted at rest. */
  headers?: Record<string, string>
  /** Optional tool-access override; defaults to collaborator-allow-all. */
  toolAccess?: Record<string, unknown>
  addedBy: string
}

export interface AddWorkspaceMcpResult {
  entity: WorkspaceMcpServerEntity
  slug: string
  /** Tools discovered after the runtime connection succeeded. */
  toolCount: number
}

/**
 * WorkspaceMcpService
 *
 * Runtime registration of MCP servers scoped to a workspace (BYOMCP).
 *
 *  - Encrypts headers at rest (reuses the MCP_CONFIG_ENCRYPTION_KEY key).
 *  - Delegates transport/connection/tool-discovery to McpService.addServer().
 *  - Tool names are prefixed with a workspace slug so two workspaces can
 *    register servers with the same nickname without colliding.
 *  - On startup, re-registers every persisted row so restarts are transparent.
 */
@Injectable()
export class WorkspaceMcpService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceMcpService.name)
  private encryptionKey: Buffer | null = null

  constructor(
    @InjectRepository(WorkspaceMcpServerEntity)
    private readonly repo: Repository<WorkspaceMcpServerEntity>,
    private readonly mcpService: McpService,
  ) {}

  async onModuleInit() {
    const keyHex = process.env.MCP_CONFIG_ENCRYPTION_KEY
    if (keyHex) {
      const buf = Buffer.from(keyHex, 'hex')
      if (buf.length === 32) {
        this.encryptionKey = buf
        this.logger.log('Workspace MCP encryption initialized.')
      } else {
        this.logger.error('MCP_CONFIG_ENCRYPTION_KEY must be 32 bytes (64 hex chars); BYOMCP disabled.')
      }
    } else {
      this.logger.warn('MCP_CONFIG_ENCRYPTION_KEY not set; BYOMCP will be unavailable.')
    }

    // Re-register every persisted workspace server. This gives us cold-start
    // durability: restart the bot and all BYOMCP servers come back online.
    if (this.encryptionKey) {
      await this.restoreAll()
    }
  }

  get isAvailable(): boolean {
    return this.encryptionKey !== null
  }

  async add(input: AddWorkspaceMcpInput): Promise<AddWorkspaceMcpResult> {
    if (!this.encryptionKey) {
      throw new Error('BYOMCP is disabled: MCP_CONFIG_ENCRYPTION_KEY is not configured.')
    }
    const existing = await this.repo.findOne({
      where: { workspaceId: input.workspaceId, name: input.name },
    })
    if (existing) {
      throw new Error(`A server named "${input.name}" already exists in this workspace.`)
    }

    const slug = workspaceServerSlug(input.workspaceId, input.name)
    const { encryptedCfg, iv, authTag } = this.encrypt({ headers: input.headers ?? {} })

    const entity = this.repo.create({
      workspaceId: input.workspaceId,
      name: input.name,
      transport: input.transport,
      url: input.url,
      encryptedConfig: encryptedCfg,
      iv,
      authTag,
      toolAccess: input.toolAccess ?? defaultWorkspaceToolAccess(),
      addedBy: input.addedBy,
    })
    await this.repo.save(entity)

    // Register at runtime. Failure here rolls back the persisted row so we
    // don't end up with a zombie server entry that re-fails on every restart.
    try {
      const toolCount = await this.mcpService.addServer({
        name: slug,
        transport: input.transport,
        url: input.url,
        headers: input.headers,
        accessMode: 'admin-controlled',
        toolAccess: input.toolAccess as any,
      })
      this.logger.log(
        `[BYOMCP] workspace=${input.workspaceId} server="${input.name}" slug="${slug}" tools=${toolCount}`,
      )
      return { entity, slug, toolCount }
    } catch (err) {
      this.logger.error(`[BYOMCP] runtime registration failed: ${err}`)
      // Roll back persisted row on connection failure
      await this.repo.delete({ id: entity.id })
      throw err
    }
  }

  async listForWorkspace(workspaceId: string): Promise<WorkspaceMcpServerEntity[]> {
    return this.repo.find({ where: { workspaceId } })
  }

  async remove(workspaceId: string, name: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { workspaceId, name } })
    if (!entity) return
    const slug = workspaceServerSlug(workspaceId, name)
    await this.mcpService.removeServer(slug)
    await this.repo.delete({ id: entity.id })
    this.logger.log(`[BYOMCP] removed workspace=${workspaceId} server="${name}"`)
  }

  /** Restore every persisted server on startup. Best-effort; errors are logged. */
  private async restoreAll(): Promise<void> {
    const all = await this.repo.find()
    for (const entity of all) {
      try {
        const { headers } = this.decrypt(entity)
        const slug = workspaceServerSlug(entity.workspaceId, entity.name)
        await this.mcpService.addServer({
          name: slug,
          transport: entity.transport,
          url: entity.url,
          headers,
          accessMode: 'admin-controlled',
          toolAccess: entity.toolAccess as any,
        })
        this.logger.log(`[BYOMCP] restored server slug="${slug}" for workspace=${entity.workspaceId}`)
      } catch (err) {
        this.logger.warn(
          `[BYOMCP] failed to restore server "${entity.name}" for workspace=${entity.workspaceId}: ${err}`,
        )
      }
    }
  }

  // ── AES-256-GCM helpers (shared primitive with McpConfigService) ──

  private encrypt(config: { headers: Record<string, string> }): {
    encryptedCfg: Buffer
    iv: Buffer
    authTag: Buffer
  } {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }
    const plaintext = JSON.stringify(config)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH })
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return { encryptedCfg: encrypted, iv, authTag }
  }

  private decrypt(entity: WorkspaceMcpServerEntity): { headers: Record<string, string> } {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, entity.iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(entity.authTag)
    const decrypted = Buffer.concat([decipher.update(entity.encryptedConfig), decipher.final()])
    const parsed = JSON.parse(decrypted.toString('utf8'))
    return { headers: parsed.headers ?? {} }
  }
}

/**
 * Default tool-access policy for a new BYOMCP server: collaborators and owners
 * get access, observers do not. Approver role can be added per-server later.
 */
function defaultWorkspaceToolAccess(): Record<string, unknown> {
  return {
    default: 'none',
    roles: {
      owner: ['*'],
      collaborator: ['*'],
    },
  }
}
