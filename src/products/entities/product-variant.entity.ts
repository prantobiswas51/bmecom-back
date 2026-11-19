import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { numeric } from './money.js';
import { Product } from './product.entity.js';

// One row per combination (e.g. Color=Red, Size=M). Anything left null falls
// back to the parent product's value.
@Index(['productId', 'slug'], { unique: true })
@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode: string | null;

  /** Own URL segment, unique within the product. Generated once, never regenerated. */
  @Column({ type: 'varchar', length: 200 })
  slug: string;

  /** Position in the product's variant list, as entered in the admin. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Units on hand. null = stock is not tracked for this variant. */
  @Column({ type: 'int', nullable: true })
  stock: number | null;

  /** e.g. { "Color": "Red", "Size": "M" } */
  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, string>;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  buyingPrice: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  retailerPrice: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  wholesalePrice: number | null;

  /** Discounted price for this variant; blank follows the product's sale price when this variant has no retailer price of its own. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  salePrice: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoTitle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoKeyPhrase: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  metaKeywords: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
