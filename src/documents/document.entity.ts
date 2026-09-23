import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm'

export enum DocumentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('documents')
@Index(['isDeleted', 'createdAt'])
export class Document {
  // Definite-assignment assertions (!) — TypeORM hydrates these from the
  // database at runtime; the constructor never sees them. This is the
  // TypeORM-recommended pattern that keeps strict mode on everywhere else.
  @PrimaryColumn('varchar', { length: 255 })
  id!: string

  @Column('varchar', { length: 255 })
  filename!: string

  @Column('varchar', { length: 100 })
  mimeType!: string

  @Column('bigint')
  size!: number

  @Column('text', { nullable: true })
  description!: string | null

  @Column('jsonb', { default: {} })
  metadata!: Record<string, unknown>

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status!: DocumentStatus

  @Column('boolean', { default: false })
  isDeleted!: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null
}