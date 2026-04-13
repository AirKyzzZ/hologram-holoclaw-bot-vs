import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'

export type WorkspaceRole = 'owner' | 'collaborator' | 'observer' | 'approver' | string

@Entity('workspace_member')
@Unique(['workspaceId', 'userIdentity'])
@Index(['workspaceId'])
@Index(['connectionId'])
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  workspaceId: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  connectionId?: string

  @Column({ type: 'varchar', length: 255 })
  userIdentity: string

  @Column({ type: 'varchar', length: 64 })
  role: WorkspaceRole

  @CreateDateColumn()
  joinedAt: Date

  @UpdateDateColumn()
  lastSeenAt: Date
}
