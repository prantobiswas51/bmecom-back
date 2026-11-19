import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum StockReason {
  /** Goods received from a supplier. */
  Restock = 'restock',
  /** A manual fix: damage, loss, a miscount. */
  Adjustment = 'adjustment',
  /** The count was set to a physical count. */
  Count = 'count',
  /** Taken out for an order. */
  Order = 'order',
  /** Put back because an order was cancelled, returned or shrunk. */
  OrderRelease = 'order_release',
}

// The history of one stock count. There are no foreign keys: the log outlives a deleted product.
@Index(['productId', 'variantId', 'createdAt'])
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'uuid', nullable: true })
  variantId: string | null;

  /** Units added (positive) or removed (negative). */
  @Column({ type: 'int' })
  change: number;

  /** Units on hand once this change was applied. */
  @Column({ type: 'int' })
  balance: number;

  @Column({ type: 'enum', enum: StockReason })
  reason: StockReason;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  orderNumber: string | null;

  /** Name of the admin who made a manual change. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  by: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
