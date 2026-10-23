import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SupportConversation,
  SupportConversationDocument,
  SupportMessage,
  SupportMessageDocument,
} from './schemas/support.schema';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES, SOCKET_EVENTS } from '@homemate/constants';

/**
 * Live chat hỗ trợ trực tuyến (Feature 18).
 * Mỗi user có tối đa 1 hội thoại đang 'open'; admin đóng hội thoại thì lần
 * POST /support/conversations tiếp theo của user sẽ tạo thread MỚI.
 * Admin không có socket room riêng — admin web poll REST (refetchInterval),
 * còn user nhận realtime qua SOCKET_EVENTS.SUPPORT_MESSAGE + thông báo chuông.
 */
@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportConversation.name)
    private conversationModel: Model<SupportConversationDocument>,
    @InjectModel(SupportMessage.name)
    private messageModel: Model<SupportMessageDocument>,
    @Inject(forwardRef(() => AppGateway))
    private gateway: AppGateway,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  private async findConversationOrThrow(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Không tìm thấy hội thoại hỗ trợ');
    const conv = await this.conversationModel.findById(id).exec();
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại hỗ trợ');
    return conv;
  }

  // ─── User ─────────────────────────────────────────────────────────────────

  /** Get-or-create hội thoại OPEN của user; thread mới nhất đã closed → tạo mới. */
  async getOrCreateOpen(userId: string) {
    const open = await this.conversationModel
      .findOne({ user_id: new Types.ObjectId(userId), status: 'open' })
      .sort({ created_at: -1 })
      .exec();
    if (open) return open;
    return this.conversationModel.create({ user_id: new Types.ObjectId(userId) });
  }

  /** Hội thoại mới nhất của tôi (kèm tóm tắt tin nhắn cuối) hoặc null. */
  async getMyLatest(userId: string) {
    const conv = await this.conversationModel
      .findOne({ user_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .exec();
    if (!conv) return null;
    const messages = await this.messageModel
      .find({ conversation_id: conv._id })
      .sort({ created_at: -1 })
      .limit(30)
      .exec();
    return { conversation: conv, messages: messages.reverse() };
  }

  async getMessages(
    conversationId: string,
    requester: { sub: string; isAdmin?: boolean },
    page = 1,
    limit = 30,
  ) {
    const conv = await this.findConversationOrThrow(conversationId);
    if (!requester.isAdmin && conv.user_id.toString() !== requester.sub) {
      throw new ForbiddenException('Bạn không có quyền xem hội thoại này');
    }
    const skip = (page - 1) * limit;
    const messages = await this.messageModel
      .find({ conversation_id: new Types.ObjectId(conversationId) })
      .populate('sender_id', 'full_name avatar')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    return messages.reverse(); // Oldest first — giống chat getMessages
  }

  async sendUserMessage(conversationId: string, userId: string, content: string) {
    const conv = await this.findConversationOrThrow(conversationId);
    if (conv.user_id.toString() !== userId) throw new ForbiddenException();
    if (conv.status !== 'open') {
      throw new BadRequestException('Hội thoại đã đóng. Hãy mở hội thoại hỗ trợ mới.');
    }
    const message = await this.messageModel.create({
      conversation_id: new Types.ObjectId(conversationId),
      sender_id: new Types.ObjectId(userId),
      sender_role: 'user',
      content,
    });
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        last_message: content,
        last_message_at: new Date(),
        $inc: { unread_for_admin: 1 },
      })
      .exec();
    const populated = await this.messageModel
      .findById(message._id)
      .populate('sender_id', 'full_name avatar')
      .exec();
    // Đồng bộ đa thiết bị cho chính user; admin web sẽ poll thấy tin mới.
    try {
      this.gateway.emitToUser(userId, SOCKET_EVENTS.SUPPORT_MESSAGE, {
        conversation_id: conversationId,
        message: populated,
      });
    } catch {
      // Ignore socket error if offline
    }
    return populated as SupportMessageDocument;
  }

  async markUserRead(conversationId: string, userId: string) {
    const conv = await this.findConversationOrThrow(conversationId);
    if (conv.user_id.toString() !== userId) throw new ForbiddenException();
    await this.conversationModel.findByIdAndUpdate(conversationId, { unread_for_user: 0 }).exec();
    return { message: 'Đã đọc' };
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminList(status?: string) {
    const query: Record<string, unknown> = {};
    if (status === 'open' || status === 'closed') query['status'] = status;
    return this.conversationModel
      .find(query)
      .populate('user_id', 'full_name phone avatar')
      .sort({ last_message_at: -1, created_at: -1 })
      .limit(100)
      .exec();
  }

  async adminSendMessage(conversationId: string, adminId: string, content: string) {
    const conv = await this.findConversationOrThrow(conversationId);
    const message = await this.messageModel.create({
      conversation_id: new Types.ObjectId(conversationId),
      sender_id: new Types.ObjectId(adminId),
      sender_role: 'admin',
      content,
    });
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        last_message: content,
        last_message_at: new Date(),
        $inc: { unread_for_user: 1 },
      })
      .exec();
    const populated = await this.messageModel
      .findById(message._id)
      .populate('sender_id', 'full_name avatar')
      .exec();
    const userId = conv.user_id.toString();
    try {
      this.gateway.emitToUser(userId, SOCKET_EVENTS.SUPPORT_MESSAGE, {
        conversation_id: conversationId,
        message: populated,
      });
    } catch {
      // Ignore socket error if offline
    }
    await this.notificationsService
      .create({
        userId,
        type: NOTIFICATION_TYPES.SUPPORT_REPLY,
        title: 'Đội hỗ trợ đã phản hồi',
        body: content.length > 120 ? content.slice(0, 117) + '…' : content,
        payload: { support_conversation_id: conversationId },
      })
      .catch(() => undefined);
    return populated as SupportMessageDocument;
  }

  async adminMarkRead(conversationId: string) {
    await this.findConversationOrThrow(conversationId);
    await this.conversationModel.findByIdAndUpdate(conversationId, { unread_for_admin: 0 }).exec();
    return { message: 'Đã đọc' };
  }

  async adminClose(conversationId: string) {
    const conv = await this.findConversationOrThrow(conversationId);
    conv.status = 'closed';
    await conv.save();
    return conv;
  }
}
