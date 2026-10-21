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
import { SupportService } from './support.service';
import { SendSupportMessageDto } from './dto/support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@homemate/types';

// ─── User endpoints ───────────────────────────────────────────────────────────

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Lấy hoặc tạo hội thoại hỗ trợ đang mở của tôi' })
  async getOrCreate(@CurrentUser() user: { sub: string }) {
    return this.supportService.getOrCreateOpen(user.sub);
  }

  @Get('conversations/me')
  @ApiOperation({ summary: 'Hội thoại hỗ trợ mới nhất của tôi + tin nhắn (hoặc null)' })
  async myLatest(@CurrentUser() user: { sub: string }) {
    return this.supportService.getMyLatest(user.sub);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Tin nhắn của hội thoại hỗ trợ (chủ sở hữu hoặc admin)' })
  async getMessages(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const isAdmin = !!user.roles?.includes(UserRole.ADMIN);
    return this.supportService.getMessages(
      id,
      { sub: user.sub, isAdmin },
      Number(page) || 1,
      Number(limit) || 30,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn hỗ trợ (chỉ khi hội thoại đang mở)' })
  async send(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.supportService.sendUserMessage(id, user.sub, dto.content);
  }

  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc phản hồi của đội hỗ trợ' })
  async markRead(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.supportService.markUserRead(id, user.sub);
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

@ApiTags('Admin Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('conversations')
  @ApiOperation({ summary: '[Admin] Danh sách hội thoại hỗ trợ' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'closed', 'all'] })
  async list(@Query('status') status?: string) {
    return this.supportService.adminList(status);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '[Admin] Tin nhắn của hội thoại hỗ trợ' })
  async getMessages(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.supportService.getMessages(
      id,
      { sub: '', isAdmin: true },
      Number(page) || 1,
      Number(limit) || 50,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: '[Admin] Phản hồi người dùng qua live chat hỗ trợ' })
  async send(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.supportService.adminSendMessage(id, user.sub, dto.content);
  }

  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Đánh dấu đã đọc hội thoại' })
  async markRead(@Param('id') id: string) {
    return this.supportService.adminMarkRead(id);
  }

  @Patch('conversations/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Đóng hội thoại hỗ trợ' })
  async close(@Param('id') id: string) {
    return this.supportService.adminClose(id);
  }
}
