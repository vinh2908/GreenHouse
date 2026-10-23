import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVoucherDto {
  @ApiProperty({ example: 'GIAM10', description: 'Mã giảm giá (tự viết hoa)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) description?: string;

  @ApiProperty({ enum: ['percent', 'fixed'] })
  @IsIn(['percent', 'fixed'])
  discount_type: 'percent' | 'fixed';

  @ApiProperty({ description: 'percent: % giảm (1–100) · fixed: số tiền giảm VNĐ' })
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  discount_value: number;

  @ApiPropertyOptional({ description: 'Mức giảm tối đa cho loại percent (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_discount_amount?: number;

  @ApiPropertyOptional({ default: 0, description: 'Giá trị đơn tối thiểu (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_amount?: number;

  @ApiPropertyOptional({ description: 'Tổng lượt dùng tối đa (bỏ trống = không giới hạn)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  total_usage_limit?: number;

  @ApiPropertyOptional({ default: 1, description: 'Số lượt tối đa mỗi khách' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  per_user_limit?: number;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() valid_from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() valid_to?: string;
}

export class UpdateVoucherDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) description?: string;

  @ApiPropertyOptional({ enum: ['percent', 'fixed'] })
  @IsOptional()
  @IsIn(['percent', 'fixed'])
  discount_type?: 'percent' | 'fixed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  discount_value?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) max_discount_amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) min_order_amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) total_usage_limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) per_user_limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() valid_from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() valid_to?: string;
}

export class ValidateVoucherDto {
  @ApiProperty() @IsString() @IsNotEmpty() code: string;

  @ApiPropertyOptional({ description: 'Giá trị đơn để tính số tiền giảm (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class ApplyVoucherDto {
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
}
