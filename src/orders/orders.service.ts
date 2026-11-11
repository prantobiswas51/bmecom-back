import { randomBytes, randomInt } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Product, ProductVisibility } from '../products/entities/product.entity.js';
import type { CartItemDto, PlaceOrderDto } from './dto/order.dto.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';

/** One flat delivery charge (taka) for every order, wherever it goes. */
export const SHIPPING_FEE = 120;

export type PricedLine = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

/** A cart line the shop can no longer sell: removed, hidden, or its variant is gone. */
export type UnavailableLine = { productId: string; variantId: string | null; unavailable: true };

@Injectable()
export class OrdersService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  /** Prices a cart from the database. The browser's idea of prices is never trusted. */
  async quote(items: CartItemDto[]) {
    // The same product and variant twice is one line.
    const merged = new Map<string, CartItemDto>();
    for (const item of items) {
      const key = `${item.productId}:${item.variantId ?? ''}`;
      const seen = merged.get(key);
      merged.set(key, seen ? { ...seen, quantity: Math.min(99, seen.quantity + item.quantity) } : { ...item });
    }

    const rows = await this.products.find({
      where: { id: In([...new Set(items.map((i) => i.productId))]), visibility: ProductVisibility.Live },
      relations: { variants: true, images: true },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));

    const lines: PricedLine[] = [];
    const unavailable: UnavailableLine[] = [];
    for (const item of merged.values()) {
      const line = this.priceLine(byId.get(item.productId), item);
      if (line) lines.push(line);
      else unavailable.push({ productId: item.productId, variantId: item.variantId ?? null, unavailable: true });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    return { lines, unavailable, subtotal };
  }

  /** Prices one product (and variant) from the database at the current retail price. */
  priceLine(p: Product | undefined, item: CartItemDto): PricedLine | null {
    if (!p) return null;
    const grouped = p.variants.length > 0;
    const variant = grouped ? p.variants.find((v) => v.id === item.variantId) : undefined;
    if (grouped ? !variant : item.variantId) return null;

    const unitPrice = Math.round(variant?.retailerPrice ?? p.retailerPrice);
    const shared = p.images.filter((i) => !i.variantId).sort((a, b) => a.sortOrder - b.sortOrder);
    const own = variant ? p.images.filter((i) => i.variantId === variant.id).sort((a, b) => a.sortOrder - b.sortOrder) : [];
    const lead = own[0] ?? shared.find((i) => i.isPrimary) ?? shared[0] ?? p.images[0];

    return {
      productId: p.id,
      variantId: variant?.id ?? null,
      slug: p.slug,
      name: p.name,
      variantLabel: variant ? Object.values(variant.attributes).join(' / ') : null,
      sku: variant?.sku ?? p.sku,
      image: lead?.url ?? null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    };
  }

  async place(dto: PlaceOrderDto, userId: string | null = null) {
    const { lines, unavailable, subtotal } = await this.quote(dto.items);
    if (unavailable.length > 0) {
      throw new BadRequestException('Some items in your cart are no longer available. Please review your cart.');
    }

    const shippingFee = SHIPPING_FEE;
    const accessKey = randomBytes(12).toString('hex');

    // The number is short enough to read out over the phone, so collisions are possible; retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      const order = this.orders.create({
        orderNumber: this.newOrderNumber(),
        accessKey,
        userId,
        customerName: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        address: dto.address,
        note: dto.note ?? null,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
        items: lines.map((l) =>
          this.ds.getRepository(OrderItem).create({
            productId: l.productId,
            variantId: l.variantId,
            name: l.name,
            variantLabel: l.variantLabel,
            sku: l.sku,
            image: l.image,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          }),
        ),
      });
      try {
        await this.orders.save(order);
        return { orderNumber: order.orderNumber, accessKey, total: order.total };
      } catch (e) {
        const duplicate = (e as { code?: string }).code === '23505';
        if (!duplicate) throw e;
      }
    }
    throw new BadRequestException('Could not place the order. Please try again.');
  }

  /** The confirmation page's view of an order; the access key stands in for a login. */
  async get(orderNumber: string, key: string) {
    const order = await this.orders.findOne({ where: { orderNumber }, relations: { items: true } });
    if (!order || order.accessKey !== key) throw new NotFoundException('Order not found');
    const { accessKey: _accessKey, ...rest } = order;
    void _accessKey;
    return rest;
  }

  /** A signed-in customer's own orders, newest first. */
  async mine(userId: string, page = 1) {
    const take = 10;
    const [rows, total] = await this.orders.findAndCount({
      where: { userId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * take,
      take,
    });
    return {
      items: rows.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        images: o.items.map((i) => i.image).filter((i): i is string => !!i).slice(0, 4),
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async mineOne(userId: string, orderNumber: string) {
    const order = await this.orders.findOne({ where: { orderNumber, userId }, relations: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    const { accessKey: _accessKey, ...rest } = order;
    void _accessKey;
    return rest;
  }

  private newOrderNumber() {
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `BM${stamp}-${randomInt(10000, 100000)}`;
  }
}
