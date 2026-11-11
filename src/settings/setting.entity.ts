import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** One row per settings group (e.g. "theme", "currency"), the value being a JSON document. */
@Entity('settings')
export class Setting {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  key: string;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  @UpdateDateColumn()
  updatedAt: Date;
}
