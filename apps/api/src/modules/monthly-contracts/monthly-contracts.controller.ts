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
import { MonthlyContractsService } from './monthly-contracts.service';
import {
  CreateMonthlyContractDto,
  RespondMonthlyContractDto,
  EndMonthlyContractDto,
  ConfirmAttendanceDto,
  CreateLeaveRequestDto,
  RespondLeaveRequestDto,
  SettleMonthDto,
} from './dto/monthly-contract.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Monthly Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('monthly-contracts')
export class MonthlyContractsController {
  constructor(private readonly service: MonthlyContractsService) {}

  @Post()
  @ApiOperation({ summary: '[Customer] Tạo hợp đồng giúp việc theo tháng (chờ thợ duyệt)' })
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateMonthlyContractDto) {
    return this.service.createContract(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách hợp đồng theo tháng của tôi' })
  @ApiQuery({ name: 'as', required: false, enum: ['customer', 'helper'] })
  async list(@CurrentUser() user: { sub: string }, @Query('as') as?: string) {
    return this.service.listMyContracts(user.sub, as === 'helper' ? 'helper' : 'customer');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng theo tháng' })
  async detail(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.service.getContract(user.sub, id);
  }

  @Patch(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Đồng ý / từ chối hợp đồng' })
  async respond(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: RespondMonthlyContractDto,
  ) {
    return this.service.respond(user.sub, id, dto.accept);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy hợp đồng (khách hoặc thợ, khi đang chờ duyệt/đang hiệu lực)' })
  async cancel(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.service.cancel(user.sub, id);
  }

  @Patch(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kết thúc hợp đồng đang hiệu lực' })
  async end(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: EndMonthlyContractDto,
  ) {
    return this.service.end(user.sub, id, dto.reason);
  }

  @Post(':id/attendance/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Điểm danh buổi hôm nay' })
  async checkin(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.service.checkin(user.sub, id);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Điểm danh của 1 tháng + các ngày theo lịch (để vẽ lịch)' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async attendance(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Query('month') month?: string,
  ) {
    return this.service.getAttendance(user.sub, id, month);
  }

  @Patch(':id/attendance/:date/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Xác nhận có mặt / đánh dấu vắng cho 1 ngày' })
  async confirm(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Param('date') date: string,
    @Body() dto: ConfirmAttendanceDto,
  ) {
    return this.service.confirmAttendance(user.sub, id, date, dto.approve);
  }

  @Post(':id/leave-requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Xin nghỉ 1 buổi trong tương lai' })
  async requestLeave(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.service.requestLeave(user.sub, id, dto);
  }

  @Get(':id/leave-requests')
  @ApiOperation({ summary: 'Danh sách đơn xin nghỉ của hợp đồng' })
  async listLeave(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.service.listLeaveRequests(user.sub, id);
  }

  @Patch(':id/leave-requests/:leaveId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Duyệt / từ chối đơn xin nghỉ' })
  async respondLeave(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Param('leaveId') leaveId: string,
    @Body() dto: RespondLeaveRequestDto,
  ) {
    return this.service.respondLeave(user.sub, id, leaveId, dto.approve);
  }

  @Get(':id/settlement')
  @ApiOperation({ summary: 'Tóm tắt chốt lương 1 tháng (preview hoặc đã chốt)' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async settlement(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Query('month') month?: string,
  ) {
    return this.service.getSettlement(user.sub, id, month);
  }

  @Post(':id/settlement/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Chốt lương tháng — cộng tiền vào ví thợ' })
  async settle(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: SettleMonthDto,
  ) {
    return this.service.settle(user.sub, id, dto);
  }
}
