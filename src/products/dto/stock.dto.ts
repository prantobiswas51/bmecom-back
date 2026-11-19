import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Max, Min } from 'class-validator';

export const STOCK_FILTERS = ['all', 'low', 'out', 'untracked'] as const;

export class ListStockDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(STOCK_FILTERS)
  filter?: (typeof STOCK_FILTERS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class StockHistoryDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;
}

export class AdjustStockDto {
  @IsUUID()
  productId: string;

  /** Required for a grouped product's variant; leave out for a single product. */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  /** add: change by `quantity` (negative removes). set: the new count. untrack: stop counting, always orderable. */
  @IsIn(['add', 'set', 'untrack'])
  mode: 'add' | 'set' | 'untrack';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  quantity?: number;

  /** For `add`: stock received, or a correction such as damage or loss. */
  @IsOptional()
  @IsIn(['restock', 'adjustment'])
  reason?: 'restock' | 'adjustment';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
