import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/user.entity.js';
import { Review } from './review.entity.js';
import { LatestReviewsController, ProductReviewsController, ReviewsAdminController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product, User])],
  controllers: [LatestReviewsController, ProductReviewsController, ReviewsAdminController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
