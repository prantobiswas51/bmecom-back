import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  type FindOptionsWhere,
  ILike,
  In,
  Not,
  Repository,
} from 'typeorm';
import type {
  CreateProductDto,
  ListProductsDto,
  ProductVariantInputDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import { Brand } from './entities/brand.entity.js';
import { Category } from './entities/category.entity.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product, ProductVisibility, type AxisDefinition } from './entities/product.entity.js';
import { cleanRichText } from './rich-text.js';
import { slugify } from './slugify.js';

const UNIQUE_VIOLATION = '23505';

/** Whole-taka rounding: retail and wholesale prices are shown without paisa. */
const taka = (value: number) => Math.round(value);

/** The price rules every variant is held to once it has inherited from its parent. */
type PriceRow = {
  buyingPrice?: number | null;
  retailerPrice?: number | null;
  wholesalePrice?: number | null;
  attributes?: Record<string, string>;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async list(query: ListProductsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const base: FindOptionsWhere<Product> = {};
    if (query.visibility) base.visibility = query.visibility;
    if (query.brandId) base.brandId = query.brandId;
    if (query.categoryId) base.primaryCategoryId = query.categoryId;

    const term = query.q?.trim();
    const like = term ? ILike(`%${term.replace(/[\\%_]/g, '\\$&')}%`) : undefined;
    const where: FindOptionsWhere<Product>[] = like
      ? [{ ...base, name: like }, { ...base, sku: like }, { ...base, barcode: like }]
      : [base];

    const [rows, total] = await this.products.findAndCount({
      where,
      relations: { brand: true, primaryCategory: true, images: true, variants: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: rows.map((p) => this.toListItem(p)), total, page, limit };
  }

  async get(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: {
        brand: true,
        primaryCategory: true,
        secondaryCategories: true,
        variants: true,
        images: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    product.images.sort((a, b) => a.sortOrder - b.sortOrder);
    product.variants.sort((a, b) => a.sortOrder - b.sortOrder);
    return product;
  }

  async create(dto: CreateProductDto) {
    const id = await this.save(null, dto);
    return this.get(id);
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.products.findOneBy({ id });
    if (!existing) throw new NotFoundException('Product not found');
    await this.save(existing, dto);
    return this.get(id);
  }

  async remove(id: string) {
    const result = await this.products.delete({ id });
    if (!result.affected) throw new NotFoundException('Product not found');
  }

  private async save(existing: Product | null, dto: UpdateProductDto): Promise<string> {
    try {
      return await this.ds.transaction((m) => this.apply(m, existing, dto));
    } catch (e) {
      if ((e as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('A product with the same SKU or URL already exists');
      }
      throw e;
    }
  }

  private async apply(m: EntityManager, existing: Product | null, dto: UpdateProductDto) {
    const product =
      existing ??
      m.create(Product, {
        buyingPrice: 0,
        retailerPrice: 0,
        wholesalePrice: null,
        visibility: ProductVisibility.Draft,
        axisDefinitions: [],
        sku: null,
        barcode: null,
      });

    // --- plain fields ---------------------------------------------------
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.shortDescription !== undefined) product.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) product.description = cleanRichText(dto.description);
    if (dto.sku !== undefined) product.sku = dto.sku ?? null;
    if (dto.barcode !== undefined) product.barcode = dto.barcode ?? null;
    if (dto.weight !== undefined) product.weight = dto.weight;
    if (dto.buyingPrice != null) product.buyingPrice = dto.buyingPrice;
    if (dto.retailerPrice != null) product.retailerPrice = taka(dto.retailerPrice);
    if (dto.wholesalePrice !== undefined) {
      product.wholesalePrice = dto.wholesalePrice == null ? null : taka(dto.wholesalePrice);
    }
    if (dto.visibility !== undefined) product.visibility = dto.visibility;
    if (dto.seoTitle !== undefined) product.seoTitle = dto.seoTitle;
    if (dto.seoKeyPhrase !== undefined) product.seoKeyPhrase = dto.seoKeyPhrase;
    if (dto.metaDescription !== undefined) product.metaDescription = dto.metaDescription;
    if (dto.metaKeywords !== undefined) product.metaKeywords = dto.metaKeywords;

    // --- brand and categories ------------------------------------------
    if (dto.brandId !== undefined) {
      if (dto.brandId && !(await m.existsBy(Brand, { id: dto.brandId }))) {
        throw new BadRequestException('Unknown brand');
      }
      product.brandId = dto.brandId ?? null;
    }
    if (dto.primaryCategoryId !== undefined) {
      if (dto.primaryCategoryId && !(await m.existsBy(Category, { id: dto.primaryCategoryId }))) {
        throw new BadRequestException('Unknown primary category');
      }
      product.primaryCategoryId = dto.primaryCategoryId ?? null;
    }
    if (dto.secondaryCategoryIds !== undefined) {
      const ids = [...new Set(dto.secondaryCategoryIds)].filter(
        (id) => id !== product.primaryCategoryId,
      );
      const found = ids.length ? await m.findBy(Category, { id: In(ids) }) : [];
      if (found.length !== ids.length) throw new BadRequestException('Unknown secondary category');
      product.secondaryCategories = found;
    }

    // --- variants (grouped product) ------------------------------------
    const previous = existing ? await m.findBy(ProductVariant, { productId: existing.id }) : [];
    if (dto.axisDefinitions !== undefined) {
      product.axisDefinitions = this.cleanAxes(dto.axisDefinitions);
    }
    if (dto.variants?.length === 0) product.axisDefinitions = [];

    const wanted = dto.variants;
    if (wanted) this.assertVariantInputs(wanted, previous);
    this.assertPriceRules(product, wanted ?? previous);
    // Only re-check SKUs this request sets; untouched ones already passed before.
    await this.assertSkusFree(m, existing?.id, [
      dto.sku !== undefined ? product.sku : null,
      ...(wanted ?? []).map((v) => v.sku),
    ]);

    // --- write ----------------------------------------------------------
    if (!existing) product.slug = await this.uniqueSlug(m, Product, slugify(product.name));
    await m.save(product);

    let variants = previous;
    if (wanted) {
      const keep = new Set(wanted.map((v) => v.id).filter(Boolean));
      const drop = previous.filter((v) => !keep.has(v.id));
      if (drop.length) await m.remove(drop);
      variants = await m.save(this.toVariantRows(product.id, wanted, previous));
    }

    if (dto.images !== undefined) await this.replaceImages(m, product.id, dto.images, variants, wanted);

    return product.id;
  }

  private cleanAxes(axes: AxisDefinition[]): AxisDefinition[] {
    return axes
      .map((a) => ({
        name: a.name.trim(),
        values: [...new Set(a.values.map((v) => v.trim()).filter(Boolean))],
      }))
      .filter((a) => a.name && a.values.length);
  }

  private assertVariantInputs(wanted: ProductVariantInputDto[], previous: ProductVariant[]) {
    const known = new Set(previous.map((v) => v.id));
    const seen = new Set<string>();
    for (const v of wanted) {
      if (v.id && !known.has(v.id)) throw new BadRequestException('Unknown variant');
      v.attributes = Object.fromEntries(
        Object.entries(v.attributes).map(([k, val]) => [k.trim(), String(val).trim()]),
      );
      const key = JSON.stringify(Object.entries(v.attributes).sort());
      if (seen.has(key)) throw new BadRequestException('Two variants have the same combination');
      seen.add(key);
    }
  }

  /** Buying price may not exceed a selling price; a live product needs something to sell at. */
  private assertPriceRules(product: Product, variants: PriceRow[]) {
    const check = (label: string, row: PriceRow) => {
      const buying = row.buyingPrice ?? product.buyingPrice;
      const retail = row.retailerPrice ?? product.retailerPrice;
      const wholesale = row.wholesalePrice ?? product.wholesalePrice;
      if (retail > 0 && buying > retail) {
        throw new BadRequestException(`${label}: buying price is above the retailer price`);
      }
      if (wholesale != null && wholesale > 0 && buying > wholesale) {
        throw new BadRequestException(`${label}: buying price is above the wholesale price`);
      }
    };
    check('Product', {});
    for (const v of variants) check(`Variant ${Object.values(v.attributes ?? {}).join(' / ')}`, v);

    if (product.visibility === ProductVisibility.Live) {
      const priced =
        product.retailerPrice > 0 ||
        (variants.length > 0 && variants.every((v) => (v.retailerPrice ?? 0) > 0));
      if (!priced) throw new BadRequestException('A live product needs a retailer price above 0');
    }
  }

  private async assertSkusFree(
    m: EntityManager,
    selfId: string | undefined,
    asked: (string | null | undefined)[],
  ) {
    const list = asked.map((s) => s?.trim()).filter((s): s is string => !!s);
    if (new Set(list).size !== list.length) throw new BadRequestException('Duplicate SKU in this product');
    if (!list.length) return;

    const notSelf = selfId ? Not(selfId) : undefined;
    const clash =
      (await m.findOne(Product, { where: { sku: In(list), ...(notSelf && { id: notSelf }) } }))?.sku ??
      (await m.findOne(ProductVariant, { where: { sku: In(list), ...(notSelf && { productId: notSelf }) } }))?.sku;
    if (clash) throw new ConflictException(`SKU "${clash}" is already used by another product`);
  }

  private toVariantRows(productId: string, wanted: ProductVariantInputDto[], previous: ProductVariant[]) {
    const byId = new Map(previous.map((v) => [v.id, v]));
    const kept = new Set(wanted.map((v) => v.id).filter(Boolean));
    const usedSlugs = new Set(previous.filter((v) => kept.has(v.id)).map((v) => v.slug));

    return wanted.map((input, index) => {
      const variant = (input.id && byId.get(input.id)) || new ProductVariant();
      variant.productId = productId;
      variant.sortOrder = index;
      variant.sku = input.sku ?? null;
      variant.barcode = input.barcode ?? null;
      variant.attributes = input.attributes;
      variant.buyingPrice = input.buyingPrice ?? null;
      variant.retailerPrice = input.retailerPrice == null ? null : taka(input.retailerPrice);
      variant.wholesalePrice = input.wholesalePrice == null ? null : taka(input.wholesalePrice);
      variant.seoTitle = input.seoTitle ?? null;
      variant.seoKeyPhrase = input.seoKeyPhrase ?? null;
      variant.metaDescription = input.metaDescription ?? null;
      variant.metaKeywords = input.metaKeywords ?? null;

      // A slug, once given, is never regenerated: moving an indexed URL loses its ranking.
      if (!variant.slug) {
        const base = slugify(Object.values(input.attributes).join(' ') || input.sku || 'variant');
        let slug = base;
        for (let n = 1; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
        variant.slug = slug;
        usedSlugs.add(slug);
      }
      return variant;
    });
  }

  private async replaceImages(
    m: EntityManager,
    productId: string,
    images: NonNullable<UpdateProductDto['images']>,
    variants: ProductVariant[],
    wanted: ProductVariantInputDto[] | undefined,
  ) {
    const variantIds = new Set(variants.map((v) => v.id));
    // `variants` is in request order when this request set them, so variantIndex maps straight across.
    const rows = images.map((img, i) => {
      let variantId = img.variantId ?? null;
      if (!variantId && img.variantIndex != null) {
        variantId = (wanted ? variants[img.variantIndex]?.id : undefined) ?? null;
        if (!variantId) throw new BadRequestException('Image points at a variant that does not exist');
      }
      if (variantId && !variantIds.has(variantId)) throw new BadRequestException('Unknown variant on image');
      return m.create(ProductImage, {
        productId,
        url: img.url.trim(),
        altText: img.altText ?? null,
        variantId,
        sortOrder: i,
        isPrimary: false,
      });
    });

    // One lead photo among the shared ones: the first marked, else the first.
    const shared = rows.filter((r) => !r.variantId);
    const lead = images.findIndex((img, i) => img.isPrimary && !rows[i].variantId);
    const primary = lead >= 0 ? rows[lead] : shared[0];
    if (primary) primary.isPrimary = true;

    await m.delete(ProductImage, { productId });
    if (rows.length) await m.save(rows);
  }

  private async uniqueSlug(m: EntityManager, entity: typeof Product, base: string) {
    let slug = base;
    for (let n = 1; await m.existsBy(entity, { slug }); n++) slug = `${base}-${n}`;
    return slug;
  }

  private toListItem(p: Product) {
    const shared = p.images.filter((i) => !i.variantId).sort((a, b) => a.sortOrder - b.sortOrder);
    const lead = shared.find((i) => i.isPrimary) ?? shared[0] ?? p.images[0];
    const prices = p.variants.length
      ? p.variants.map((v) => v.retailerPrice ?? p.retailerPrice)
      : [p.retailerPrice];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      barcode: p.barcode,
      visibility: p.visibility,
      type: p.variants.length ? ('grouped' as const) : ('single' as const),
      variantCount: p.variants.length,
      brand: p.brand?.name ?? null,
      category: p.primaryCategory?.name ?? null,
      image: lead?.url ?? null,
      buyingPrice: p.buyingPrice,
      retailerPrice: p.retailerPrice,
      wholesalePrice: p.wholesalePrice,
      retailerMin: Math.min(...prices),
      retailerMax: Math.max(...prices),
      updatedAt: p.updatedAt,
    };
  }
}
