import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, ILike, Not, type ObjectLiteral, type Repository } from 'typeorm';
import { Brand } from './entities/brand.entity.js';
import { Category } from './entities/category.entity.js';
import { slugify } from './slugify.js';

/** Brands and categories: a unique name plus a stable slug (kept when renamed so links keep working). */
@Injectable()
export class TaxonomyService {
  constructor(private readonly ds: DataSource) {}

  private get brands() {
    return this.ds.getRepository(Brand);
  }
  private get categories() {
    return this.ds.getRepository(Category);
  }

  // ---- brands --------------------------------------------------------

  listBrands() {
    return this.ds.query<{ id: string; name: string; slug: string; productCount: number }[]>(
      `SELECT b.id, b.name, b.slug, COUNT(p.id)::int AS "productCount"
         FROM brands b LEFT JOIN products p ON p."brandId" = b.id
        GROUP BY b.id ORDER BY b.name`,
    );
  }

  async createBrand(name: string) {
    name = name.trim();
    await this.assertNameFree(this.brands, name);
    return this.brands.save(this.brands.create({ name, slug: await this.uniqueSlug(this.brands, name) }));
  }

  async renameBrand(id: string, name: string) {
    const brand = await this.brands.findOneBy({ id });
    if (!brand) throw new NotFoundException('Brand not found');
    name = name.trim();
    await this.assertNameFree(this.brands, name, id);
    brand.name = name;
    return this.brands.save(brand);
  }

  async removeBrand(id: string) {
    const result = await this.brands.delete({ id }); // products keep existing, just without a brand
    if (!result.affected) throw new NotFoundException('Brand not found');
  }

  // ---- categories and sub categories ---------------------------------

  /** Flat list with each row's parentId; the admin builds the tree. productCount counts primary and secondary use. */
  listCategories() {
    return this.ds.query<{ id: string; name: string; slug: string; parentId: string | null; productCount: number }[]>(
      `SELECT c.id, c.name, c.slug, c."parentId", COUNT(DISTINCT p.id)::int AS "productCount"
         FROM categories c
         LEFT JOIN products p ON p."primaryCategoryId" = c.id OR EXISTS (
              SELECT 1 FROM product_secondary_categories s WHERE s."productId" = p.id AND s."categoryId" = c.id)
        GROUP BY c.id ORDER BY c.name`,
    );
  }

  async createCategory(name: string, parentId?: string | null) {
    name = name.trim();
    await this.assertNameFree(this.categories, name);
    await this.assertValidParent(parentId ?? null);
    return this.categories.save(
      this.categories.create({ name, slug: await this.uniqueSlug(this.categories, name), parentId: parentId ?? null }),
    );
  }

  async updateCategory(id: string, name: string, parentId?: string | null) {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    name = name.trim();
    await this.assertNameFree(this.categories, name, id);

    // parentId omitted means "leave it"; null means "make it a top-level category".
    if (parentId !== undefined && parentId !== category.parentId) {
      await this.assertValidParent(parentId, id);
      category.parentId = parentId;
    }
    category.name = name;
    return this.categories.save(category);
  }

  async removeCategory(id: string) {
    if (!(await this.categories.existsBy({ id }))) throw new NotFoundException('Category not found');
    const children = await this.categories.countBy({ parentId: id });
    if (children > 0) {
      throw new ConflictException(
        `This category has ${children} sub categor${children === 1 ? 'y' : 'ies'}. Delete or move them first.`,
      );
    }
    await this.categories.delete({ id }); // products keep existing, just without it
  }

  /** The parent must be an existing top-level category, and a category with children can't become a child. */
  private async assertValidParent(parentId: string | null, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException('A category cannot be its own parent');
    const parent = await this.categories.findOneBy({ id: parentId });
    if (!parent) throw new BadRequestException('Unknown parent category');
    if (parent.parentId) throw new BadRequestException('Sub categories cannot have sub categories of their own');
    if (selfId && (await this.categories.existsBy({ parentId: selfId }))) {
      throw new BadRequestException('This category has sub categories, so it cannot become one itself');
    }
  }

  // ---- shared --------------------------------------------------------

  private async uniqueSlug(repo: Repository<ObjectLiteral>, name: string) {
    const base = slugify(name);
    let slug = base;
    for (let n = 1; await repo.existsBy({ slug }); n++) slug = `${base}-${n}`;
    return slug;
  }

  private async assertNameFree(repo: Repository<ObjectLiteral>, name: string, selfId?: string) {
    const taken = await repo.existsBy({
      name: ILike(name.replace(/[\\%_]/g, '\\$&')),
      ...(selfId && { id: Not(selfId) }),
    });
    if (taken) throw new ConflictException(`"${name}" already exists`);
  }
}
