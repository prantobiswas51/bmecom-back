import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = { message: 'must be a hex colour like #0e0f51' };

export class ThemeDto {
  @Matches(HEX, color) primary: string;
  @Matches(HEX, color) primaryDark: string;
  @Matches(HEX, color) secondary: string;
  @Matches(HEX, color) secondaryDark: string;
  @Matches(HEX, color) tertiary: string;
  @Matches(HEX, color) accent: string;
  @Matches(HEX, color) other: string;
}

export class CurrencyDto {
  @Matches(/^[A-Za-z]{3}$/, { message: 'code must be 3 letters, like BDT' })
  code: string;

  @IsString()
  @Length(1, 5)
  symbol: string;

  @IsIn(['before', 'after'])
  position: 'before' | 'after';

  @IsIn([0, 2])
  decimals: 0 | 2;
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeDto)
  theme?: ThemeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CurrencyDto)
  currency?: CurrencyDto;
}
