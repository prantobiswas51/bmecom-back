import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Two levels at most: a category, and sub categories under it. A sub category is
// just a category whose parentId is set, so products can use either the same way.
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  /** RESTRICT backs up the service check: a category with sub categories can't just vanish. */
  @ManyToOne(() => Category, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parentId' })
  parent: Category | null;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
