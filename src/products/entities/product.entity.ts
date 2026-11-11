import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from './brand.entity.js';
import { Category } from './category.entity.js';
import { numeric } from './money.js';
import { ProductImage } from './product-image.entity.js';
import { ProductVariant } from './product-variant.entity.js';

export enum ProductVisibility {
  Live = 'live',
  /** Shown in the store with its details, but can't be ordered yet. */
  Upcoming = 'upcoming',
  Hidden = 'hidden',
  Draft = 'draft',
}

export interface AxisDefinition {
  name: string;
  values: string[];
}

// There is no "type" column: a product with variants is a grouped product,
// one without is single. Grouped products describe their axes here and keep
// one ProductVariant row per combination.
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Generated from the name on create and never changed, so URLs stay stable. */
  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  shortDescription: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Unique when set. Grouped products usually leave it empty and give each variant its own. */
  @Column({ type: 'varchar', unique: true, nullable: true })
  sku: string | null;

  /** The maker's printed barcode. Not unique: different items can share one. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numeric })
  weight: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  buyingPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  retailerPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numeric })
  wholesalePrice: number | null;

  @Column({ type: 'enum', enum: ProductVisibility, default: ProductVisibility.Draft })
  visibility: ProductVisibility;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoTitle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoKeyPhrase: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  metaKeywords: string | null;

  @Column({ type: 'jsonb', default: [] })
  axisDefinitions: AxisDefinition[];

  @ManyToOne(() => Brand, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand | null;

  @Column({ type: 'uuid', nullable: true })
  brandId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryCategoryId' })
  primaryCategory: Category | null;

  @Column({ type: 'uuid', nullable: true })
  primaryCategoryId: string | null;

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'product_secondary_categories',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  secondaryCategories: Category[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: ProductVariant[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
