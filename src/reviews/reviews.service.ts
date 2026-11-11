import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductVisibility } from '../products/entities/product.entity.js';
import { User } from '../users/user.entity.js';
import { CreateReviewAdminDto, CreateReviewDto, ListReviewsAdminDto, UpdateReviewAdminDto } from './dto/review.dto.js';
import { Review, ReviewStatus } from './review.entity.js';

const PAGE_SIZE = 10;
const ADMIN_PAGE_SIZE = 20;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async productBySlug(slug: string) {
    const product = await this.products.findOne({
      where: { slug },
      select: { id: true, name: true, slug: true, visibility: true },
    });
    if (!product || product.visibility === ProductVisibility.Draft || product.visibility === ProductVisibility.Hidden) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Average, count and a per-star breakdown of the published reviews. */
  private async summary(productId: string) {
    const rows = await this.reviews
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'n')
      .where('r."productId" = :productId AND r.status = :status', { productId, status: ReviewStatus.Published })
      .groupBy('r.rating')
      .getRawMany<{ rating: number; n: string }>();
    const breakdown = [0, 0, 0, 0, 0]; // index 0 = 1 star
    for (const row of rows) breakdown[row.rating - 1] = Number(row.n);
    const count = breakdown.reduce((a, b) => a + b, 0);
    const total = breakdown.reduce((sum, n, i) => sum + n * (i + 1), 0);
    return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, breakdown };
  }

  async listForProduct(slug: string, page = 1) {
    const product = await this.productBySlug(slug);
    const [items, total] = await this.reviews.findAndCount({
      where: { productId: product.id, status: ReviewStatus.Published },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return {
      summary: await this.summary(product.id),
      items: items.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verifiedPurchase: r.verifiedPurchase,
        createdAt: r.createdAt,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  /** The newest published 4 and 5 star reviews across live products, for the home page. */
  async latest(limit = 3) {
    const rows = await this.reviews
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.product', 'p')
      .where('r.status = :status AND r.rating >= 4 AND p.visibility = :live', { status: ReviewStatus.Published, live: ProductVisibility.Live })
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verifiedPurchase,
      product: { name: r.product.name, slug: r.product.slug },
    }));
  }

  /** The signed-in shopper's own review of this product, if they wrote one. */
  async mine(slug: string, userId: string) {
    const product = await this.productBySlug(slug);
    const review = await this.reviews.findOne({ where: { productId: product.id, userId } });
    return { review: review ? { id: review.id, rating: review.rating, status: review.status } : null };
  }

  async create(slug: string, userId: string, dto: CreateReviewDto) {
    const product = await this.productBySlug(slug);
    if (product.visibility !== ProductVisibility.Live) throw new ForbiddenException('This product cannot be reviewed yet');
    if (await this.reviews.exists({ where: { productId: product.id, userId } })) {
      throw new ConflictException('You have already reviewed this product');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const bought: unknown[] = await this.reviews.manager.query(
      `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi."orderId"
       WHERE oi."productId" = $1 AND o."userId" = $2 AND o.status <> 'cancelled' LIMIT 1`,
      [product.id, userId],
    );
    const review = await this.reviews.save(
      this.reviews.create({
        productId: product.id,
        userId,
        authorName: (user.name?.trim() || user.email.split('@')[0]).slice(0, 100),
        rating: dto.rating,
        title: dto.title || null,
        body: dto.body,
        verifiedPurchase: bought.length > 0,
      }),
    );
    return { id: review.id };
  }

  // Admin

  async listAdmin(query: ListReviewsAdminDto) {
    const page = query.page ?? 1;
    const qb = this.reviews
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.product', 'p')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * ADMIN_PAGE_SIZE)
      .take(ADMIN_PAGE_SIZE);
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.q?.trim()) {
      qb.andWhere('(p.name ILIKE :q OR r.authorName ILIKE :q OR r.body ILIKE :q)', { q: `%${query.q.trim()}%` });
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => this.adminView(r)),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    };
  }

  private adminView(r: Review) {
    return {
      id: r.id,
      product: { id: r.product.id, name: r.product.name, slug: r.product.slug },
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verifiedPurchase,
      status: r.status,
      byShopper: r.userId !== null,
      createdAt: r.createdAt,
    };
  }

  async getAdmin(id: string) {
    const review = await this.reviews.findOne({ where: { id }, relations: { product: true } });
    if (!review) throw new NotFoundException('Review not found');
    return this.adminView(review);
  }

  /** A review written by the shop (no shopper account behind it). */
  async createAdmin(dto: CreateReviewAdminDto) {
    if (!(await this.products.exists({ where: { id: dto.productId } }))) throw new NotFoundException('Product not found');
    const review = await this.reviews.save(
      this.reviews.create({
        productId: dto.productId,
        userId: null,
        authorName: dto.authorName,
        rating: dto.rating,
        title: dto.title || null,
        body: dto.body,
        verifiedPurchase: dto.verifiedPurchase ?? false,
        status: dto.status ?? ReviewStatus.Published,
      }),
    );
    return this.getAdmin(review.id);
  }

  async updateAdmin(id: string, dto: UpdateReviewAdminDto) {
    const { title, ...rest } = dto;
    const changes = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const res = await this.reviews.update(id, title === undefined ? changes : { ...changes, title: title || null });
    if (!res.affected) throw new NotFoundException('Review not found');
    return this.getAdmin(id);
  }

  async remove(id: string) {
    const res = await this.reviews.delete(id);
    if (!res.affected) throw new NotFoundException('Review not found');
  }
}
