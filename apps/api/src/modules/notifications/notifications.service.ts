import { Injectable, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { NOTIFICATION_TYPES, SOCKET_EVENTS } from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @Inject(forwardRef(() => AppGateway))
    private gateway: AppGateway,
  ) {}

  async create(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    const notification = await this.notificationModel.create({
      user_id: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.payload,
    });

    // Realtime: push notification event to user's socket room
    try {
      this.gateway.emitToUser(data.userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
        _id: String(notification._id),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        is_read: false,
        created_at: notification.created_at,
      });
    } catch {
      // Ignore socket error if user is offline
    }

    return notification;
  }

  async getForUser(userId: string, unreadOnly = false) {
    const query: Record<string, unknown> = { user_id: new Types.ObjectId(userId) };
    if (unreadOnly) query['is_read'] = false;
    return this.notificationModel.find(query).sort({ created_at: -1 }).limit(50).exec();
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(notificationId), user_id: new Types.ObjectId(userId) },
        { is_read: true },
        { new: true },
      )
      .exec();
    if (!notification) throw new NotFoundException('Thông báo không tồn tại');
    return notification;
  }

  async markAllRead(userId: string) {
    return this.notificationModel
      .updateMany({ user_id: new Types.ObjectId(userId), is_read: false }, { is_read: true })
      .exec();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel
      .countDocuments({
        user_id: new Types.ObjectId(userId),
        is_read: false,
      })
      .exec();
  }

  // System message to every active user, pushed live to everyone connected.
  async broadcastAll(userIds: Types.ObjectId[], title: string, body: string) {
    await this.notificationModel.insertMany(
      userIds.map(id => ({
        user_id: id,
        type: NOTIFICATION_TYPES.SYSTEM,
        title,
        body,
        is_read: false,
      })),
    );
    this.gateway.server?.emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
      type: NOTIFICATION_TYPES.SYSTEM,
      title,
      body,
      is_read: false,
      created_at: new Date(),
    });
    return { sent: userIds.length };
  }

  // One unread notification per conversation: a new message replaces the previous
  // unread one (so it moves to the top) instead of piling up one per message.
  async notifyChatMessage(
    recipientId: string,
    senderName: string,
    preview: string,
    conversationId: string,
    jobId?: string,
  ) {
    const body = `${senderName}: ${preview.length > 80 ? preview.slice(0, 77) + '…' : preview}`;
    await this.notificationModel
      .deleteOne({
        user_id: new Types.ObjectId(recipientId),
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        is_read: false,
        'data.conversation_id': conversationId,
      })
      .exec();
    return this.create({
      userId: recipientId,
      type: NOTIFICATION_TYPES.NEW_MESSAGE,
      title: 'Tin nhắn mới',
      body,
      payload: { conversation_id: conversationId, job_id: jobId },
    });
  }

  async markConversationRead(userId: string, conversationId: string) {
    await this.notificationModel
      .updateMany(
        {
          user_id: new Types.ObjectId(userId),
          type: NOTIFICATION_TYPES.NEW_MESSAGE,
          is_read: false,
          'data.conversation_id': conversationId,
        },
        { is_read: true },
      )
      .exec();
  }

  // ─── Convenience helpers for specific notification types ───────────────────

  async notifyNewQuote(customerId: string, helperName: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: customerId,
      type: NOTIFICATION_TYPES.NEW_QUOTE_RECEIVED,
      title: 'Báo giá mới',
      body: `${helperName} đã gửi báo giá cho công việc "${jobTitle}"`,
      payload: { job_id: jobId },
    });
  }

  async notifyQuoteAccepted(helperId: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: helperId,
      type: NOTIFICATION_TYPES.QUOTE_ACCEPTED,
      title: 'Báo giá được chọn!',
      body: `Chúc mừng! Khách hàng đã chọn báo giá của bạn cho "${jobTitle}"`,
      payload: { job_id: jobId },
    });
  }

  async notifyJobCompleted(customerId: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: customerId,
      type: NOTIFICATION_TYPES.JOB_COMPLETED,
      title: 'Hoàn thành công việc',
      body: `Công việc "${jobTitle}" đã được hoàn thành. Vui lòng nghiệm thu.`,
      payload: { job_id: jobId },
    });
  }
}
