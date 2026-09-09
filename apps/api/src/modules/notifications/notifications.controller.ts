import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy thông báo của tôi' })
  @ApiQuery({ name: 'unread_only', required: false, type: Boolean })
  async getMyNotifications(
    @CurrentUser() user: { sub: string },
    @Query('unread_only') unreadOnly?: string,
  ) {
    return this.notificationsService.getForUser(user.sub, unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Đếm số thông báo chưa đọc' })
  async getUnreadCount(@CurrentUser() user: { sub: string }) {
    const count = await this.notificationsService.getUnreadCount(user.sub);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  async markRead(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả đã đọc' })
  async markAllRead(@CurrentUser() user: { sub: string }) {
    await this.notificationsService.markAllRead(user.sub);
    return { message: 'Đã đánh dấu tất cả là đã đọc' };
  }
}
