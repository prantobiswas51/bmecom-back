import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { OrderStatus } from '../entities/order.entity.js';

const trim = Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const blankToUndefined = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value,
);
/** "01712-345 678" and "+8801712345678" both end up as the same digits. */
const phoneDigits = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
);

export class CartItemDto {
  @IsUUID()
  productId: string;

  /** Required for grouped products, not allowed for single ones. */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

export class QuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class PlaceOrderDto extends QuoteDto {
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @phoneDigits
  @Matches(/^(\+?88)?01[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number, like 01712345678' })
  phone: string;

  @IsOptional()
  @blankToUndefined
  @IsEmail()
  email?: string;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @blankToUndefined
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ListOrdersAdminDto extends PageDto {
  /** Placed on or after this day, YYYY-MM-DD. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** Placed on or before this day, YYYY-MM-DD. */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  /** Category ids, comma separated: orders with at least one product in any of them. */
  @IsOptional()
  @IsString()
  categories?: string;

  /** "true": only orders still in progress (not delivered or cancelled). */
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

export class SetOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class EditOrderItemDto {
  /** An existing line on the order. Leave out when adding a product. */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** A product to add (with `variantId` for grouped products). Leave out for an existing line. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

export class EditOrderDto {
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @phoneDigits
  @Matches(/^(\+?88)?01[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number, like 01712345678' })
  phone: string;

  @IsOptional()
  @blankToUndefined
  @IsEmail()
  email?: string;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @blankToUndefined
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  shippingFee: number;

  /** The lines the order should end up with. An existing line left out is removed. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EditOrderItemDto)
  items: EditOrderItemDto[];
}
