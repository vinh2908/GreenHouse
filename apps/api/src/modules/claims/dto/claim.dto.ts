import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClaimDto {
  @ApiProperty() @IsMongoId({ message: 'job_id không hợp lệ' }) job_id: string;

  @ApiProperty({ description: 'Mô tả thiệt hại / sự cố cần bồi thường' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ type: [String], description: 'URL ảnh bằng chứng (đã upload)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ description: 'Số tiền đề nghị bồi thường (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  requested_amount?: number;
}

export class ReviewClaimDto {
  @ApiProperty({ enum: ['approve', 'reject', 'start_review'] })
  @IsIn(['approve', 'reject', 'start_review'])
  action: 'approve' | 'reject' | 'start_review';

  @ApiPropertyOptional({ description: 'Số tiền duyệt bồi thường (bắt buộc khi approve)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  approved_amount?: number;

  @ApiPropertyOptional({ description: 'Ghi chú / lý do từ chối (bắt buộc khi reject)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
