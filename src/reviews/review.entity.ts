import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/user.entity.js';

export enum ReviewStatus {
  Published = 'published',
  Hidden = 'hidden',
}

// One review per shopper per product (admin-written ones have no shopper and are not limited). The author's name is copied so it survives account edits.
@Entity('reviews')
@Index(['productId', 'userId'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'uuid' })
  productId: string;

  /** Empty for a review an admin wrote or imported on a shopper's behalf. */
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: Relation<User> | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100 })
  authorName: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  body: string;

  /** The author has a (non-cancelled) order containing this product. */
  @Column({ type: 'boolean', default: false })
  verifiedPurchase: boolean;

  @Index()
  @Column({ type: 'enum', enum: ReviewStatus, default: ReviewStatus.Published })
  status: ReviewStatus;

  @CreateDateColumn()
  createdAt: Date;
}
