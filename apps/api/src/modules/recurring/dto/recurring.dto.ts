import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobAddressDto } from '../../jobs/dto/job.dto';

export class CreateRecurringPlanDto {
  @ApiProperty() @IsMongoId({ message: 'service_id không hợp lệ' }) service_id: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiProperty({ type: JobAddressDto })
  @ValidateNested()
  @Type(() => JobAddressDto)
  address: JobAddressDto;

  @ApiProperty({ enum: ['weekly', 'monthly'], description: 'Tần suất lặp' })
  @IsIn(['weekly', 'monthly'])
  frequency: 'weekly' | 'monthly';

  @ApiPropertyOptional({
    type: [Number],
    description: 'Hàng tuần: 0 = Chủ nhật … 6 = Thứ 7',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'Hàng tháng: ngày trong tháng (1–31)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  month_days?: number[];

  @ApiProperty({ example: '09:00' }) @IsString() @IsNotEmpty() time_start: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time_end?: string;

  @ApiPropertyOptional({ description: 'Thời lượng dự kiến (giờ)' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(24)
  duration_hours?: number;

  @ApiProperty({ description: 'Ngày bắt đầu gói' }) @IsDateString() start_date: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc gói (nếu có)' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Thợ quen ưu tiên cho mọi lượt của gói' })
  @IsOptional()
  @IsMongoId({ message: 'preferred_helper_id không hợp lệ' })
  preferred_helper_id?: string;
}

export class UpdateRecurringPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly'] })
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  frequency?: 'weekly' | 'monthly';

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  month_days?: number[];

  @ApiPropertyOptional() @IsOptional() @IsString() time_start?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time_end?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() end_date?: string;

  @ApiPropertyOptional({ description: 'Đặt null để bỏ thợ quen' })
  @IsOptional()
  @IsMongoId({ message: 'preferred_helper_id không hợp lệ' })
  preferred_helper_id?: string | null;
}
