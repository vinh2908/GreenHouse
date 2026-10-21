import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { AddDisputeEntryDto, AppealDisputeDto } from './dto/dispute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Xem hồ sơ tranh chấp của 1 job (timeline + phán quyết + quyền kháng cáo)' })
  async getCase(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('jobId') jobId: string,
  ) {
    return this.disputesService.getCaseForJob(
      jobId,
      user.sub,
      Boolean(user.roles?.includes('admin')),
    );
  }

  @Post('job/:jobId/entries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bổ sung bằng chứng / ghi chú vào hồ sơ tranh chấp' })
  async addEntry(
    @CurrentUser() user: { sub: string; roles?: string[]; active_role: string },
    @Param('jobId') jobId: string,
    @Body() dto: AddDisputeEntryDto,
  ) {
    const isAdmin = Boolean(user.roles?.includes('admin'));
    return this.disputesService.addEntry(jobId, user.sub, isAdmin, user.active_role, dto);
  }

  @Post('job/:jobId/appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kháng cáo phán quyết (1 lần duy nhất, trong thời hạn quy định)' })
  async appeal(
    @CurrentUser() user: { sub: string; active_role: string },
    @Param('jobId') jobId: string,
    @Body() dto: AppealDisputeDto,
  ) {
    return this.disputesService.appeal(jobId, user.sub, user.active_role, dto);
  }
}
