import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/user.entity.js';
import { BlogService } from './blog.service.js';
import { CreateBlogDto, ListBlogAdminDto, PageQueryDto, UpdateBlogDto } from './dto/blog.dto.js';

/** Storefront: published posts only. */
@Controller('catalog/blog')
export class BlogPublicController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.blog.listPublic(query.page);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blog.getPublic(slug);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Superadmin)
@Controller('blog')
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(@Query() query: ListBlogAdminDto) {
    return this.blog.listAdmin(query);
  }

  @Post()
  create(@Body() dto: CreateBlogDto) {
    return this.blog.create(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.blog.getAdmin(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBlogDto) {
    return this.blog.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blog.remove(id);
  }
}
