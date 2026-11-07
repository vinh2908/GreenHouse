import {
  IsNumber,
  IsNotEmpty,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MockPayJobDto {
  @ApiProperty({ description: 'Job ID cần thanh toán' })
  @IsString()
  @IsNotEmpty()
  job_id: string;

  @ApiProperty({
    description:
      'Phương thức thanh toán (wallet | cash | vietqr | momo | zalopay). VietQR/MoMo/ZaloPay là thanh toán MÔ PHỎNG (demo, chưa có cổng thanh toán thật — không thu tiền thật, tiền thợ chỉ vào số dư mô phỏng, không rút được).',
    example: 'cash',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['wallet', 'cash', 'vietqr', 'momo', 'zalopay'])
  payment_method: string;
}

export class TopupWalletDto {
  @ApiProperty({ description: 'Số tiền nạp mô phỏng vào ví (tối thiểu 50,000₫, phải là số nguyên). Chưa có cổng thanh toán thật nên đây chỉ là nạp thử mô phỏng — số dư rút được không thay đổi.', minimum: 50000 })
  @IsNumber()
  @IsInt({ message: 'Số tiền nạp phải là số nguyên (không có phần thập phân)' })
  @Min(50000)
  @Max(100_000_000)
  amount: number;

  @ApiPropertyOptional({ description: 'Phương thức nạp (vietqr | momo)', example: 'vietqr' })
  @IsOptional()
  @IsString()
  payment_method?: string;
}

export class BankAccountInfoDto {
  @ApiProperty({ example: 'Vietcombank' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @ApiProperty({ example: 'NGUYEN VAN A' })
  @IsString()
  @IsNotEmpty()
  account_name: string;
}

export class RequestWithdrawalDto {
  @ApiProperty({
    description: 'Số tiền rút (tối thiểu 50,000₫, phải là số nguyên)',
    minimum: 50000,
  })
  @IsNumber()
  @IsInt({ message: 'Số tiền rút phải là số nguyên' })
  @Min(50000)
  @Max(500_000_000)
  amount: number;

  @ApiPropertyOptional({ description: 'Thông tin tài khoản ngân hàng (nếu chưa lưu)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountInfoDto)
  bank_account?: BankAccountInfoDto;
}

export class ProcessWithdrawalDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  admin_note?: string;
}
