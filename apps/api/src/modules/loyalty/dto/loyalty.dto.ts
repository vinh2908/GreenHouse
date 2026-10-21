import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyLoyaltyPointsDto {
  @ApiProperty({ description: 'ID đơn (Job) đã có giá chốt (Contract)' })
  @IsString()
  @IsNotEmpty()
  job_id: string;

  @ApiProperty({ description: 'Số điểm muốn dùng (tối thiểu 100)' })
  @IsInt()
  @Min(1)
  points: number;
}

export class AdjustLoyaltyPointsDto {
  @ApiProperty({ description: 'Số điểm điều chỉnh (có dấu, ≠ 0)' })
  @IsInt()
  points: number;

  @ApiPropertyOptional({ description: 'Lý do điều chỉnh' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
