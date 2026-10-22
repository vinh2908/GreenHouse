import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SosBackupDecision, SosBackupReason } from '../schemas/sos-backup.schema';

export class CreateSosBackupDto {
  @ApiProperty({
    description: 'Lý do thợ không thể tiếp tục đơn (chỉ mã lý do được hiển thị cho khách)',
    enum: SosBackupReason,
    example: SosBackupReason.VEHICLE_BREAKDOWN,
  })
  @IsEnum(SosBackupReason, { message: 'reason không hợp lệ' })
  reason: SosBackupReason;

  @ApiPropertyOptional({
    description: 'Ghi chú riêng của thợ (không hiển thị cho khách)',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CustomerDecisionDto {
  @ApiProperty({
    description:
      'Quyết định của khách: accept_replacement = đồng ý đổi người giúp việc khác; cancel_job = hủy đơn, hoàn tiền 100% theo chính sách SOS',
    enum: SosBackupDecision,
    example: SosBackupDecision.ACCEPT_REPLACEMENT,
  })
  @IsEnum(SosBackupDecision, { message: 'decision không hợp lệ' })
  decision: SosBackupDecision;
}
