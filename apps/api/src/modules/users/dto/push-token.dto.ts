import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  token: string;

  @ApiProperty({ required: false, example: 'vi' })
  @IsOptional()
  @IsString()
  language?: string;
}
