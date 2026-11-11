import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Product, ProductVisibility } from './entities/product.entity.js';

/** What the storefront shows: live products, and upcoming ones that can't be ordered yet. */
const SHOWN = [ProductVisibility.Live, ProductVisibility.Upcoming];

export const CATALOG_SORTS =['newest', 'price-asc', 'price-desc', 'name'] as const;

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  /** Category slug; matches a product's primary or any secondary category. */
  @IsOptional()
  @Matches(/^[\p{L}\p{N}-]+$/u)
  category?: string;

  @IsOptional()
  @Matches(/^[\p{L}\p{N}-]+$/u)
  brand?: string;

  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort?: (typeof CATALOG_SORTS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

// Cheapest price a shopper can pay: the lowest variant price, with variants that have none
// falling back to the product's own.
const MIN_PRICE = `COALESCE(
  (SELECT MIN(COALESCE(v."retailerPrice", p."retailerPrice")) FROM product_variants v WHERE v."productId" = p.id),
  p."retailerPrice")`;

/** Read-only, public view of the catalog. Only live products ever leave this service. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async list(query: CatalogQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 12, 48);

    const qb = this.products
      .createQueryBuilder('p')
      .where('p.visibility IN (:...shown)', { shown: SHOWN });
    if (query.category) {
      qb.andWhere(
        `(p."primaryCategoryId" IN (SELECT id FROM categories WHERE slug = :category OR "parentId" IN (SELECT id FROM categories WHERE slug = :category))
          OR EXISTS (SELECT 1 FROM product_secondary_categories s JOIN categories c ON c.id = s."categoryId"
                     WHERE s."productId" = p.id AND (c.slug = :category OR c."parentId" IN (SELECT id FROM categories WHERE slug = :category))))`,
        { category: query.category },
      );
    }
    if (query.brand) {
      qb.andWhere('p."brandId" IN (SELECT id FROM brands WHERE slug = :brand)', { brand: query.brand });
    }
    const term = query.q?.trim();
    if (term) {
      qb.andWhere(
        '(p.name ILIKE :term OR p.sku ILIKE :term OR p.barcode ILIKE :term OR p."shortDescription" ILIKE :term)',
        { term: `%${term.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }

    const total = await qb.getCount();

    // Ordering by the computed price breaks TypeORM's paginated entity query, so page over raw ids first.
    const sorted = qb.clone().select('p.id', 'id').addSelect(MIN_PRICE, 'min_price');
    switch (query.sort) {
      case 'price-asc':
        sorted.orderBy('min_price', 'ASC');
        break;
      case 'price-desc':
        sorted.orderBy('min_price', 'DESC');
        break;
      case 'name':
        sorted.orderBy('p.name', 'ASC');
        break;
      default:
        sorted.orderBy('p."createdAt"', 'DESC');
    }
    const ids = (
      await sorted.addOrderBy('p.id', 'ASC').offset((page - 1) * limit).limit(limit).getRawMany<{ id: string }>()
    ).map((r) => r.id);

    const rows = ids.length
      ? await this.products.find({
          where: { id: In(ids) },
          relations: { brand: true, primaryCategory: true, images: true, variants: true },
        })
      : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const items = ids.map((id) => this.toCard(byId.get(id)!));

    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** One live product with everything the product page needs. Cost and wholesale prices stay private. */
  async detail(slug: string) {
    const p = await this.products.findOne({
      where: { slug, visibility: In(SHOWN) },
      relations: { brand: true, primaryCategory: true, secondaryCategories: true, variants: true, images: true },
    });
    if (!p) throw new NotFoundException('Product not found');

    const variants = [...p.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        id: v.id,
        slug: v.slug,
        sku: v.sku ?? p.sku,
        attributes: v.attributes,
        price: v.retailerPrice ?? p.retailerPrice,
      }));
    const prices = variants.length ? variants.map((v) => v.price) : [p.retailerPrice];
    const ref = (c: { name: string; slug: string }) => ({ name: c.name, slug: c.slug });

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      sku: p.sku,
      weight: p.weight,
      upcoming: p.visibility === ProductVisibility.Upcoming,
      brand: p.brand ? ref(p.brand) : null,
      category: p.primaryCategory ? ref(p.primaryCategory) : null,
      secondaryCategories: p.secondaryCategories.map(ref),
      axes: p.axisDefinitions,
      variants,
      images: [...p.images]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ id: i.id, url: i.url, altText: i.altText, variantId: i.variantId })),
      priceFrom: Math.min(...prices),
      priceTo: Math.max(...prices),
      seoTitle: p.seoTitle,
      metaDescription: p.metaDescription,
      metaKeywords: p.metaKeywords,
    };
  }

  /** Top-level categories for the storefront menu, whether or not they have products yet. */
  navCategories() {
    return this.ds.query<{ name: string; slug: string }[]>(
      `SELECT name, slug FROM categories WHERE "parentId" IS NULL ORDER BY name LIMIT 12`,
    );
  }

  /** Categories and brands that have at least one live product, for the shop's filter lists. */
  async filters() {
    const live = `p.visibility IN ('live', 'upcoming')`;
    const [categories, brands] = await Promise.all([
      // A category counts the products in its sub categories too, matching the shop's category filter.
      this.ds.query<{ name: string; slug: string; parentSlug: string | null; count: number }[]>(
        `SELECT c.name, c.slug, parent.slug AS "parentSlug", COUNT(DISTINCT p.id)::int AS count
           FROM categories c
           LEFT JOIN categories parent ON parent.id = c."parentId"
           JOIN products p ON ${live} AND (
                p."primaryCategoryId" = c.id
                OR p."primaryCategoryId" IN (SELECT id FROM categories WHERE "parentId" = c.id)
                OR EXISTS (SELECT 1 FROM product_secondary_categories s
                            WHERE s."productId" = p.id
                              AND (s."categoryId" = c.id
                                   OR s."categoryId" IN (SELECT id FROM categories WHERE "parentId" = c.id))))
          GROUP BY c.id, parent.slug ORDER BY c.name`,
      ),
      this.ds.query<{ name: string; slug: string; count: number }[]>(
        `SELECT b.name, b.slug, COUNT(p.id)::int AS count
           FROM brands b JOIN products p ON ${live} AND p."brandId" = b.id
          GROUP BY b.id ORDER BY b.name`,
      ),
    ]);
    return { categories, brands };
  }

  private toCard(p: Product) {
    const shared = p.images.filter((i) => !i.variantId).sort((a, b) => a.sortOrder - b.sortOrder);
    const lead = shared.find((i) => i.isPrimary) ?? shared[0] ?? p.images[0];
    const prices = p.variants.length
      ? p.variants.map((v) => v.retailerPrice ?? p.retailerPrice)
      : [p.retailerPrice];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      image: lead?.url ?? null,
      imageAlt: lead?.altText ?? null,
      brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
      category: p.primaryCategory ? { name: p.primaryCategory.name, slug: p.primaryCategory.slug } : null,
      grouped: p.variants.length > 0,
      upcoming: p.visibility === ProductVisibility.Upcoming,
      priceFrom: Math.min(...prices),
      priceTo: Math.max(...prices),
    };
  }
}
