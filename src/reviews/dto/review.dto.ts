import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReviewStatus } from '../review.entity.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body: string;
}

export class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ListReviewsAdminDto extends PageDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

/** What an admin may change on a review. Every field is optional so the list can still send just `status`. */
export class UpdateReviewAdminDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  authorName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** An empty string clears the title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  verifiedPurchase?: boolean;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

export class CreateReviewAdminDto {
  @IsUUID()
  productId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  authorName: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsBoolean()
  verifiedPurchase?: boolean;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
