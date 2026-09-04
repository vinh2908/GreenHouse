import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { HelperStatus } from '@homemate/types';

export class UpdateHelperProfileDto {
  @ApiPropertyOptional({ example: 'Tôi có 5 năm kinh nghiệm dọn dẹp nhà cửa...' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  years_experience?: number;

  @ApiPropertyOptional({ example: ['don-dep', 'nau-an', 'giat-ui'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Mảng ObjectId của services' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  service_ids?: string[];

  @ApiPropertyOptional({ example: ['quan-7', 'quan-binh-thanh'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  working_areas?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  typical_warranty_days?: number;
}

export class SetHelperStatusDto {
  @ApiProperty({ enum: [HelperStatus.ONLINE, HelperStatus.OFFLINE] })
  @IsEnum([HelperStatus.ONLINE, HelperStatus.OFFLINE])
  status: HelperStatus.ONLINE | HelperStatus.OFFLINE;
}

export class SubmitKycDto {
  @ApiProperty({ example: '0123456789', description: 'Số CCCD/CMND' })
  @IsString()
  @IsNotEmpty()
  id_card_number: string;

  @ApiProperty({ description: 'URL ảnh mặt trước CCCD (sau khi upload lên MinIO)' })
  @IsString()
  @IsNotEmpty()
  id_card_front: string;

  @ApiProperty({ description: 'URL ảnh mặt sau CCCD' })
  @IsString()
  @IsNotEmpty()
  id_card_back: string;

  @ApiProperty({ description: 'URL ảnh selfie kèm CCCD' })
  @IsString()
  @IsNotEmpty()
  selfie_photo: string;
}

export class UpdateLocationDto {
  @ApiProperty({ example: [106.6297, 10.8231], description: '[longitude, latitude]' })
  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class BankAccountDto {
  @ApiProperty({ example: 'Vietcombank' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @ApiProperty({ example: 'NGUYEN VAN A' })
  @IsString()
  @IsNotEmpty()
  account_name: string;
}
