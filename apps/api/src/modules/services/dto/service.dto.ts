import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceStatus } from '@homemate/types';

export class CreateServiceCategoryDto {
  @ApiProperty({ example: 'Giúp việc theo giờ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'giup-viec-theo-gio' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  sort_order?: number;
}

export class CreateServiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category_id: string;

  @ApiProperty({ example: 'Giúp việc theo giờ' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'giup-viec-theo-gio' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price_range_min?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price_range_max?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  estimated_duration_min?: number;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @IsNumber()
  @Max(24)
  estimated_duration_max?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  platform_fee_percent?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_site_visit?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

export class UpdateServiceDto extends CreateServiceDto {}

export class UpdateServiceStatusDto {
  @ApiProperty({ enum: ServiceStatus })
  @IsEnum(ServiceStatus)
  status: ServiceStatus;
}
