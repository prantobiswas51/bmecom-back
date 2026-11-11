import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product, ProductVisibility } from '../products/entities/product.entity.js';
import type { EditOrderDto, ListOrdersAdminDto } from './dto/order.dto.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The column that records when an order reached each status. */
const STATUS_DATE = {
  [OrderStatus.Processing]: 'confirmedAt',
  [OrderStatus.HandedToCourier]: 'handedToCourierAt',
  [OrderStatus.Shipping]: 'shippedAt',
  [OrderStatus.Delivered]: 'deliveredAt',
  [OrderStatus.Cancelled]: 'cancelledAt',
  [OrderStatus.Returned]: 'returnedAt',
} as const;

/** Orders can be edited until they are handed to the courier. */
const EDITABLE = [OrderStatus.New, OrderStatus.Processing, OrderStatus.Hold];

/** Where an order may go next. A cancelled order can be reopened, in case it was cancelled by mistake. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.New]: [OrderStatus.Processing, OrderStatus.Hold, OrderStatus.Cancelled],
  [OrderStatus.Processing]: [OrderStatus.HandedToCourier, OrderStatus.Hold, OrderStatus.Cancelled],
  [OrderStatus.Hold]: [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.HandedToCourier]: [OrderStatus.Shipping, OrderStatus.Returned],
  [OrderStatus.Shipping]: [OrderStatus.Delivered, OrderStatus.Returned],
  [OrderStatus.Delivered]: [OrderStatus.Returned],
  [OrderStatus.Cancelled]: [OrderStatus.New],
  [OrderStatus.Returned]: [],
};

@Injectable()
export class OrdersAdminService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly pricing: OrdersService,
  ) {}

  /** Live products (one row per variant) that can be added to an order, priced as of now. */
  async searchProducts(q: string) {
    const term = q.trim();
    if (!term) return [];
    const rows = await this.products.find({
      where: [
        { visibility: ProductVisibility.Live, name: ILike(`%${term}%`) },
        { visibility: ProductVisibility.Live, sku: ILike(`%${term}%`) },
      ],
      relations: { variants: true, images: true },
      take: 8,
    });
    return rows.flatMap((p) => {
      const variantIds = p.variants.length > 0 ? p.variants.map((v) => v.id) : [undefined];
      return variantIds.flatMap((variantId) => {
        const line = this.pricing.priceLine(p, { productId: p.id, variantId, quantity: 1 });
        return line ? [{ productId: line.productId, variantId: line.variantId, name: line.name, variantLabel: line.variantLabel, sku: line.sku, image: line.image, unitPrice: line.unitPrice }] : [];
      });
    });
  }

  async list(query: ListOrdersAdminDto) {
    const page = query.page ?? 1;
    const qb = this.orders
      .createQueryBuilder('o')
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.from) qb.andWhere('o.createdAt >= :from', { from: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('o.createdAt <= :to', { to: new Date(`${query.to}T23:59:59.999`) });
    if (query.active === 'true') {
      qb.andWhere('o.status NOT IN (:...done)', { done: [OrderStatus.Delivered, OrderStatus.Cancelled, OrderStatus.Returned] });
    }
    const categoryIds = (query.categories ?? '').split(',').filter((id) => UUID.test(id));
    if (categoryIds.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM order_items oi JOIN products p ON p.id = oi."productId"
                 WHERE oi."orderId" = o.id AND (p."primaryCategoryId" IN (:...cats)
                   OR EXISTS (SELECT 1 FROM product_secondary_categories s WHERE s."productId" = p.id AND s."categoryId" IN (:...cats))))`,
        { cats: categoryIds },
      );
    }
    if (query.q?.trim()) {
      qb.andWhere('(o.orderNumber ILIKE :q OR o.customerName ILIKE :q OR o.phone ILIKE :q)', { q: `%${query.q.trim()}%` });
    }
    const [rows, total] = await qb.getManyAndCount();
    // Units per order, fetched for just this page.
    const units = rows.length
      ? await this.orders.manager.query<{ orderId: string; n: string }[]>(
          `SELECT "orderId", SUM(quantity)::int AS n FROM order_items WHERE "orderId" = ANY($1) GROUP BY "orderId"`,
          [rows.map((o) => o.id)],
        )
      : [];
    const unitsOf = new Map(units.map((u) => [u.orderId, Number(u.n)]));

    // How many orders are in each status, for the tabs above the list.
    const grouped = await this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; n: string }>();
    const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const g of grouped) counts[g.status] = Number(g.n);

    return {
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerName: o.customerName,
        phone: o.phone,
        total: o.total,
        itemCount: unitsOf.get(o.id) ?? 0,
        shippedAt: o.shippedAt,
        deliveredAt: o.deliveredAt,
        guest: o.userId === null,
        createdAt: o.createdAt,
      })),
      counts,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async get(orderNumber: string) {
    const order = await this.orders.findOne({ where: { orderNumber }, relations: { items: true, user: true } });
    if (!order) throw new NotFoundException('Order not found');
    const { accessKey: _accessKey, user, ...rest } = order;
    void _accessKey;
    return {
      ...rest,
      customer: user ? { id: user.id, email: user.email, name: user.name } : null,
      nextStatuses: NEXT_STATUSES[order.status],
      editable: EDITABLE.includes(order.status),
    };
  }

  async setStatus(orderNumber: string, status: OrderStatus) {
    const order = await this.orders.findOneBy({ orderNumber });
    if (!order) throw new NotFoundException('Order not found');
    if (!NEXT_STATUSES[order.status].includes(status)) {
      throw new BadRequestException(`An order that is ${order.status} cannot be changed to ${status}`);
    }
    // Reopening clears the cancellation; otherwise record when the step first happened (going on hold records nothing).
    let stamp: Partial<Record<(typeof STATUS_DATE)[keyof typeof STATUS_DATE], Date | null>> = {};
    if (status === OrderStatus.New) stamp = { cancelledAt: null };
    else if (status in STATUS_DATE) {
      const column = STATUS_DATE[status as keyof typeof STATUS_DATE];
      stamp = { [column]: order[column] ?? new Date() };
    }
    await this.orders.update({ id: order.id }, { status, ...stamp });
    return this.get(orderNumber);
  }

  /** Changes the contact details, address, delivery charge and the quantities on an order that has not shipped. */
  async edit(orderNumber: string, dto: EditOrderDto) {
    const order = await this.orders.findOne({ where: { orderNumber }, relations: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!EDITABLE.includes(order.status)) {
      throw new BadRequestException(`An order that is ${order.status} can no longer be edited`);
    }
    const existing = new Map(order.items.map((l) => [l.id, l]));
    const kept = new Map<string, OrderItem>(); // existing lines, with their new quantities
    const added: OrderItem[] = [];
    for (const item of dto.items) {
      if (item.id) {
        const line = existing.get(item.id);
        if (!line || kept.has(line.id) || item.productId) throw new BadRequestException('Those items do not match this order');
        line.quantity = item.quantity;
        kept.set(line.id, line);
      } else if (item.productId) {
        const priced = this.pricing.priceLine(
          await this.products.findOne({ where: { id: item.productId, visibility: ProductVisibility.Live }, relations: { variants: true, images: true } }) ?? undefined,
          { productId: item.productId, variantId: item.variantId, quantity: item.quantity },
        );
        if (!priced) throw new BadRequestException('A product you added is no longer available');
        added.push(
          this.orders.manager.create(OrderItem, {
            orderId: order.id,
            productId: priced.productId,
            variantId: priced.variantId,
            name: priced.name,
            variantLabel: priced.variantLabel,
            sku: priced.sku,
            image: priced.image,
            unitPrice: priced.unitPrice,
            quantity: priced.quantity,
          }),
        );
      } else {
        throw new BadRequestException('Each item needs an id or a productId');
      }
    }
    // Adding a product that is already on the order raises that line instead of making a second one.
    const lines: OrderItem[] = [...kept.values()];
    for (const a of added) {
      const same = lines.find((l) => l.productId === a.productId && l.variantId === a.variantId);
      if (same) same.quantity = Math.min(99, same.quantity + a.quantity);
      else lines.push(a);
    }
    for (const line of lines) line.lineTotal = line.unitPrice * line.quantity;
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const removed = order.items.filter((l) => !kept.has(l.id)).map((l) => l.id);

    await this.orders.manager.transaction(async (tx) => {
      if (removed.length > 0) await tx.delete(OrderItem, removed);
      await tx.save(OrderItem, lines);
      await tx.update(Order, order.id, {
        customerName: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        address: dto.address,
        note: dto.note ?? null,
        shippingFee: dto.shippingFee,
        subtotal,
        total: subtotal + dto.shippingFee,
      });
    });
    return this.get(orderNumber);
  }
}
