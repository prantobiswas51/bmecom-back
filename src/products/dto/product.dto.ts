import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductVisibility } from '../entities/product.entity.js';

/** "  " -> null, so a cleared form field really clears the column. */
const blankToNull = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value,
);

// null and undefined both pass @IsOptional(): the service treats null as "clear it".

export class AxisDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  values: string[];
}

export class ProductVariantInputDto {
  /** Present = update that variant; absent = new. Variants left out of an update are deleted. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsObject()
  attributes: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  buyingPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailerPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  seoTitle?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  seoKeyPhrase?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  metaDescription?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  metaKeywords?: string | null;
}

export class ProductImageInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  url: string;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  /** An existing variant's id. */
  @IsOptional()
  @IsUUID()
  variantId?: string | null;

  /** Position in this request's `variants` array, for variants that don't exist yet. */
  @IsOptional()
  @IsInt()
  @Min(0)
  variantIndex?: number | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @blankToNull
  @IsString()
  shortDescription?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  description?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  buyingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailerPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  seoTitle?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  seoKeyPhrase?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  metaDescription?: string | null;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(500)
  metaKeywords?: string | null;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsUUID()
  primaryCategoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  secondaryCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AxisDefinitionDto)
  axisDefinitions?: AxisDefinitionDto[];

  /** Non-empty = grouped product. An empty array turns a grouped product back into a single one. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  /** Replaces the product's whole image list. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class NameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}

export class CategoryDto extends NameDto {
  /** A top-level category's id makes this a sub category. null (or omitted on create) means top-level. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
