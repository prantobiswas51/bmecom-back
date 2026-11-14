import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum BlogStatus {
  Draft = 'draft',
  Published = 'published',
}

@Entity('blog_posts')
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 220 })
  slug: string;

  /** Short summary for the list page and search engines. */
  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  /** HTML written in the admin rich text editor; cleaned on save. */
  @Column({ type: 'text', default: '' })
  content: string;

  /** An uploaded path like /uploads/x.jpg, or a full URL. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImage: string | null;

  @Index()
  @Column({ type: 'enum', enum: BlogStatus, default: BlogStatus.Draft })
  status: BlogStatus;

  /** Set the first time the post is published; the list is ordered by it. */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
