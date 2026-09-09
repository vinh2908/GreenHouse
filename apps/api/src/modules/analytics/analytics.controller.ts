import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: '[Admin] Tóm tắt so sánh tháng này vs tháng trước' })
  async getSummary() {
    return this.analyticsService.getSummary();
  }

  @Get('jobs-per-day')
  @ApiOperation({ summary: '[Admin] Số job theo ngày' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Số ngày gần đây (default 30)' })
  async getJobsPerDay(@Query('days') days?: number) {
    return this.analyticsService.getJobsPerDay(Number(days) || 30);
  }

  @Get('jobs-by-status')
  @ApiOperation({ summary: '[Admin] Phân bố trạng thái job' })
  async getJobsByStatus() {
    return this.analyticsService.getJobsByStatus();
  }

  @Get('revenue-per-month')
  @ApiOperation({ summary: '[Admin] Doanh thu theo tháng' })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Số tháng gần đây (default 6)' })
  async getRevenuePerMonth(@Query('months') months?: number) {
    return this.analyticsService.getRevenuePerMonth(Number(months) || 6);
  }

  @Get('new-users-per-day')
  @ApiOperation({ summary: '[Admin] Người dùng mới theo ngày' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getNewUsersPerDay(@Query('days') days?: number) {
    return this.analyticsService.getNewUsersPerDay(Number(days) || 30);
  }

  @Get('top-helpers')
  @ApiOperation({ summary: '[Admin] Top helpers theo số job hoàn thành' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTopHelpers(@Query('limit') limit?: number) {
    return this.analyticsService.getTopHelpers(Number(limit) || 10);
  }

  @Get('rating-by-service')
  @ApiOperation({ summary: '[Admin] Rating trung bình theo loại dịch vụ' })
  async getRatingByService() {
    return this.analyticsService.getRatingByService();
  }
}
