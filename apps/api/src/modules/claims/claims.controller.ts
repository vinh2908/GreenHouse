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
import { ClaimsService } from './claims.service';
import { CreateClaimDto, ReviewClaimDto } from './dto/claim.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@homemate/types';

// ─── Customer endpoints ───────────────────────────────────────────────────────

@ApiTags('Insurance Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @ApiOperation({ summary: '[Customer] Gửi yêu cầu bồi thường bảo hiểm cho đơn đã hoàn thành' })
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateClaimDto) {
    return this.claimsService.createClaim(user.sub, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '[Customer] Danh sách yêu cầu bồi thường của tôi' })
  async mine(@CurrentUser() user: { sub: string }) {
    return this.claimsService.getMyClaims(user.sub);
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: '[Customer] Yêu cầu bồi thường mới nhất của 1 đơn (null nếu chưa có)' })
  async forJob(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.claimsService.getClaimForJob(user.sub, jobId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu bồi thường (người thuộc đơn hoặc admin)' })
  async detail(@CurrentUser() user: { sub: string; roles?: string[] }, @Param('id') id: string) {
    return this.claimsService.getClaim(id, user);
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

@ApiTags('Admin Insurance Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/claims')
export class AdminClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách yêu cầu bồi thường bảo hiểm' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.claimsService.adminList(status, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Chi tiết yêu cầu bồi thường (kèm đơn + khách)' })
  async detail(@Param('id') id: string) {
    return this.claimsService.adminGet(id);
  }

  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Xử lý yêu cầu: start_review / approve (chi trả vào ví khách) / reject',
  })
  async review(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: ReviewClaimDto,
  ) {
    return this.claimsService.adminReview(user.sub, id, dto);
  }
}
