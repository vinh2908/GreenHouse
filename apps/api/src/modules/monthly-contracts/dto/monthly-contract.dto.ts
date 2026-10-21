import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNumber,
  Matches,
  MaxLength,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobAddressDto } from '../../jobs/dto/job.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export class MonthlyContractScheduleDto {
  @ApiProperty({
    type: [Number],
    description: 'Thứ làm việc theo Date.getDay(): 0 = Chủ nhật … 6 = Thứ 7',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days_of_week: number[];

  @ApiProperty({ example: '08:00' }) @IsString() @IsNotEmpty() time_start: string;
  @ApiProperty({ example: '17:00' }) @IsString() @IsNotEmpty() time_end: string;
}

export class CreateMonthlyContractDto {
  @ApiProperty() @IsMongoId({ message: 'helper_id không hợp lệ' }) helper_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'service_id không hợp lệ' })
  service_id?: string;

  @ApiProperty({ maxLength: 200 }) @IsString() @IsNotEmpty() @MaxLength(200) title: string;

  @ApiProperty({ description: 'Lương tháng thỏa thuận (VNĐ)' })
  @IsNumber()
  @Min(100000, { message: 'Lương tháng tối thiểu 100.000₫' })
  monthly_salary: number;

  @ApiProperty({ type: JobAddressDto })
  @ValidateNested()
  @Type(() => JobAddressDto)
  address: JobAddressDto;

  @ApiProperty({ type: MonthlyContractScheduleDto })
  @ValidateNested()
  @Type(() => MonthlyContractScheduleDto)
  schedule: MonthlyContractScheduleDto;

  @ApiProperty({ description: 'Ngày bắt đầu hợp đồng' }) @IsDateString() start_date: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (nếu đã biết trước)' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class RespondMonthlyContractDto {
  @ApiProperty({ description: 'true = đồng ý nhận hợp đồng, false = từ chối' })
  @IsBoolean()
  accept: boolean;
}

export class EndMonthlyContractDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ConfirmAttendanceDto {
  @ApiProperty({ description: 'true = xác nhận có mặt, false = đánh dấu vắng' })
  @IsBoolean()
  approve: boolean;
}

export class CreateLeaveRequestDto {
  @ApiProperty({ example: '2026-11-05', description: 'Ngày xin nghỉ (YYYY-MM-DD)' })
  @IsString()
  @Matches(DATE_RE, { message: 'date phải có dạng YYYY-MM-DD' })
  date: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

export class RespondLeaveRequestDto {
  @ApiProperty({ description: 'true = duyệt nghỉ, false = từ chối' })
  @IsBoolean()
  approve: boolean;
}

export class SettleMonthDto {
  @ApiProperty({ example: '2026-10', description: 'Tháng chốt lương (YYYY-MM)' })
  @IsString()
  @Matches(MONTH_RE, { message: 'month phải có dạng YYYY-MM' })
  month: string;
}
