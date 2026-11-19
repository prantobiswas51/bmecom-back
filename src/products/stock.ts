import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { StockMovement, StockReason } from './entities/stock-movement.entity.js';

/** One product (or one variant of a grouped product) and how many units. */
export type StockLine = { productId: string | null; variantId: string | null; quantity: number };

const table = (variantId: string | null) => (variantId ? 'product_variants' : 'products');
const idOf = (l: { productId: string | null; variantId: string | null }) => l.variantId ?? l.productId;

type Stocked = { stock: number | null }[];

/** TypeORM answers a raw UPDATE ... RETURNING with [rows, count] instead of just the rows. */
async function update(m: EntityManager, sql: string, params: unknown[]): Promise<Stocked> {
  const res = (await m.query(sql, params)) as Stocked | [Stocked, number];
  return Array.isArray(res[0]) ? (res[0] as Stocked) : (res as Stocked);
}

/** Merges lines that point at the same product and variant into one. */
export function mergeLines(lines: StockLine[]): StockLine[] {
  const merged = new Map<string, StockLine>();
  for (const l of lines) {
    if (!idOf(l)) continue; // the product was deleted since the order was placed
    const key = `${l.productId}:${l.variantId ?? ''}`;
    const seen = merged.get(key);
    merged.set(key, seen ? { ...seen, quantity: seen.quantity + l.quantity } : { ...l });
  }
  return [...merged.values()];
}

/**
 * Takes units out of stock for an order. Products that don't track stock are skipped; one that tracks
 * it must have enough, or the whole order fails. The check and the subtraction are a single statement,
 * so two shoppers can't both take the last unit. Call inside the order's transaction.
 */
export async function takeStock(m: EntityManager, lines: StockLine[], orderNumber: string, names: Map<string, string> = new Map()) {
  for (const l of mergeLines(lines).filter((x) => x.quantity > 0)) {
    const rows = await update(
      m,
      `UPDATE ${table(l.variantId)} SET stock = stock - $1 WHERE id = $2 AND (stock IS NULL OR stock >= $1) RETURNING stock`,
      [l.quantity, idOf(l)],
    );
    if (rows.length === 0) {
      const left = await m.query<{ stock: number | null }[]>(`SELECT stock FROM ${table(l.variantId)} WHERE id = $1`, [idOf(l)]);
      const name = names.get(`${l.productId}:${l.variantId ?? ''}`) ?? 'An item';
      const available = left[0]?.stock ?? 0;
      throw new BadRequestException(
        available > 0 ? `${name}: only ${available} left in stock.` : `${name} is out of stock.`,
      );
    }
    const balance = rows[0].stock;
    if (balance !== null) {
      await m.insert(StockMovement, {
        productId: l.productId!,
        variantId: l.variantId,
        change: -l.quantity,
        balance,
        reason: StockReason.Order,
        orderNumber,
      });
    }
  }
}

/** Puts units back (a cancelled or returned order, or a smaller one). Untracked products are skipped. */
export async function returnStock(m: EntityManager, lines: StockLine[], orderNumber: string) {
  for (const l of mergeLines(lines).filter((x) => x.quantity > 0)) {
    const rows = await update(
      m,
      `UPDATE ${table(l.variantId)} SET stock = stock + $1 WHERE id = $2 AND stock IS NOT NULL RETURNING stock`,
      [l.quantity, idOf(l)],
    );
    if (rows.length === 0) continue;
    await m.insert(StockMovement, {
      productId: l.productId!,
      variantId: l.variantId,
      change: l.quantity,
      balance: rows[0].stock!,
      reason: StockReason.OrderRelease,
      orderNumber,
    });
  }
}
