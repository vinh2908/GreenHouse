import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: '0901234567', description: 'Số điện thoại Việt Nam' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  full_name: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class LoginDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class SendOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{6}$/, { message: 'OTP phải là 6 chữ số' })
  otp: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/)
  phone: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{6}$/)
  otp: string;

  @ApiProperty({ example: 'NewPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  new_password: string;
}
