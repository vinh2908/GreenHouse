import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsMongoId, MaxLength } from 'class-validator';

export class SendSupportMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) content: string;
}

export class CreateSupportConversationDto {
  @ApiProperty({ description: 'ID đơn liên quan (không bắt buộc)' })
  @IsOptional()
  @IsMongoId()
  job_id?: string;
}
