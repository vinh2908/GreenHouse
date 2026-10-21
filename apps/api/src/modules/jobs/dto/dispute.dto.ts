import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddDisputeEntryDto {
  @ApiPropertyOptional({ description: 'Nội dung trình bày / ghi chú bổ sung' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: [String], description: 'Ảnh bằng chứng (URL sau upload)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

export class AppealDisputeDto {
  @ApiProperty({ description: 'Lý do kháng cáo kết quả phân xử' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
