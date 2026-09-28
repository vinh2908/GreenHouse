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
import { AdminService } from './admin.service';
import { AdminListQueryDto, AdminSuspendDto, AdminKycActionDto } from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() body: string;
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
    return this.adminService.getUsers(search, status, Number(page) || 1, Number(limit) || 20);
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
    return this.adminService.getHelpers(search, status, Number(page) || 1, Number(limit) || 20);
  }

  @Get('helpers/kyc/pending')
  @ApiOperation({ summary: '[Admin] Danh sách hồ sơ KYC chờ duyệt' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingKyc(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.adminService.getPendingKyc(Number(page) || 1, Number(limit) || 20);
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
    return this.adminService.getJobs(status, search, Number(page) || 1, Number(limit) || 20);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: '[Admin] Chi tiết job' })
  async getJob(@Param('id') id: string) {
    return this.adminService.getJobById(id);
  }

  // ─── Notifications broadcast ──────────────────────────────────────────────

  @Post('notifications/broadcast')
  @ApiOperation({ summary: '[Admin] Gửi thông báo tới tất cả người dùng' })
  async broadcast(@Body() dto: BroadcastDto) {
    return this.adminService.broadcastNotification(dto.title, dto.body);
  }
}
