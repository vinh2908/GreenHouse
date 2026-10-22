import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SosBackupService } from './sos-backup.service';
import { CreateSosBackupDto, CustomerDecisionDto } from './dto/sos-backup.dto';

@ApiTags('SOS Backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sos-backup')
export class SosBackupController {
  constructor(private readonly sosService: SosBackupService) {}

  @Post('jobs/:jobId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Thợ gửi SOS cho đơn đang thực hiện (bất khả kháng) — yêu cầu chuyển sang chờ khách quyết định, chưa phát sóng tìm người thay',
  })
  async create(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: CreateSosBackupDto,
  ) {
    return this.sosService.createSos(user.sub, jobId, dto);
  }

  @Post(':sosId/customer-decision')
  @ApiOperation({
    summary:
      'Khách quyết định: accept_replacement (đồng ý đổi người — bắt đầu ghép Hungarian + phát sóng) | cancel_job (hủy đơn, hoàn tiền 100%, thợ không bị phạt)',
  })
  async customerDecision(
    @CurrentUser() user: { sub: string },
    @Param('sosId') sosId: string,
    @Body() dto: CustomerDecisionDto,
  ) {
    return this.sosService.customerDecision(user.sub, sosId, dto);
  }

  @Get('active')
  @ApiOperation({
    summary:
      'Cho thợ: popup SOS đang được mời (incoming) + SOS mình đã gửi đang chờ xử lý (outgoing) — dùng khi reconnect/mở lại app',
  })
  async active(@CurrentUser() user: { sub: string }) {
    return this.sosService.getActiveForHelper(user.sub);
  }

  @Get('customer-pending')
  @ApiOperation({
    summary: 'Cho khách: các SOS đang chờ mình quyết định (hiện popup khi mở lại app)',
  })
  async customerPending(@CurrentUser() user: { sub: string }) {
    return this.sosService.getCustomerPending(user.sub);
  }

  @Get('by-job/:jobId')
  @ApiOperation({ summary: 'Trạng thái SOS đang hoạt động của 1 đơn (cả 2 phía)' })
  async byJob(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.sosService.getByJob(user.sub, jobId);
  }

  @Post(':sosId/accept')
  @ApiOperation({
    summary:
      'Ứng viên nhận thay đơn (first-accept-wins, claim nguyên tử) — đổi helper của đơn, tiền giữ đảm bảo & giá không thay đổi',
  })
  async accept(@CurrentUser() user: { sub: string }, @Param('sosId') sosId: string) {
    return this.sosService.acceptSos(user.sub, sosId);
  }

  @Post(':sosId/decline')
  @ApiOperation({
    summary: 'Ứng viên từ chối — bị loại khỏi các đợt mời sau của SOS này',
  })
  async decline(@CurrentUser() user: { sub: string }, @Param('sosId') sosId: string) {
    return this.sosService.declineSos(user.sub, sosId);
  }

  @Post(':sosId/cancel')
  @ApiOperation({ summary: 'Thợ gốc thu hồi yêu cầu SOS (khi chưa có người thay thế)' })
  async cancel(@CurrentUser() user: { sub: string }, @Param('sosId') sosId: string) {
    return this.sosService.cancelSos(user.sub, sosId);
  }
}
