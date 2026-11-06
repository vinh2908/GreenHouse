import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
    summary:
      '[Admin/System] Khớp đơn tối ưu toàn cục bằng thuật toán Hungarian (Hungarian Algorithm)',
    description:
      'Giải bài toán phân bổ tối ưu N Thợ <-> M Đơn hàng trong O(N^3), tối đa hóa tổng lợi ích xã hội và giảm thiểu tối đa quãng đường di chuyển của tất cả thợ.',
  })
  async matchBatchJobs() {
    return this.matchingService.matchBatchJobs();
  }

  @Get('jobs/:jobId/optimal-helpers')
  @ApiOperation({
    summary: 'Tìm và xếp hạng thợ tối ưu nhất cho 1 công việc',
    description:
      'Tính toán điểm tương thích đa tiêu chí: Khoảng cách, chuyên môn, số sao rating và e-KYC. Chỉ chủ đơn hoặc Admin được xem.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOptimalHelpers(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('jobId') jobId: string,
    @Query('limit') limit?: number,
  ) {
    // B63: limit 1–20, mặc định 10; vượt hoặc không nguyên → 400
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
        throw new BadRequestException('limit phải là số nguyên từ 1 đến 20');
      }
    }
    return this.matchingService.findOptimalHelpersForJob(jobId, user.sub, user.roles, parsedLimit);
  }
}
