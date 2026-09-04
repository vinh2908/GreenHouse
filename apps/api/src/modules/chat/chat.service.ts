import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument, Message, MessageDocument } from './schemas/chat.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async getOrCreateConversation(
    jobId: string,
    participantIds: string[],
  ): Promise<ConversationDocument> {
    const existing = await this.conversationModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (existing) return existing;

    return this.conversationModel.create({
      job_id: new Types.ObjectId(jobId),
      participants: participantIds.map(id => new Types.ObjectId(id)),
    });
  }

  async getConversationByJob(jobId: string, userId: string): Promise<ConversationDocument> {
    const conv = await this.conversationModel
      .findOne({ job_id: new Types.ObjectId(jobId) })
      .exec();
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    const isParticipant = conv.participants.some(p => p.toString() === userId);
    if (!isParticipant) throw new ForbiddenException();
    return conv;
  }

  async getMessages(conversationId: string, userId: string, page = 1, limit = 30) {
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
    if (!conv) throw new NotFoundException();
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
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      last_message: content,
      last_message_at: new Date(),
    }).exec();

    return message;
  }

  async markRead(conversationId: string, userId: string) {
    await this.messageModel.updateMany(
      {
        conversation_id: new Types.ObjectId(conversationId),
        read_by: { $nin: [new Types.ObjectId(userId)] },
      },
      { $addToSet: { read_by: new Types.ObjectId(userId) } },
    ).exec();
  }

  async getUserConversations(userId: string) {
    return this.conversationModel
      .find({ participants: new Types.ObjectId(userId) })
      .populate('participants', 'full_name avatar')
      .sort({ last_message_at: -1 })
      .exec();
  }
}
