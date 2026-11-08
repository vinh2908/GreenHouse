import {
  BadRequestException,
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
import { AdminService } from './admin.service';
import {
  AdminSuspendDto,
  AdminKycActionDto,
  AdminWaivePenaltyDto,
  AdminUpdateJobStatusDto,
  AdminDirectRefundDto,
  AdminAssignHelperDto,
  AdminResolveSosDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() body: string;
}

// B90: phân trang admin — page >= 1, limit 1-100; sai -> 400 (không lặng lẽ mặc định)
export function parseAdminPagination(
  page?: number | string,
  limit?: number | string,
): { page: number; limit: number } {
  const p = page === undefined || page === '' ? 1 : Number(page);
  const l = limit === undefined || limit === '' ? 20 : Number(limit);
  if (!Number.isInteger(p) || p < 1) {
    throw new BadRequestException('page phải là số nguyên >= 1');
  }
  if (!Number.isInteger(l) || l < 1 || l > 100) {
    throw new BadRequestException('limit phải là số nguyên trong khoảng 1-100');
  }
  return { page: p, limit: l };
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: '[Admin] Thống kê tổng quan dashboard' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({ summary: '[Admin] B108: Lịch sử thông báo đã gửi' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'grouped', required: false, type: Boolean })
  async getSentNotifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('user_id') userId?: string,
    @Query('grouped') grouped?: string,
  ) {
    const { page: p, limit: l } = parseAdminPagination(page, limit);
    return this.adminService.getSentNotifications(p, l, type, userId, grouped === 'true');
  }

  @Get('users')
  @ApiOperation({ summary: '[Admin] Danh sách người dùng' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUsers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getUsers(search, status, pg, lm);
  }

  @Get('users/:id')
  @ApiOperation({ summary: '[Admin] Chi tiết người dùng' })
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Đình chỉ tài khoản người dùng' })
  async suspendUser(@Param('id') id: string, @Body() dto: AdminSuspendDto) {
    return this.adminService.suspendUser(id, dto.reason);
  }

  @Patch('users/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Kích hoạt lại tài khoản' })
  async activateUser(@Param('id') id: string) {
    return this.adminService.activateUser(id);
  }

  @Patch('users/:id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] B107: Xoá mềm tài khoản (không xoá cứng, không xoá admin)' })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] B107: Khôi phục tài khoản đã xoá mềm' })
  async restoreUser(@Param('id') id: string) {
    return this.adminService.restoreUser(id);
  }

  // ─── Helpers / KYC ───────────────────────────────────────────────────────

  @Get('helpers')
  @ApiOperation({ summary: '[Admin] Danh sách người giúp việc' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['unsubmitted', 'pending', 'approved', 'rejected'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHelpers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getHelpers(search, status, pg, lm);
  }

  @Get('helpers/kyc/pending')
  @ApiOperation({ summary: '[Admin] Danh sách hồ sơ KYC chờ duyệt' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingKyc(@Query('page') page?: number, @Query('limit') limit?: number) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getPendingKyc(pg, lm);
  }

  @Patch('helpers/:userId/kyc/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Duyệt hồ sơ KYC helper' })
  async approveKyc(@Param('userId') userId: string) {
    return this.adminService.approveKyc(userId);
  }

  @Patch('helpers/:userId/kyc/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Từ chối hồ sơ KYC helper' })
  async rejectKyc(@Param('userId') userId: string, @Body() dto: AdminKycActionDto) {
    return this.adminService.rejectKyc(userId, dto.reason ?? 'Hồ sơ không hợp lệ');
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({ summary: '[Admin] Danh sách tất cả jobs' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getJobs(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getJobs(status, search, pg, lm);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: '[Admin] Chi tiết job' })
  async getJob(@Param('id') id: string) {
    return this.adminService.getJobById(id);
  }

  @Patch('jobs/:id/status')
  @ApiOperation({ summary: '[Admin] Đổi trạng thái job thủ công' })
  async updateJobStatus(
    @Param('id') id: string,
    @Body() dto: AdminUpdateJobStatusDto,
    @CurrentUser() adminUser: any,
  ) {
    const adminId = adminUser?.sub || adminUser?._id || adminUser?.id;
    return this.adminService.updateJobStatus(id, dto.status, dto.note, adminId);
  }

  @Post('jobs/:id/refund')
  @ApiOperation({ summary: '[Admin] Hoàn tiền ngoài luồng tranh chấp' })
  async directRefund(
    @Param('id') id: string,
    @Body() dto: AdminDirectRefundDto,
    @CurrentUser() adminUser: any,
  ) {
    const adminId = adminUser?.sub || adminUser?._id || adminUser?.id;
    return this.adminService.directRefund(id, Number(dto.amount), dto.reason, adminId);
  }

  @Post('jobs/:id/assign-helper')
  @ApiOperation({
    summary: '[Admin] B11: Gán thợ thủ công cho đơn hàng (Hungarian matching hoặc gán tay)',
  })
  async assignHelper(
    @Param('id') id: string,
    @Body() dto: AdminAssignHelperDto,
    @CurrentUser() adminUser: any,
  ) {
    const adminId = adminUser?.sub || adminUser?._id || adminUser?.id;
    return this.adminService.adminAssignHelper(id, dto.helper_id, adminId);
  }

  // ─── Notifications broadcast ──────────────────────────────────────────────

  @Post('notifications/broadcast')
  @ApiOperation({ summary: '[Admin] Gửi thông báo tới tất cả người dùng' })
  async broadcast(@Body() dto: BroadcastDto) {
    return this.adminService.broadcastNotification(dto.title, dto.body);
  }

  // ─── SOS Backup oversight ─────────────────────────────────────────────────

  @Get('sos-backup/flagged')
  @ApiOperation({ summary: '[Admin] Yêu cầu SOS bị gắn cờ cần chú ý (admin_attention)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFlaggedSosRequests(@Query('page') page?: number, @Query('limit') limit?: number) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getFlaggedSosRequests(pg, lm);
  }

  @Patch('sos-backup/:id/resolve')
  @ApiOperation({ summary: '[Admin] A09: Xử lý và gỡ cờ admin_attention cho yêu cầu SOS' })
  async resolveFlaggedSos(
    @Param('id') id: string,
    @Body() dto: AdminResolveSosDto,
    @CurrentUser() adminUser: any,
  ) {
    const adminId = adminUser?.sub || adminUser?._id || adminUser?.id;
    return this.adminService.resolveFlaggedSos(id, dto.note, adminId);
  }

  @Get('helper-penalty-events')
  @ApiOperation({ summary: '[Admin] Sổ sự kiện phạt hủy đơn của thợ' })
  @ApiQuery({ name: 'helper_id', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'active | waived' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHelperPenaltyEvents(
    @Query('helper_id') helperId?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const { page: pg, limit: lm } = parseAdminPagination(page, limit);
    return this.adminService.getHelperPenaltyEvents(helperId, status, pg, lm);
  }

  @Post('helper-penalty-events/:id/waive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[Admin] Miễn 1 sự kiện phạt — sự kiện chuyển waived và điểm thợ được tính lại không còn sự kiện này (idempotent)',
  })
  async waivePenaltyEvent(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: AdminWaivePenaltyDto,
  ) {
    return this.adminService.waivePenaltyEvent(user.sub, id, dto.reason);
  }
}
