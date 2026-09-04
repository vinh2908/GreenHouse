import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import {
  CreateJobDto,
  CreateQuoteDto,
  SelectQuoteDto,
  CompleteJobDto,
  ReviewJobDto,
  CancelJobDto,
} from './dto/job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ─── Customer: Create job ─────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: '[Customer] Đăng yêu cầu công việc' })
  async createJob(@CurrentUser() user: { sub: string }, @Body() dto: CreateJobDto) {
    return this.jobsService.createJob(user.sub, dto);
  }

  // ─── Customer: Get own jobs ───────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: '[Customer] Lấy danh sách job của tôi' })
  @ApiQuery({ name: 'status', required: false })
  async getMyJobs(@CurrentUser() user: { sub: string }, @Query('status') status?: string) {
    return this.jobsService.getCustomerJobs(user.sub, status);
  }

  // ─── Helper: Available job feed ───────────────────────────────────────────

  @Get('available')
  @ApiOperation({ summary: '[Helper] Xem danh sách job có thể nhận' })
  @ApiQuery({ name: 'service_id', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAvailableJobs(
    @Query('service_id') serviceId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.jobsService.getAvailableJobs(serviceId, Number(page) || 1, Number(limit) || 20);
  }

  // ─── Helper: Own jobs ─────────────────────────────────────────────────────

  @Get('helper/my')
  @ApiOperation({ summary: '[Helper] Xem lịch sử công việc của tôi' })
  @ApiQuery({ name: 'status', required: false })
  async getHelperJobs(@CurrentUser() user: { sub: string }, @Query('status') status?: string) {
    return this.jobsService.getHelperJobs(user.sub, status);
  }

  // ─── Get job detail ───────────────────────────────────────────────────────

  @Get(':jobId')
  @ApiOperation({ summary: 'Xem chi tiết job' })
  async getJob(@Param('jobId') jobId: string) {
    return this.jobsService.getJobById(jobId);
  }

  // ─── Get quotes for job ───────────────────────────────────────────────────

  @Get(':jobId/quotes')
  @ApiOperation({ summary: 'Xem danh sách báo giá của job' })
  async getQuotes(
    @Param('jobId') jobId: string,
    @CurrentUser() user: { sub: string; active_role: string },
  ) {
    return this.jobsService.getJobQuotes(jobId, user.sub, user.active_role);
  }

  // ─── Helper: Submit quote ─────────────────────────────────────────────────

  @Post(':jobId/quotes')
  @ApiOperation({ summary: '[Helper] Gửi báo giá cho job' })
  async submitQuote(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.jobsService.submitQuote(user.sub, jobId, dto);
  }

  // ─── Customer: Select quote (creates contract) ────────────────────────────

  @Post(':jobId/select-quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Chọn báo giá → tạo hợp đồng số' })
  async selectQuote(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: SelectQuoteDto,
  ) {
    return this.jobsService.selectQuote(user.sub, jobId, dto);
  }

  // ─── Get contract ─────────────────────────────────────────────────────────

  @Get(':jobId/contract')
  @ApiOperation({ summary: 'Xem hợp đồng số của job' })
  async getContract(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.getContract(jobId, user.sub);
  }

  // ─── Helper: Status transitions ───────────────────────────────────────────

  @Patch(':jobId/on-the-way')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Xác nhận đang trên đường đến' })
  async onTheWay(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.helperOnTheWay(user.sub, jobId);
  }

  @Patch(':jobId/arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Xác nhận đã đến nơi' })
  async arrived(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.helperArrived(user.sub, jobId);
  }

  @Patch(':jobId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Bắt đầu làm việc' })
  async startJob(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.startJob(user.sub, jobId);
  }

  @Patch(':jobId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Hoàn thành công việc + upload ảnh' })
  async completeJob(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: CompleteJobDto,
  ) {
    return this.jobsService.completeByHelper(user.sub, jobId, dto);
  }

  // ─── Customer: Approve completion ─────────────────────────────────────────

  @Patch(':jobId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Nghiệm thu + đánh giá helper' })
  async approveCompletion(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: ReviewJobDto,
  ) {
    return this.jobsService.approveCompletion(user.sub, jobId, dto);
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  @Patch(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy job' })
  async cancelJob(
    @CurrentUser() user: { sub: string; active_role: string },
    @Param('jobId') jobId: string,
    @Body() dto: CancelJobDto,
  ) {
    return this.jobsService.cancelJob(user.sub, user.active_role, jobId, dto);
  }
}
