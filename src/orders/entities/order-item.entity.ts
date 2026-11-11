import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Order } from './order.entity.js';

// A snapshot of what was bought. Names and prices are copied so an order never changes when
// the product is edited or deleted later; productId and variantId are only for reference.
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'uuid', nullable: true })
  variantId: string | null;

  @Column()
  name: string;

  /** e.g. "Red / M" for a grouped product's variant. */
  @Column({ type: 'varchar', nullable: true })
  variantLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  image: string | null;

  @Column({ type: 'int' })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  lineTotal: number;
}
