import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  MaxLength,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobAddressLocationDto {
  @ApiProperty({ example: 'Point' })
  @IsString()
  type: string;

  @ApiProperty({ example: [106.6297, 10.8231], description: '[longitude, latitude]' })
  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class JobAddressDto {
  @ApiProperty() @IsString() @IsNotEmpty() full_address: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ward?: string;
  @ApiProperty() @IsString() @IsNotEmpty() district: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;

  @ApiProperty({ type: JobAddressLocationDto })
  @ValidateNested()
  @Type(() => JobAddressLocationDto)
  location: JobAddressLocationDto;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateJobDto {
  @ApiProperty() @IsString() @IsNotEmpty() service_id: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @ApiProperty({ type: JobAddressDto })
  @ValidateNested()
  @Type(() => JobAddressDto)
  address: JobAddressDto;

  @ApiPropertyOptional() @IsOptional() @IsDateString() preferred_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferred_time_start?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferred_time_end?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() is_flexible_time?: boolean;
}

export class CreateQuoteDto {
  @ApiProperty({ example: 200000 }) @IsNumber() labor_cost: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() materials_cost?: number;
  @ApiProperty({ example: 3 }) @IsNumber() estimated_duration: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() warranty_days?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() available_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() available_time_start?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() available_time_end?: string;
  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  materials_breakdown?: { name: string; quantity: number; unit_price: number }[];
}

export class SelectQuoteDto {
  @ApiProperty() @IsString() @IsNotEmpty() quote_id: string;
  @ApiProperty() @IsDateString() scheduled_at: string;
}

export class CompleteJobDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completion_photos?: string[];
}

export class ReviewJobDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsNumber() rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() review?: string;
}

export class CancelJobDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}
