import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HelpersService } from './helpers.service';
import {
  UpdateHelperProfileDto,
  SetHelperStatusDto,
  SubmitKycDto,
  UpdateLocationDto,
  BankAccountDto,
  UpdateAvailabilityDto,
  SetIncomeGoalDto,
} from './dto/helper.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Helpers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('helpers')
export class HelpersController {
  constructor(private readonly helpersService: HelpersService) {}

  // ─── Own profile ──────────────────────────────────────────────────────────

  @Get('me/profile')
  @ApiOperation({ summary: 'Lấy hồ sơ helper của bản thân' })
  async getMyProfile(@CurrentUser() user: { sub: string }) {
    return this.helpersService.getProfile(user.sub);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Cập nhật hồ sơ helper' })
  async updateProfile(@CurrentUser() user: { sub: string }, @Body() dto: UpdateHelperProfileDto) {
    return this.helpersService.updateProfile(user.sub, dto);
  }

  @Patch('me/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bật/tắt trạng thái nhận việc (ONLINE/OFFLINE)' })
  async setStatus(@CurrentUser() user: { sub: string }, @Body() dto: SetHelperStatusDto) {
    return this.helpersService.setStatus(user.sub, dto);
  }

  @Post('me/kyc')
  @ApiOperation({ summary: 'Nộp hồ sơ KYC (CCCD + selfie)' })
  async submitKyc(@CurrentUser() user: { sub: string }, @Body() dto: SubmitKycDto) {
    return this.helpersService.submitKyc(user.sub, dto);
  }

  @Patch('me/location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cập nhật vị trí GPS realtime' })
  async updateLocation(@CurrentUser() user: { sub: string }, @Body() dto: UpdateLocationDto) {
    await this.helpersService.updateLocation(user.sub, dto);
  }

  @Put('me/bank-account')
  @ApiOperation({ summary: 'Cập nhật tài khoản ngân hàng' })
  async updateBankAccount(@CurrentUser() user: { sub: string }, @Body() dto: BankAccountDto) {
    return this.helpersService.updateBankAccount(user.sub, dto);
  }

  // ─── Lịch làm việc (Feature 13) ────────────────────────────────────────────

  @Get('me/availability')
  @ApiOperation({ summary: '[Helper] Lấy lịch làm việc của bản thân' })
  async getMyAvailability(@CurrentUser() user: { sub: string }) {
    return this.helpersService.getAvailability(user.sub);
  }

  @Patch('me/availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Cập nhật lịch làm việc (ngày/giờ/ngày nghỉ)' })
  async updateMyAvailability(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.helpersService.updateAvailability(user.sub, dto);
  }

  // ─── Mục tiêu thu nhập (Feature 14) ────────────────────────────────────────

  @Patch('me/income-goal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Đặt mục tiêu thu nhập tháng' })
  async setIncomeGoal(@CurrentUser() user: { sub: string }, @Body() dto: SetIncomeGoalDto) {
    return this.helpersService.setIncomeGoal(user.sub, dto);
  }

  // ─── Public: view helper profile ──────────────────────────────────────────

  @Public()
  @Get(':userId/profile')
  @ApiOperation({ summary: 'Xem hồ sơ công khai của helper' })
  async getPublicProfile(@Param('userId') userId: string) {
    return this.helpersService.getPublicProfile(userId);
  }

  // ─── Nearby helpers (for customers) ──────────────────────────────────────

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Tìm helpers gần vị trí (cho customer)' })
  @ApiQuery({ name: 'lng', type: Number, example: 106.6297 })
  @ApiQuery({ name: 'lat', type: Number, example: 10.8231 })
  @ApiQuery({ name: 'radius', type: Number, example: 10, description: 'km' })
  @ApiQuery({ name: 'service_id', required: false })
  async findNearby(
    @Query('lng') lng: number,
    @Query('lat') lat: number,
    @Query('radius') radius: number = 10,
    @Query('service_id') serviceId?: string,
  ) {
    if (isNaN(+lng) || isNaN(+lat)) {
      return [];
    }
    return this.helpersService.findNearby([+lng, +lat], +radius || 10, serviceId);
  }
}
