import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
  Message,
  MessageDocument,
} from './schemas/chat.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { AppGateway } from './app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SOCKET_EVENTS } from '@homemate/constants';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @Inject(forwardRef(() => AppGateway))
    private gateway: AppGateway,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  async getOrCreateConversation(
    jobId: string,
    participantIds: string[],
  ): Promise<ConversationDocument> {
    const existing = await this.conversationModel
      .findOne({ job_id: new Types.ObjectId(jobId) })
      .populate('participants', 'full_name avatar phone')
      .exec();
    if (existing) return existing;

    const newConv = await this.conversationModel.create({
      job_id: new Types.ObjectId(jobId),
      participants: participantIds.map(id => new Types.ObjectId(id)),
    });

    return this.conversationModel
      .findById(newConv._id)
      .populate('participants', 'full_name avatar phone')
      .exec() as Promise<ConversationDocument>;
  }

  async getConversationByJob(jobId: string, userId: string): Promise<ConversationDocument> {
    let conv: any = await this.conversationModel
      .findOne({ job_id: new Types.ObjectId(jobId) })
      .populate('participants', 'full_name avatar phone')
      .exec();

    // Nếu chưa có conversation -> kiểm tra Job xem có customer & helper không để tự tạo
    if (!conv) {
      const job = await this.jobModel.findById(jobId).exec();
      if (!job) throw new NotFoundException('Không tìm thấy đơn hàng');

      const customerId = String(job.customer_id);
      const helperId = job.helper_id ? String(job.helper_id) : null;

      if (!helperId) {
        throw new NotFoundException('Đơn hàng chưa có thợ nhận việc, chưa thể mở cuộc trò chuyện');
      }

      // Kiểm tra quyền
      if (userId !== customerId && userId !== helperId) {
        throw new ForbiddenException('Bạn không có quyền truy cập cuộc trò chuyện này');
      }

      conv = await this.getOrCreateConversation(jobId, [customerId, helperId]);
    }

    if (!conv) throw new NotFoundException('Không thể mở cuộc trò chuyện');

    const isParticipant = conv.participants.some(
      (p: any) => p._id?.toString() === userId || p.toString() === userId,
    );
    if (!isParticipant) throw new ForbiddenException();
    return conv;
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(userId)) return false;
    const found = await this.conversationModel
      .exists({ _id: new Types.ObjectId(conversationId), participants: new Types.ObjectId(userId) })
      .exec();
    return !!found;
  }

  async getMessages(conversationId: string, userId: string, page = 1, limit = 50) {
    const conv = await this.conversationModel.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    const isParticipant = conv.participants.some(p => p.toString() === userId);
    if (!isParticipant) throw new ForbiddenException();

    const skip = (page - 1) * limit;
    const messages = await this.messageModel
      .find({ conversation_id: new Types.ObjectId(conversationId) })
      .populate('sender_id', 'full_name avatar')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return messages.reverse(); // Oldest first
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type = 'text',
  ): Promise<MessageDocument> {
    const conv = await this.conversationModel.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    const isParticipant = conv.participants.some(p => p.toString() === senderId);
    if (!isParticipant) throw new ForbiddenException();

    const message = await this.messageModel.create({
      conversation_id: new Types.ObjectId(conversationId),
      sender_id: new Types.ObjectId(senderId),
      content,
      type,
      read_by: [new Types.ObjectId(senderId)],
    });

    // Update conversation last message
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        last_message: content,
        last_message_at: new Date(),
      })
      .exec();

    const populatedMsg = await this.messageModel
      .findById(message._id)
      .populate('sender_id', 'full_name avatar')
      .exec();

    // ── Realtime: emit message via WebSocket to conversation room & each participant
    try {
      this.gateway.emitToConversation(conversationId, SOCKET_EVENTS.CHAT_NEW_MESSAGE, {
        conversation_id: conversationId,
        message: populatedMsg,
      });

      // Emit to each participant room
      for (const pId of conv.participants) {
        this.gateway.emitToUser(String(pId), SOCKET_EVENTS.CHAT_NEW_MESSAGE, {
          conversation_id: conversationId,
          message: populatedMsg,
        });
      }
    } catch {
      // Ignore socket error if offline
    }

    // Notify recipients who are not currently looking at this conversation.
    const senderName =
      (populatedMsg?.sender_id as unknown as { full_name?: string })?.full_name ?? 'Tin nhắn';
    for (const pId of conv.participants) {
      const recipientId = String(pId);
      if (recipientId === senderId) continue;
      const watching = await this.gateway
        .isUserInRoom(recipientId, `chat:${conversationId}`)
        .catch(() => false);
      if (!watching) {
        await this.notificationsService
          .notifyChatMessage(
            recipientId,
            senderName,
            type === 'text' ? content : '[Hình ảnh]',
            conversationId,
            conv.job_id ? String(conv.job_id) : undefined,
          )
          .catch(() => undefined);
      }
    }

    return populatedMsg as MessageDocument;
  }

  async markRead(conversationId: string, userId: string) {
    await this.messageModel
      .updateMany(
        {
          conversation_id: new Types.ObjectId(conversationId),
          read_by: { $nin: [new Types.ObjectId(userId)] },
        },
        { $addToSet: { read_by: new Types.ObjectId(userId) } },
      )
      .exec();
    await this.notificationsService.markConversationRead(userId, conversationId);
  }

  async getUserConversations(userId: string) {
    return this.conversationModel
      .find({ participants: new Types.ObjectId(userId) })
      .populate('participants', 'full_name avatar phone')
      .populate('job_id', 'title status')
      .sort({ last_message_at: -1 })
      .exec();
  }
}
