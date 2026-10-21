import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { ApplyLoyaltyPointsDto, AdjustLoyaltyPointsDto } from './dto/loyalty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@homemate/types';

// ─── Customer endpoints ───────────────────────────────────────────────────────

@ApiTags('Loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('me')
  @ApiOperation({ summary: '[Customer] Tài khoản điểm + hạng của tôi' })
  async me(@CurrentUser() user: { sub: string }) {
    return this.loyaltyService.getAccount(user.sub);
  }

  @Get('me/history')
  @ApiOperation({ summary: '[Customer] Lịch sử biến động điểm' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async history(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loyaltyService.getHistory(user.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Dùng điểm cho đơn đã có giá chốt, chưa thanh toán' })
  async apply(@CurrentUser() user: { sub: string }, @Body() dto: ApplyLoyaltyPointsDto) {
    return this.loyaltyService.applyPoints(user.sub, dto.job_id, dto.points);
  }

  @Delete('apply/:jobId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Gỡ điểm khỏi đơn' })
  async remove(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.loyaltyService.removePoints(user.sub, jobId);
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

@ApiTags('Admin Loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/loyalty')
export class AdminLoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('users/:userId')
  @ApiOperation({ summary: '[Admin] Tài khoản điểm + lịch sử gần đây của 1 khách' })
  async getUser(@Param('userId') userId: string) {
    return this.loyaltyService.adminGetUser(userId);
  }

  @Post('users/:userId/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Điều chỉnh điểm thủ công (số dư không được âm)' })
  async adjust(@Param('userId') userId: string, @Body() dto: AdjustLoyaltyPointsDto) {
    return this.loyaltyService.adminAdjust(userId, dto.points, dto.note);
  }
}
