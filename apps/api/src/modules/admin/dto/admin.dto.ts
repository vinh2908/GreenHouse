import { IsOptional, IsString, IsEnum, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '@homemate/types';

export class AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Trang', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Số lượng mỗi trang', default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên/số điện thoại' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminSuspendDto {
  @ApiPropertyOptional({ description: 'Lý do đình chỉ' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminKycActionDto {
  @ApiPropertyOptional({ description: 'Lý do từ chối (nếu reject)' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminWaivePenaltyDto {
  @ApiProperty({ description: 'Lý do miễn phạt (bắt buộc, lưu vào sự kiện để đối soát)' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AdminUpdateJobStatusDto {
  @ApiProperty({ description: 'Trạng thái mới của job', enum: JobStatus })
  @IsEnum(JobStatus)
  status: JobStatus;

  @ApiPropertyOptional({ description: 'Ghi chú lý do cập nhật' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminDirectRefundDto {
  @ApiProperty({ description: 'Số tiền hoàn (₫)' })
  @IsNumber()
  @Min(1000)
  amount: number;

  @ApiProperty({ description: 'Lý do hoàn tiền' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
