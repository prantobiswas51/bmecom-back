import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { AdjustStockDto, ListStockDto } from './dto/stock.dto.js';
import { StockMovement, StockReason } from './entities/stock-movement.entity.js';

const PAGE_SIZE = 25;
/** At or below this many units a tracked item counts as running low. */
export const LOW_STOCK = 5;

// One row per thing that can be sold: a single product, or each variant of a grouped one.
const ITEMS = `
  SELECT p.id AS "productId", NULL::uuid AS "variantId", p.name, NULL::jsonb AS attributes,
         p.sku, p.stock, p.visibility, 0 AS "sortOrder",
         (SELECT i.url FROM product_images i WHERE i."productId" = p.id AND i."variantId" IS NULL
           ORDER BY i."isPrimary" DESC, i."sortOrder" LIMIT 1) AS image
    FROM products p
   WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v."productId" = p.id)
  UNION ALL
  SELECT p.id, v.id, p.name, v.attributes, COALESCE(v.sku, p.sku), v.stock, p.visibility, v."sortOrder",
         (SELECT i.url FROM product_images i WHERE i."productId" = p.id
           ORDER BY (i."variantId" = v.id) DESC NULLS LAST, (i."variantId" IS NULL) DESC, i."isPrimary" DESC, i."sortOrder" LIMIT 1)
    FROM product_variants v JOIN products p ON p.id = v."productId"`;

type Item = {
  productId: string;
  variantId: string | null;
  name: string;
  attributes: Record<string, string> | null;
  sku: string | null;
  stock: number | null;
  visibility: string;
  image: string | null;
};

@Injectable()
export class StockService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(query: ListStockDto) {
    const page = query.page ?? 1;
    const params: unknown[] = [];
    const where: string[] = [];
    const term = query.q?.trim();
    if (term) {
      params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR attributes::text ILIKE $${params.length})`);
    }
    const base = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const filters: Record<string, string> = {
      low: `stock IS NOT NULL AND stock > 0 AND stock <= ${LOW_STOCK}`,
      out: 'stock IS NOT NULL AND stock <= 0',
      untracked: 'stock IS NULL',
    };
    const extra = query.filter && query.filter !== 'all' ? `${base ? ' AND' : 'WHERE'} ${filters[query.filter]}` : '';

    const rows = await this.ds.query<Item[]>(
      `SELECT * FROM (${ITEMS}) s ${base}${extra} ORDER BY name, "sortOrder" LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    );
    // The counts on the filter tabs ignore the active filter but respect the search.
    const [c] = await this.ds.query<{ all: number; low: number; out: number; untracked: number }[]>(
      `SELECT COUNT(*)::int AS "all",
              COUNT(*) FILTER (WHERE ${filters.low})::int AS low,
              COUNT(*) FILTER (WHERE ${filters.out})::int AS out,
              COUNT(*) FILTER (WHERE ${filters.untracked})::int AS untracked
         FROM (${ITEMS}) s ${base}`,
      params,
    );
    const total = c[(query.filter ?? 'all') as keyof typeof c];
    return {
      items: rows.map((r) => ({ ...r, variantLabel: r.attributes ? Object.values(r.attributes).join(' / ') : null, attributes: undefined })),
      counts: c,
      lowAt: LOW_STOCK,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async history(productId: string, variantId?: string) {
    return this.ds.getRepository(StockMovement).find({
      where: { productId, variantId: variantId ?? IsNull() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** A manual change: stock received, a correction, a physical count, or switching tracking off. */
  async adjust(dto: AdjustStockDto, by: string) {
    return this.ds.transaction(async (m) => {
      const table = dto.variantId ? 'product_variants' : 'products';
      const id = dto.variantId ?? dto.productId;
      // The row is locked until the end, so a concurrent order or adjustment waits instead of overwriting.
      const found = await m.query<{ stock: number | null; productId: string | null; grouped: boolean }[]>(
        dto.variantId
          ? `SELECT stock, "productId", true AS grouped FROM product_variants WHERE id = $1 FOR UPDATE`
          : `SELECT stock, id AS "productId", EXISTS (SELECT 1 FROM product_variants v WHERE v."productId" = products.id) AS grouped
               FROM products WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = found[0];
      if (!row || row.productId !== dto.productId) throw new NotFoundException('Product not found');
      if (!dto.variantId && row.grouped) throw new BadRequestException('Choose a variant: this product keeps its stock per variant');

      if (dto.mode === 'untrack') {
        await m.query(`UPDATE ${table} SET stock = NULL WHERE id = $1`, [id]);
        return { stock: null };
      }
      if (dto.quantity == null) throw new BadRequestException('Enter a quantity');

      const before = row.stock;
      let after: number;
      if (dto.mode === 'set') {
        if (dto.quantity < 0) throw new BadRequestException('The count cannot be negative');
        after = dto.quantity;
      } else {
        if (before === null) throw new BadRequestException('Stock is not tracked yet: set a count first');
        if (dto.quantity === 0) throw new BadRequestException('Enter a quantity above or below zero');
        after = before + dto.quantity;
        if (after < 0) throw new BadRequestException(`Only ${before} on hand, so that many cannot be removed`);
      }
      const change = after - (before ?? 0);
      await m.query(`UPDATE ${table} SET stock = $1 WHERE id = $2`, [after, id]);
      if (change !== 0 || before === null) {
        await m.insert(StockMovement, {
          productId: dto.productId,
          variantId: dto.variantId ?? null,
          change,
          balance: after,
          reason: dto.mode === 'set' ? StockReason.Count : dto.reason === 'restock' ? StockReason.Restock : StockReason.Adjustment,
          note: dto.note?.trim() || null,
          by,
        });
      }
      return { stock: after };
    });
  }
}
