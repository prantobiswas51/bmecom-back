import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const blankToNull = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value,
);
/** "01712-345 678" and "+8801712345678" both end up as the same digits. */
const phoneDigits = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
);

export class CreateAddressDto {
  @blankToNull
  @IsOptional()
  @IsString()
  @MaxLength(30)
  label?: string | null;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @phoneDigits
  @Matches(/^(\+?88)?01[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number, like 01712345678' })
  phone: string;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Same fields, all optional, so a client can change just one. */
export class UpdateAddressDto {
  @blankToNull
  @IsOptional()
  @IsString()
  @MaxLength(30)
  label?: string | null;

  @trim
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @phoneDigits
  @IsOptional()
  @Matches(/^(\+?88)?01[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number, like 01712345678' })
  phone?: string;

  @trim
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
