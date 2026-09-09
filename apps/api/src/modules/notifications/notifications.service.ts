import { Injectable, Inject, forwardRef } from '@nestjs/common';
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
    return this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(notificationId), user_id: new Types.ObjectId(userId) },
        { is_read: true },
        { new: true },
      )
      .exec();
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
