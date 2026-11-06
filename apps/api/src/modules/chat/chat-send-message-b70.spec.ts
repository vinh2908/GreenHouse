import { Types } from 'mongoose';
import { ChatService } from './chat.service';

/** Spec B70: chat kiểm tra message.length ≤ 2000 và type thuộc (text, image, location). */
describe('ChatService.sendMessage (B70)', () => {
  const conversationId = new Types.ObjectId();
  const senderId = new Types.ObjectId();

  function makeService() {
    const messageId = new Types.ObjectId();
    const conversationModel: any = {
      findById: jest.fn(() => ({
        exec: async () => ({ _id: conversationId, participants: [senderId] }),
      })),
      findByIdAndUpdate: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const messageModel: any = {
      create: jest.fn(async (doc: any) => ({ ...doc, _id: messageId })),
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ exec: async () => ({ _id: messageId }) })),
      })),
    };
    const service = new ChatService(
      conversationModel,
      messageModel,
      {} as never,
      { emitToConversation: jest.fn() } as never,
      { create: jest.fn(async () => ({})) } as never,
    );
    return { service, messageModel };
  }

  it('tin nhắn 2001 ký tự → 400', async () => {
    const { service } = makeService();
    await expect(
      service.sendMessage(String(conversationId), String(senderId), 'x'.repeat(2001)),
    ).rejects.toThrow('Tin nhắn tối đa 2000 ký tự');
  });

  it('type = "video" → 400', async () => {
    const { service } = makeService();
    await expect(
      service.sendMessage(String(conversationId), String(senderId), 'Chào bạn', 'video'),
    ).rejects.toThrow('Loại tin nhắn không hợp lệ');
  });

  it('type = "audio" → 400', async () => {
    const { service } = makeService();
    await expect(
      service.sendMessage(String(conversationId), String(senderId), 'Chào bạn', 'audio'),
    ).rejects.toThrow('Loại tin nhắn không hợp lệ');
  });

  it.each(['text', 'image', 'location'])(
    'type = "%s" + nội dung 2000 ký tự → gửi thành công',
    async type => {
      const { service, messageModel } = makeService();
      const result = await service.sendMessage(
        String(conversationId),
        String(senderId),
        'x'.repeat(2000),
        type,
      );
      expect(result).toBeDefined();
      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type, content: 'x'.repeat(2000) }),
      );
    },
  );
});
