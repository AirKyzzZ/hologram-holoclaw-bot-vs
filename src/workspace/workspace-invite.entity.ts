import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('workspace_invite')
@Index(['workspaceId'])
export class WorkspaceInviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  workspaceId: string

  @Column({ type: 'varchar', length: 64, unique: true })
  token: string

  @Column({ type: 'varchar', length: 64 })
  role: string

  @Column({ type: 'varchar', length: 255 })
  issuedBy: string

  @Column({ type: 'timestamptz' })
  expiresAt: Date

  @Column({ type: 'int', default: 1 })
  usesRemaining: number

  @Column({ type: 'boolean', default: false })
  revoked: boolean

  @CreateDateColumn()
  createdAt: Date
}
