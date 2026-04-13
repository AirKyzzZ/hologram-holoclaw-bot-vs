import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('workspace')
@Index(['ownerIdentity'])
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 120 })
  name: string

  @Column({ type: 'text', nullable: true })
  goal?: string

  @Column({ type: 'varchar', length: 255 })
  ownerIdentity: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
