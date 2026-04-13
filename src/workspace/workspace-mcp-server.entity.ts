import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'

export type WorkspaceMcpTransport = 'stdio' | 'sse' | 'streamable-http'

/**
 * WorkspaceMcpServerEntity
 *
 * A runtime-registered MCP server that belongs to a single workspace (BYOMCP).
 * Headers are encrypted at rest (AES-256-GCM) so tokens/API keys can be
 * stored safely. The actual MCP client connection is managed by
 * WorkspaceMcpService at runtime; only metadata + encrypted headers persist.
 */
@Entity('workspace_mcp_server')
@Unique(['workspaceId', 'name'])
@Index(['workspaceId'])
export class WorkspaceMcpServerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  workspaceId: string

  /** Short server nickname shown in tool lists (e.g. "github"). */
  @Column({ type: 'varchar', length: 120 })
  name: string

  @Column({ type: 'varchar', length: 32 })
  transport: WorkspaceMcpTransport

  @Column({ type: 'text', nullable: true })
  url?: string

  /** JSON blob encrypted with AES-256-GCM. Holds { headers: {...} } */
  @Column({ type: 'bytea', nullable: false })
  encryptedConfig: Buffer

  @Column({ type: 'bytea', nullable: false })
  iv: Buffer

  @Column({ type: 'bytea', nullable: false })
  authTag: Buffer

  /** Tool-access policy (role allow lists + approval rules) stored as JSON. */
  @Column({ type: 'jsonb', nullable: true })
  toolAccess?: Record<string, unknown>

  @Column({ type: 'varchar', length: 255 })
  addedBy: string

  @CreateDateColumn()
  addedAt: Date
}
