import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { BlogStatus } from '../blog-post.entity.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ListBlogAdminDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateBlogDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  /** Leave empty to build it from the title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  content?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}

export class UpdateBlogDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  slug?: string;

  /** An empty string clears it. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  content?: string;

  /** An empty string clears it. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}
