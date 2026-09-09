import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { MockPayJobDto, RequestWithdrawalDto, ProcessWithdrawalDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── Wallet ───────────────────────────────────────────────────────────────

  @Get('wallet')
  @ApiOperation({ summary: 'Xem số dư ví' })
  async getWallet(@CurrentUser() user: { sub: string }) {
    return this.paymentsService.getWallet(user.sub);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  @Get('transactions')
  @ApiOperation({ summary: 'Lịch sử giao dịch của tôi' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTransactions(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.getTransactions(user.sub, Number(page) || 1, Number(limit) || 20);
  }

  // ─── Mock payment ─────────────────────────────────────────────────────────

  @Post('pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Mock] Thanh toán cho job (dev only)' })
  async mockPayJob(@CurrentUser() user: { sub: string }, @Body() dto: MockPayJobDto) {
    // In production: integrate real payment gateway (VNPay, MoMo, ZaloPay)
    // For MVP/dev: mock success
    return this.paymentsService.mockPayJob(user.sub, dto.job_id, 0, dto.payment_method);
  }

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  @Post('withdraw')
  @ApiOperation({ summary: '[Helper] Yêu cầu rút tiền' })
  async requestWithdrawal(@CurrentUser() user: { sub: string }, @Body() dto: RequestWithdrawalDto) {
    return this.paymentsService.requestWithdrawal(user.sub, dto.amount, dto.bank_account);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: '[Helper] Lịch sử rút tiền của tôi' })
  async getWithdrawals(@CurrentUser() user: { sub: string }) {
    return this.paymentsService.getWithdrawals(user.sub);
  }

  // ─── Admin: Manage withdrawals ────────────────────────────────────────────

  @Get('admin/withdrawals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Danh sách yêu cầu rút tiền' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'completed', 'rejected'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllWithdrawals(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.getAllWithdrawals(status, Number(page) || 1, Number(limit) || 20);
  }

  @Patch('admin/withdrawals/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Duyệt / từ chối yêu cầu rút tiền' })
  async processWithdrawal(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: ProcessWithdrawalDto,
  ) {
    return this.paymentsService.processWithdrawal(id, dto.action, dto.admin_note, user.sub);
  }

  // ─── Admin: All transactions ───────────────────────────────────────────────

  @Get('admin/transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Tất cả giao dịch' })
  @ApiQuery({ name: 'type', required: false, enum: ['payment', 'earning', 'withdrawal', 'refund'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllTransactions(
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.getAllTransactions(type, Number(page) || 1, Number(limit) || 20);
  }
}
