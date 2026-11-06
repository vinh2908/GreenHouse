import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsMongoId, MaxLength } from 'class-validator';

export class SendSupportMessageDto {
  // B79: tin nhắn hỗ trợ tối đa 2000 ký tự; vượt quá → 400 (ValidationPipe)
@ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) content: string;
}

export class CreateSupportConversationDto {
  @ApiProperty({ description: 'ID đơn liên quan (không bắt buộc)' })
  @IsOptional()
  @IsMongoId()
  job_id?: string;
}
