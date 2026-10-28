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
  CreateSosJobDto,
  RebookJobDto,
  CreateQuoteDto,
  SelectQuoteDto,
  CompleteJobDto,
  ReviewJobDto,
  CancelJobDto,
  UpdateJobDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  ProposeAmendmentDto,
  RespondAmendmentDto,
  InviteTeamMemberDto,
  RespondTeamInvitationDto,
  CreateWarrantyDto,
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

  // ─── Customer: Đặt lại từ đơn đã hoàn thành ───────────────────────────────

  @Post('rebook/:sourceJobId')
  @ApiOperation({ summary: '[Customer] Đặt lại việc từ đơn đã hoàn thành (1 chạm)' })
  async rebookJob(
    @CurrentUser() user: { sub: string },
    @Param('sourceJobId') sourceJobId: string,
    @Body() dto: RebookJobDto,
  ) {
    return this.jobsService.rebookJob(user.sub, sourceJobId, dto);
  }

  // ─── Customer: Mở công khai đơn đang gửi riêng ────────────────────────────

  @Patch(':jobId/release-offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Mở công khai đơn đang ưu tiên cho thợ yêu thích' })
  async releaseOffer(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.releasePrivateOffer(user.sub, jobId);
  }

  // ─── Customer: Create SOS Emergency Job ───────────────────────────────────

  @Post('sos')
  @ApiOperation({ summary: '[Customer] Đăng yêu cầu cứu hộ khẩn cấp SOS' })
  async createSosJob(@CurrentUser() user: { sub: string }, @Body() dto: CreateSosJobDto) {
    return this.jobsService.createSosJob(user.sub, dto);
  }

  // ─── Helper: Accept SOS Job Immediately ───────────────────────────────────

  @Post(':id/sos-accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Nhận cứu hộ khẩn cấp SOS ngay lập tức' })
  async acceptSosJob(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.jobsService.acceptSosJob(user.sub, id);
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
    @CurrentUser() user: { sub: string },
    @Query('service_id') serviceId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    await this.jobsService.requireVerifiedHelper(user.sub);
    return this.jobsService.getAvailableJobs(
      user.sub,
      serviceId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ─── Helper: Own jobs ─────────────────────────────────────────────────────

  @Get('helper/my')
  @ApiOperation({ summary: '[Helper] Xem lịch sử công việc của tôi' })
  @ApiQuery({ name: 'status', required: false })
  async getHelperJobs(@CurrentUser() user: { sub: string }, @Query('status') status?: string) {
    return this.jobsService.getHelperJobs(user.sub, status);
  }

  // ─── Bản đồ nhu cầu (Roadmap Phase 2 — Feature 15) ──────────────────────
  // LƯU Ý: route tĩnh 'demand-map' phải đứng trước ':jobId'

  @Get('demand-map')
  @ApiOperation({ summary: '[Helper] Bản đồ nhu cầu: số đơn đang mở theo quận/thành phố' })
  @ApiQuery({ name: 'service_id', required: false, description: 'Lọc theo dịch vụ cụ thể' })
  async getDemandMap(
    @CurrentUser() user?: { sub: string },
    @Query('service_id') serviceId?: string,
  ) {
    return this.jobsService.getDemandMap(user?.sub, serviceId);
  }

  // ─── Team jobs / Đơn nhóm (Roadmap Phase 1 — Feature 5) ─────────────────
  // LƯU Ý: route 'team/invitations' phải đứng trước ':jobId'

  @Get('team/invitations')
  @ApiOperation({ summary: '[Helper] Lời mời vào nhóm đang chờ của tôi' })
  async getMyTeamInvitations(@CurrentUser() user: { sub: string }) {
    return this.jobsService.getMyTeamInvitations(user.sub);
  }

  @Get(':jobId/team/candidates')
  @ApiOperation({ summary: '[Lead] Danh sách thợ khả dụng để mời vào nhóm' })
  async getTeamCandidates(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.getTeamCandidates(jobId, user.sub);
  }

  @Post(':jobId/team/invite')
  @ApiOperation({ summary: '[Lead] Mời thợ vào nhóm với tỉ lệ chia tiền công' })
  async inviteTeamMember(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.jobsService.inviteTeamMember(jobId, user.sub, dto);
  }

  @Patch(':jobId/team/respond')
  @ApiOperation({ summary: '[Helper] Chấp nhận / từ chối lời mời vào nhóm' })
  async respondTeamInvitation(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: RespondTeamInvitationDto,
  ) {
    return this.jobsService.respondTeamInvitation(jobId, user.sub, dto.action);
  }

  // ─── Get job detail ───────────────────────────────────────────────────────

  @Get(':jobId')
  @ApiOperation({ summary: 'Xem chi tiết job' })
  async getJob(
    @Param('jobId') jobId: string,
    @CurrentUser() user: { sub: string; roles: string[] },
  ) {
    return this.jobsService.getJobForUser(jobId, user.sub, user.roles ?? []);
  }

  @Patch(':jobId')
  @ApiOperation({ summary: 'Cập nhật thông tin & vị trí job (khách hàng)' })
  async updateJob(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.updateJob(user.sub, jobId, dto);
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

  // ─── Customer: Tạo đơn bảo hành 1 chạm (Feature 9) ────────────────────────

  @Post(':jobId/warranty')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Tạo đơn bảo hành miễn phí từ đơn đã hoàn thành còn hạn' })
  async createWarrantyJob(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto?: CreateWarrantyDto,
  ) {
    return this.jobsService.createWarrantyJob(user.sub, jobId, dto);
  }

  // ─── Helper: Nhận việc trực tiếp với giá cam kết ─────────────────────────

  @Post(':jobId/accept-fixed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Nhận việc ngay với giá cam kết (không cần báo giá)' })
  async acceptFixedPrice(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.acceptFixedPrice(user.sub, jobId);
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

  // ─── Get contract & Contract Amendments ───────────────────────────────────

  @Get(':jobId/contract')
  @ApiOperation({ summary: 'Xem hợp đồng số của job' })
  async getContract(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('jobId') jobId: string,
  ) {
    return this.jobsService.getContract(jobId, user.sub, user.roles?.includes('admin') ?? false);
  }

  @Post(':jobId/contract/amendments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Đề xuất phụ lục phát sinh vật tư / chi phí' })
  async proposeAmendment(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Body() dto: ProposeAmendmentDto,
  ) {
    return this.jobsService.proposeContractAmendment(user.sub, jobId, dto);
  }

  @Patch(':jobId/contract/amendments/:amendmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer] Đồng ý hoặc từ chối phụ lục phát sinh chi phí' })
  async respondAmendment(
    @CurrentUser() user: { sub: string },
    @Param('jobId') jobId: string,
    @Param('amendmentId') amendmentId: string,
    @Body() dto: RespondAmendmentDto,
  ) {
    return this.jobsService.respondContractAmendment(user.sub, jobId, amendmentId, dto);
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

  // ─── Dispute & Admin Resolution ───────────────────────────────────────────

  @Post(':jobId/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Customer/Helper] Mở khiếu nại / báo sự cố nghiệm thu' })
  async openDispute(
    @CurrentUser() user: { sub: string; active_role: string },
    @Param('jobId') jobId: string,
    @Body() dto: OpenDisputeDto,
  ) {
    return this.jobsService.openDispute(user.sub, user.active_role, jobId, dto);
  }

  @Patch(':jobId/resolve-dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Phân xử tranh chấp & hoàn tiền / giải ngân' })
  async resolveDispute(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('jobId') jobId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.jobsService.resolveDispute(
      user.sub,
      Boolean(user.roles?.includes('admin')),
      jobId,
      dto,
    );
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  @Patch(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy job' })
  async cancelJob(
    @CurrentUser() user: { sub: string; active_role: string; roles?: string[] },
    @Param('jobId') jobId: string,
    @Body() dto: CancelJobDto,
  ) {
    const effectiveRole = user.roles?.includes('admin') ? 'admin' : user.active_role;
    return this.jobsService.cancelJob(user.sub, effectiveRole, jobId, dto);
  }

  // ─── F3: Helper Reject / Dismiss Open Job ───────────────────────────────────

  @Post(':jobId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Helper] Bỏ qua / từ chối đơn hàng đang mở' })
  async rejectJob(@CurrentUser() user: { sub: string }, @Param('jobId') jobId: string) {
    return this.jobsService.rejectJob(user.sub, jobId);
  }
}
