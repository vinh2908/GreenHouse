import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsIn,
  IsNotEmpty,
  Matches,
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

// A device-local path (file://, content://) is useless to the admin reviewing the documents.
const UPLOADED_URL = {
  pattern: /^https?:\/\//i,
  message: 'Ảnh e-KYC phải được tải lên máy chủ trước khi nộp',
};

export class SubmitKycDto {
  @ApiProperty({ example: '0123456789', description: 'Số CCCD/CMND' })
  @IsString()
  @IsNotEmpty()
  id_card_number: string;

  @ApiProperty({ description: 'URL ảnh mặt trước CCCD (sau khi upload)' })
  @IsString()
  @IsNotEmpty()
  @Matches(UPLOADED_URL.pattern, { message: UPLOADED_URL.message })
  id_card_front: string;

  @ApiProperty({ description: 'URL ảnh mặt sau CCCD' })
  @IsString()
  @IsNotEmpty()
  @Matches(UPLOADED_URL.pattern, { message: UPLOADED_URL.message })
  id_card_back: string;

  @ApiProperty({ description: 'URL ảnh selfie kèm CCCD' })
  @IsString()
  @IsNotEmpty()
  @Matches(UPLOADED_URL.pattern, { message: UPLOADED_URL.message })
  selfie_photo: string;
}

export class UpdateLocationDto {
  @ApiProperty({ example: [106.6297, 10.8231], description: '[longitude, latitude]' })
  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];

  @ApiPropertyOptional({
    enum: ['manual', 'gps', 'auto'],
    default: 'auto',
    description: 'manual = ghim trên bản đồ, gps = bấm nút lấy GPS, auto = app tự gửi định kỳ',
  })
  @IsOptional()
  @IsIn(['manual', 'gps', 'auto'])
  source?: 'manual' | 'gps' | 'auto';
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

// ─── Lịch làm việc (Feature 13) ──────────────────────────────────────────────

const HH_MM = {
  pattern: /^([01]\d|2[0-3]):[0-5]\d$/,
  message: 'Giờ phải theo định dạng HH:mm (00:00–23:59)',
};
const YYYY_MM_DD = {
  pattern: /^\d{4}-\d{2}-\d{2}$/,
  message: 'Ngày phải theo định dạng YYYY-MM-DD',
};

export class UpdateAvailabilityDto {
  @ApiProperty({ description: 'Bật/tắt lịch làm việc' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: 'Ngày làm việc trong tuần theo JS getDay(): 0=CN, 1=T2, …, 6=T7',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days_of_week: number[];

  @ApiProperty({ example: '07:00' })
  @IsString()
  @Matches(HH_MM.pattern, { message: HH_MM.message })
  start_time: string;

  @ApiProperty({ example: '19:00' })
  @IsString()
  @Matches(HH_MM.pattern, { message: HH_MM.message })
  end_time: string;

  @ApiPropertyOptional({ example: ['2026-11-01'], description: 'Ngày nghỉ lẻ (YYYY-MM-DD)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(YYYY_MM_DD.pattern, { each: true, message: YYYY_MM_DD.message })
  blocked_dates?: string[];
}

export class SetIncomeGoalDto {
  @ApiProperty({ example: 15000000, description: 'Mục tiêu thu nhập tháng (VNĐ, >= 0)' })
  @IsNumber()
  @Min(0)
  amount: number;
}
