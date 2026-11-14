import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { cleanRichText } from '../products/rich-text.js';
import { slugify } from '../products/slugify.js';
import { BlogPost, BlogStatus } from './blog-post.entity.js';
import { CreateBlogDto, ListBlogAdminDto, UpdateBlogDto } from './dto/blog.dto.js';

const PAGE_SIZE = 9;
const ADMIN_PAGE_SIZE = 20;

@Injectable()
export class BlogService {
  constructor(@InjectRepository(BlogPost) private readonly posts: Repository<BlogPost>) {}

  // ---- storefront ----

  async listPublic(page = 1) {
    const [rows, total] = await this.posts.findAndCount({
      where: { status: BlogStatus.Published },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, publishedAt: true },
    });
    return { items: rows, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  async getPublic(slug: string) {
    const post = await this.posts.findOne({ where: { slug, status: BlogStatus.Published } });
    if (!post) throw new NotFoundException('Post not found');
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: post.coverImage,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    };
  }

  // ---- admin ----

  async listAdmin(query: ListBlogAdminDto) {
    const page = query.page ?? 1;
    const term = query.q?.trim();
    const [items, total] = await this.posts.findAndCount({
      where: {
        ...(query.status && { status: query.status }),
        ...(term && { title: ILike(`%${term.replace(/[%_\\]/g, '\\$&')}%`) }),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: { id: true, title: true, slug: true, status: true, publishedAt: true, createdAt: true, updatedAt: true },
    });
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
  }

  async getAdmin(id: string) {
    const post = await this.posts.findOneBy({ id });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(dto: CreateBlogDto) {
    const status = dto.status ?? BlogStatus.Draft;
    const post = this.posts.create({
      title: dto.title,
      slug: await this.freeSlug(dto.slug || dto.title),
      excerpt: dto.excerpt || null,
      content: cleanRichText(dto.content, { images: true }) ?? '',
      coverImage: dto.coverImage || null,
      status,
      publishedAt: status === BlogStatus.Published ? new Date() : null,
    });
    return this.posts.save(post);
  }

  async update(id: string, dto: UpdateBlogDto) {
    const post = await this.getAdmin(id);
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.slug !== undefined && dto.slug !== post.slug) post.slug = await this.freeSlug(dto.slug, id);
    if (dto.excerpt !== undefined) post.excerpt = dto.excerpt || null;
    if (dto.content !== undefined) post.content = cleanRichText(dto.content, { images: true }) ?? '';
    if (dto.coverImage !== undefined) post.coverImage = dto.coverImage || null;
    if (dto.status !== undefined) {
      post.status = dto.status;
      if (dto.status === BlogStatus.Published && !post.publishedAt) post.publishedAt = new Date();
    }
    return this.posts.save(post);
  }

  async remove(id: string) {
    const result = await this.posts.delete({ id });
    if (!result.affected) throw new NotFoundException('Post not found');
  }

  /** A slug no other post uses: my-post, then my-post-2, my-post-3, and so on. */
  private async freeSlug(wanted: string, exceptId?: string) {
    const base = slugify(wanted);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const taken = await this.posts.findOne({ where: { slug }, select: { id: true } });
      if (!taken || taken.id === exceptId) return slug;
    }
  }
}
