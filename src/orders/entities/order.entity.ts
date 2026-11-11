import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/user.entity.js';
import { OrderItem } from './order-item.entity.js';

export enum OrderStatus {
  New = 'new',
  Processing = 'processing',
  Hold = 'hold',
  HandedToCourier = 'handed_to_courier',
  Shipping = 'shipping',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
  Returned = 'returned',
}

/** Statuses this project used before the current set, and what they became. Applied by `renameLegacyOrderStatuses`. */
export const LEGACY_STATUS: Record<string, OrderStatus> = {
  pending: OrderStatus.New,
  confirmed: OrderStatus.Processing,
  shipped: OrderStatus.Shipping,
};

export enum PaymentMethod {
  CashOnDelivery = 'cod',
}

// Money is whole taka, so plain integers.
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** What the customer sees, e.g. BM240315-48213. */
  @Column({ type: 'varchar', unique: true })
  orderNumber: string;

  /** Lets a guest open their confirmation page without an account; never shown in lists. */
  @Column({ type: 'varchar', length: 40 })
  accessKey: string;

  /** The signed-in customer (a user), or null for a guest order. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User> | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.New })
  status: OrderStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CashOnDelivery })
  paymentMethod: PaymentMethod;

  @Column()
  customerName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'text' })
  address: string;

  /** No longer asked at checkout (the address says it all); kept for orders placed before. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int' })
  subtotal: number;

  @Column({ type: 'int' })
  shippingFee: number;

  @Column({ type: 'int' })
  total: number;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  /** When each step happened, for the order timeline and the shipping and delivery dates. */
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  handedToCourierAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;
}
