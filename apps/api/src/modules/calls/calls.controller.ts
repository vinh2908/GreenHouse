import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class InitiateCallDto {
  @ApiProperty({ description: 'ID job mà 2 bên cần gọi cho nhau' })
  @IsMongoId()
  job_id: string;
}

class EndCallDto {
  @ApiPropertyOptional({
    description: 'Lý do kết thúc: ended | missed | rejected | declined | failed',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Trạng thái tính năng gọi thoại (mobile ẩn nút gọi khi chưa cấu hình)' })
  getConfig() {
    return this.callsService.getConfig();
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bắt đầu phiên gọi cho 1 job: cấp token provider + phòng gọi (che số thật)' })
  async initiate(
    @CurrentUser() user: { sub: string },
    @Body() dto: InitiateCallDto,
  ) {
    return this.callsService.initiateCall(dto.job_id, user.sub);
  }

  @Post('sessions/:sessionId/join-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cấp token join phiên gọi cho phía nhận cuộc gọi (callee/caller)' })
  async joinToken(
    @CurrentUser() user: { sub: string },
    @Param('sessionId') sessionId: string,
  ) {
    return this.callsService.joinSessionToken(user.sub, sessionId);
  }

  @Post('sessions/:sessionId/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kết thúc phiên gọi' })
  async end(
    @CurrentUser() user: { sub: string },
    @Param('sessionId') sessionId: string,
    @Body() dto: EndCallDto,
  ) {
    return this.callsService.endCall(sessionId, user.sub, dto.reason);
  }
}
