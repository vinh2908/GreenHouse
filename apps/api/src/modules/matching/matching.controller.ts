import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';

@ApiTags('Matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('batch')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin/System] Khớp đơn tối ưu toàn cục bằng thuật toán Hungarian (Hungarian Algorithm)',
    description:
      'Giải bài toán phân bổ tối ưu N Thợ <-> M Đơn hàng trong O(N^3), tối đa hóa tổng lợi ích xã hội và giảm thiểu tối đa quãng đường di chuyển của tất cả thợ.',
  })
  async matchBatchJobs() {
    return this.matchingService.matchBatchJobs();
  }

  @Get('jobs/:jobId/optimal-helpers')
  @ApiOperation({
    summary: 'Tìm và xếp hạng thợ tối ưu nhất cho 1 công việc',
    description: 'Tính toán điểm tương thích đa tiêu chí: Khoảng cách, chuyên môn, số sao rating và e-KYC.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOptimalHelpers(
    @Param('jobId') jobId: string,
    @Query('limit') limit?: number,
  ) {
    return this.matchingService.findOptimalHelpersForJob(jobId, Number(limit) || 5);
  }
}
