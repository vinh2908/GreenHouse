import {
  IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AnalyzeBookingDto {
  @ApiProperty({
    description: 'Yêu cầu tự nhiên của khách hàng',
    example: 'Tôi cần người dọn căn hộ 2 phòng ngủ vào chiều mai khoảng 3 tiếng',
  })
  @IsString() @IsNotEmpty()
  text: string;
}

export class EstimatePriceDto {
  @ApiProperty({
    description: 'Mô tả công việc cần làm',
    example: 'Dọn nhà 3 tầng, 4 phòng ngủ, có sân vườn',
  })
  @IsString() @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Loại dịch vụ',
    enum: ['housekeeping_hourly', 'housekeeping_daily', 'deep_cleaning', 'housekeeping_periodic', 'cooking'],
    example: 'housekeeping_hourly',
  })
  @IsOptional() @IsString()
  service_type?: string;
}

export class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString() @IsNotEmpty()
  content: string;
}

export class SupportChatDto {
  @ApiProperty({ description: 'Tin nhắn hiện tại của người dùng' })
  @IsString() @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Lịch sử cuộc trò chuyện (tối đa 10 tin)',
    type: [AiChatMessageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  history?: AiChatMessageDto[];
}

export class RankHelpersDto {
  @ApiProperty({
    description: 'Danh sách helper IDs cần xếp hạng',
    example: ['helper1_id', 'helper2_id'],
  })
  @IsArray() @IsString({ each: true })
  helper_ids: string[];

  @ApiPropertyOptional({ description: 'Service ID của job' })
  @IsOptional() @IsString()
  service_id?: string;

  @ApiPropertyOptional({ description: 'Mô tả công việc để AI giải thích phù hợp' })
  @IsOptional() @IsString()
  job_description?: string;
}
