import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../auth/auth-user.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateReviewAdminDto, CreateReviewDto, ListReviewsAdminDto, PageDto, UpdateReviewAdminDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

/** Storefront home page: a few recent good reviews. */
@Controller('catalog/reviews')
export class LatestReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('latest')
  latest() {
    return this.reviews.latest(3);
  }
}

/** Storefront: anyone can read reviews, signed-in shoppers can write one per product. */
@Controller('catalog/products/:slug/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('slug') slug: string, @Query() query: PageDto) {
    return this.reviews.listForProduct(slug, query.page);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.reviews.mine(slug, user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Param('slug') slug: string, @CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(slug, user.id, dto);
  }
}

// TODO: any signed-in role can moderate for now; restrict with RolesGuard before launch.
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query() query: ListReviewsAdminDto) {
    return this.reviews.listAdmin(query);
  }

  @Post()
  createAdmin(@Body() dto: CreateReviewAdminDto) {
    return this.reviews.createAdmin(dto);
  }

  @Get(':id')
  getAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.getAdmin(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReviewAdminDto) {
    return this.reviews.updateAdmin(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.remove(id);
  }
}
