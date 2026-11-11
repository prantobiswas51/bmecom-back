import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogQueryDto, CatalogService } from './catalog.service.js';

/** Public storefront endpoints: no login, live products only. */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  products(@Query() query: CatalogQueryDto) {
    return this.catalog.list(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.catalog.detail(slug);
  }

  @Get('nav-categories')
  navCategories() {
    return this.catalog.navCategories();
  }

  @Get('filters')
  filters() {
    return this.catalog.filters();
  }
}
