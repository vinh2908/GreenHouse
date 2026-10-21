import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';
import {
  CreateVoucherDto,
  UpdateVoucherDto,
  ValidateVoucherDto,
  ApplyVoucherDto,
} from './dto/voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@homemate/types';

// ─── Customer endpoints ───────────────────────────────────────────────────────

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Kiểm tra mã giảm giá + xem trước số tiền giảm' })
  async validate(
    @CurrentUser() user: { sub: string },
    @Body() dto: ValidateVoucherDto,
  ) {
    return this.vouchersService.preview(dto.code, user.sub, dto.amount ?? 0);
  }

  @Post('jobs/:jobId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Gắn mã giảm giá vào đơn chưa thanh toán' })
  async apply(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: ApplyVoucherDto,
  ) {
    return this.vouchersService.attachToJob(user.sub, jobId, dto.code);
  }

  @Delete('jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Gỡ mã giảm giá khỏi đơn' })
  async detach(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.vouchersService.detachFromJob(user.sub, jobId);
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

@ApiTags('Admin Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/vouchers')
export class AdminVouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách mã giảm giá' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'is_active', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('search') search?: string,
    @Query('is_active') isActive?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.vouchersService.adminList(
      search,
      isActive === undefined ? undefined : isActive === 'true',
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Tạo mã giảm giá' })
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateVoucherDto) {
    return this.vouchersService.adminCreate(user.sub, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Cập nhật mã giảm giá' })
  async update(@Param('id') id: string, @Body() dto: UpdateVoucherDto) {
    return this.vouchersService.adminUpdate(id, dto);
  }

  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Bật/tắt mã giảm giá' })
  async toggle(@Param('id') id: string) {
    return this.vouchersService.adminToggle(id);
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: '[Admin] Lịch sử sử dụng mã' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async redemptions(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.vouchersService.adminRedemptions(id, Number(page) || 1, Number(limit) || 20);
  }
}
