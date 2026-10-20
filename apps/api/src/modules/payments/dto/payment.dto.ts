import {
  IsNumber,
  IsNotEmpty,
  IsString,
  IsIn,
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

  @ApiProperty({ description: 'Phương thức thanh toán (cash | vietqr | momo)', example: 'vietqr' })
  @IsString()
  @IsNotEmpty()
  payment_method: string;
}

export class TopupWalletDto {
  @ApiProperty({ description: 'Số tiền nạp vào ví ký quỹ (tối thiểu 50,000₫)', minimum: 50000 })
  @IsNumber()
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
  @ApiProperty({ description: 'Số tiền rút (tối thiểu 50,000₫)', minimum: 50000 })
  @IsNumber()
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
