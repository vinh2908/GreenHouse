import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Trang', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Số lượng mỗi trang', default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên/số điện thoại' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái' })
  @IsOptional() @IsString()
  status?: string;
}

export class AdminSuspendDto {
  @ApiPropertyOptional({ description: 'Lý do đình chỉ' })
  @IsOptional() @IsString()
  reason?: string;
}

export class AdminKycActionDto {
  @ApiPropertyOptional({ description: 'Lý do từ chối (nếu reject)' })
  @IsOptional() @IsString()
  reason?: string;
}
