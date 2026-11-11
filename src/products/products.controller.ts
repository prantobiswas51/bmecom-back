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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/user.entity.js';
import { CategoryDto, CreateProductDto, ListProductsDto, NameDto, UpdateProductDto } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';
import { TaxonomyService } from './taxonomy.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Superadmin)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto) {
    return this.products.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.products.remove(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('brands')
export class BrandsController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  list() {
    return this.taxonomy.listBrands();
  }

  @Post()
  create(@Body() dto: NameDto) {
    return this.taxonomy.createBrand(dto.name);
  }

  @Patch(':id')
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NameDto) {
    return this.taxonomy.renameBrand(id, dto.name);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxonomy.removeBrand(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  list() {
    return this.taxonomy.listCategories();
  }

  @Post()
  create(@Body() dto: CategoryDto) {
    return this.taxonomy.createCategory(dto.name, dto.parentId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    return this.taxonomy.updateCategory(id, dto.name, dto.parentId);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxonomy.removeCategory(id);
  }
}
