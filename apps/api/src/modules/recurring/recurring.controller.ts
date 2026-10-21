import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecurringService } from './recurring.service';
import { CreateRecurringPlanDto, UpdateRecurringPlanDto } from './dto/recurring.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Recurring Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recurring-plans')
export class RecurringController {
  constructor(private readonly recurringService: RecurringService) {}

  @Post()
  @ApiOperation({ summary: '[Customer] Tạo gói định kỳ (tự sinh job theo lịch)' })
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateRecurringPlanDto) {
    return this.recurringService.createPlan(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: '[Customer] Danh sách gói định kỳ của tôi' })
  async list(@CurrentUser() user: { sub: string }) {
    return this.recurringService.listMyPlans(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Customer] Chi tiết gói định kỳ + các job đã sinh' })
  async detail(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.recurringService.getPlanDetail(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Customer] Cập nhật gói định kỳ (áp dụng cho lượt chưa sinh)' })
  async update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdateRecurringPlanDto,
  ) {
    return this.recurringService.updatePlan(user.sub, id, dto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Tạm dừng gói định kỳ' })
  async pause(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.recurringService.pausePlan(user.sub, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Tiếp tục gói định kỳ' })
  async resume(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.recurringService.resumePlan(user.sub, id);
  }

  @Post(':id/skip-next')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Bỏ qua buổi gần nhất của gói' })
  async skipNext(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.recurringService.skipNext(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Hủy gói định kỳ (+ hủy job tương lai chưa chốt)' })
  async cancel(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.recurringService.cancelPlan(user.sub, id);
  }
}
