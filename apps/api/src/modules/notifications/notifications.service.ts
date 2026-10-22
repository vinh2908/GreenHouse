import { Injectable, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NOTIFICATION_TYPES, SOCKET_EVENTS } from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';
import { ZaloNotificationService } from './zalo.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/receipts';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AppGateway))
    private gateway: AppGateway,
    private readonly zaloService: ZaloNotificationService,
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

    // OS push (Expo Push Service): fire-and-forget — khi app bị đóng/nền, socket
    // không tới được nên đây là đường duy nhất để user thấy thông báo. Mọi lỗi
    // (không có token, token hết hạn, mạng...) đều nuốt tại đây, không làm hỏng create().
    void this.sendExpoPush(data.userId, data.title, data.body, {
      type: data.type,
      ...(data.payload ?? {}),
    }).catch(() => undefined);

    // Zalo OA (Feature 19): fire-and-forget — service tự bỏ qua khi chưa cấu
    // hình OA và không bao giờ throw, nên không thể làm hỏng luồng tạo thông báo.
    void this.zaloService
      .sendForNotification({
        _id: notification._id,
        user_id: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
      })
      .catch(() => undefined);

    return notification;
  }

  /**
   * Gửi OS push tới mọi thiết bị của user qua Expo Push Service.
   * data đính kèm luôn chứa `type` + toàn bộ payload gốc để app deep-link
   * đúng màn hình khi user chạm vào push (xem utils/notification-route.ts phía mobile).
   * Không bao giờ throw.
   */
  private async sendExpoPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(userId)) return;
      const user = await this.userModel
        .findById(userId)
        .select('push_tokens')
        .lean()
        .exec();
      const tokens = ((user?.push_tokens ?? []) as string[]).filter(
        token => typeof token === 'string' && token.startsWith('ExponentPushToken'),
      );
      if (tokens.length === 0) return;

      const messages = tokens.map(to => ({
        to,
        title,
        body,
        data,
        sound: 'default' as const,
        priority: 'high' as const,
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      // Dọn token chết: Expo báo DeviceNotRegistered qua ticket (ngay lúc
      // gửi) hoặc qua receipt (sau khi APNs/FCM từ chối). Token nào bị báo
      // chết thì gỡ khỏi push_tokens của user để không gửi vào hư không mãi.
      // Best-effort: mọi lỗi ở bước này đều bị nuốt, không làm hỏng send.
      try {
        const deadTokens = new Set<string>();
        const receiptIdToToken = new Map<string, string>();
        const sendResult = (await res.json().catch(() => null)) as {
          data?: Array<{
            status?: string;
            id?: string;
            details?: { error?: string };
          }>;
        } | null;
        const tickets = sendResult?.data ?? [];
        tickets.forEach((ticket, i) => {
          const token = messages[i]?.to;
          if (!token) return;
          if (ticket?.status === 'error') {
            if (ticket?.details?.error === 'DeviceNotRegistered') {
              deadTokens.add(token);
            }
          } else if (ticket?.id) {
            receiptIdToToken.set(ticket.id, token);
          }
        });

        if (receiptIdToToken.size > 0) {
          const receiptRes = await fetch(EXPO_PUSH_RECEIPTS_URL, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: [...receiptIdToToken.keys()] }),
          });
          const receiptResult = (await receiptRes.json().catch(() => null)) as {
            data?: Record<
              string,
              { status?: string; details?: { error?: string } }
            >;
          } | null;
          for (const [receiptId, receipt] of Object.entries(receiptResult?.data ?? {})) {
            if (
              receipt?.status === 'error' &&
              receipt?.details?.error === 'DeviceNotRegistered'
            ) {
              const token = receiptIdToToken.get(receiptId);
              if (token) deadTokens.add(token);
            }
          }
        }

        if (deadTokens.size > 0) {
          await this.userModel
            .updateOne(
              { _id: new Types.ObjectId(userId) },
              { $pull: { push_tokens: { $in: [...deadTokens] } } },
            )
            .exec();
        }
      } catch {
        // Bỏ qua — dọn token là việc phụ, thử lại ở lần gửi sau.
      }
    } catch {
      // Push là kênh phụ trợ — lỗi không được ảnh hưởng luồng nghiệp vụ.
    }
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
