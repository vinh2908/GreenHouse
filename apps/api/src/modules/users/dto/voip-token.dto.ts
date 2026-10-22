import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoipTokenDto {
  @ApiProperty({
    description: 'PushKit token (iOS) hoặc FCM token (Android) của thiết bị',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string

  @ApiProperty({ enum: ['ios', 'android'], description: 'Nền tảng của thiết bị' })
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}

export class RemoveVoipTokenDto {
  @ApiProperty({ description: 'VoIP token cần gỡ (khi đăng xuất)' })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string
}
