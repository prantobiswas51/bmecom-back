import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { UserRole } from '../user.entity.js';

const email = Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
const blankToNull = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value,
);

// There is deliberately no password field: people set their own through "Forgot password".
export class CreateUserDto {
  @email
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @blankToNull
  @IsString()
  @MaxLength(100)
  name?: string | null;

  /** Defaults to customer. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class ListUsersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

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
