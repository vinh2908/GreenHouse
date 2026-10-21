import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendSupportMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) content: string;
}
