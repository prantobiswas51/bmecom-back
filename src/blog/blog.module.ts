import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogAdminController, BlogPublicController } from './blog.controller.js';
import { BlogPost } from './blog-post.entity.js';
import { BlogService } from './blog.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([BlogPost])],
  controllers: [BlogPublicController, BlogAdminController],
  providers: [BlogService],
})
export class BlogModule {}
