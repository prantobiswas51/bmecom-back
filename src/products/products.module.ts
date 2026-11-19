import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './entities/brand.entity.js';
import { Category } from './entities/category.entity.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { BrandsController, CategoriesController, ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';
import { TaxonomyService } from './taxonomy.service.js';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage, Brand, Category, StockMovement])],
  controllers: [CatalogController, ProductsController, BrandsController, CategoriesController, UploadsController, StockController],
  providers: [ProductsService, CatalogService, TaxonomyService, StockService],
})
export class ProductsModule {}
