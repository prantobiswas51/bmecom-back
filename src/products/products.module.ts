import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './entities/brand.entity.js';
import { Category } from './entities/category.entity.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { BrandsController, CategoriesController, ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { TaxonomyService } from './taxonomy.service.js';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage, Brand, Category])],
  controllers: [CatalogController, ProductsController, BrandsController, CategoriesController, UploadsController],
  providers: [ProductsService, CatalogService, TaxonomyService],
})
export class ProductsModule {}
