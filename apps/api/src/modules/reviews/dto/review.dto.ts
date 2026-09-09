import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: 'Job ID cần đánh giá' })
  @IsString()
  @IsNotEmpty()
  job_id: string;

  @ApiProperty({ description: 'Helper ID được đánh giá' })
  @IsString()
  @IsNotEmpty()
  helper_id: string;

  @ApiProperty({ description: 'Đánh giá tổng thể (1-5 sao)', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Nhận xét chi tiết', maxLength: 1000 })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Đánh giá đúng giờ (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating_punctuality?: number;

  @ApiPropertyOptional({ description: 'Đánh giá chất lượng (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating_quality?: number;

  @ApiPropertyOptional({ description: 'Đánh giá thái độ (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating_attitude?: number;

  @ApiPropertyOptional({
    description: 'Tags mô tả helper',
    example: ['professional', 'friendly', 'careful', 'fast'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class HelperReplyDto {
  @ApiProperty({ description: 'Phản hồi của người giúp việc', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  reply: string;
}
