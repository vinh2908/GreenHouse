import { validate } from 'class-validator';
import {
  AnalyzeBookingDto,
  EstimatePriceDto,
  SupportChatDto,
  AiChatMessageDto,
  RankHelpersDto,
} from './dto/ai.dto';
import { AiBookingService } from './services/ai-booking.service';
import { AiSupportService } from './services/ai-support.service';

/** Spec B69: endpoint AI giới hạn văn bản đầu vào ≤ 2000 ký tự. */
describe('AI DTOs (B69)', () => {
  const long = 'x'.repeat(2001);
  const ok = 'x'.repeat(2000);

  it('AnalyzeBookingDto.text 2001 ký tự → lỗi maxLength; 2000 → hợp lệ', async () => {
    const dto = new AnalyzeBookingDto();
    dto.text = long;
    const errors = await validate(dto);
    expect(errors.some(e => e.constraints?.maxLength)).toBe(true);

    const dtoOk = new AnalyzeBookingDto();
    dtoOk.text = ok;
    expect(await validate(dtoOk)).toHaveLength(0);
  });

  it('EstimatePriceDto.description 2001 ký tự → lỗi maxLength', async () => {
    const dto = new EstimatePriceDto();
    dto.description = long;
    const errors = await validate(dto);
    expect(errors.some(e => e.constraints?.maxLength)).toBe(true);
  });

  it('SupportChatDto.message + history[].content 2001 ký tự → lỗi maxLength', async () => {
    const dto = new SupportChatDto();
    dto.message = long;
    const errors = await validate(dto);
    expect(errors.some(e => e.constraints?.maxLength)).toBe(true);

    const msg = new AiChatMessageDto();
    msg.role = 'user';
    msg.content = long;
    expect((await validate(msg)).some(e => e.constraints?.maxLength)).toBe(true);
  });

  it('RankHelpersDto.job_description 2001 ký tự → lỗi maxLength', async () => {
    const dto = new RankHelpersDto();
    dto.helper_ids = ['660f9e1234567890abcdef12'];
    dto.job_description = long;
    const errors = await validate(dto);
    expect(errors.some(e => e.constraints?.maxLength)).toBe(true);
  });
});

describe('AI services (B69)', () => {
  const long = 'x'.repeat(2001);
  const aiConfig = {
    isFeatureEnabled: jest.fn(() => false),
    enabled: false,
  } as never;

  it('analyzeBookingRequest > 2000 ký tự → 400', async () => {
    const service = new AiBookingService(aiConfig);
    await expect(service.analyzeBookingRequest(long)).rejects.toThrow(
      'Văn bản đầu vào tối đa 2000 ký tự',
    );
  });

  it('analyzeBookingRequest ≤ 2000 ký tự → chạy bình thường (mock khi tắt AI)', async () => {
    const service = new AiBookingService(aiConfig);
    const result = await service.analyzeBookingRequest('Tôi cần dọn nhà 2 phòng ngủ');
    expect(result).toBeDefined();
  });

  it('estimatePrice mô tả > 2000 ký tự → 400', async () => {
    const service = new AiBookingService(aiConfig);
    await expect(service.estimatePrice(long)).rejects.toThrow('Mô tả công việc tối đa 2000 ký tự');
  });

  it('support chat: tin nhắn > 2000 ký tự → 400', async () => {
    const service = new AiSupportService(aiConfig);
    await expect(service.chat([], long)).rejects.toThrow('Tin nhắn tối đa 2000 ký tự');
  });

  it('support chat: lịch sử có tin > 2000 ký tự → 400', async () => {
    const service = new AiSupportService(aiConfig);
    await expect(
      service.chat([{ role: 'user', content: long } as never], 'Chào bạn'),
    ).rejects.toThrow('Tin nhắn trong lịch sử tối đa 2000 ký tự');
  });

  it('support chat: tin nhắn ngắn → chạy bình thường (FAQ khi tắt AI, có cờ is_mock)', async () => {
    const service = new AiSupportService(aiConfig);
    const result = await service.chat([], 'Cho tôi hỏi về giá dịch vụ');
    expect(result.answer).toBeDefined();
    expect(result.is_mock).toBe(true);
    expect(result.mock).toBe(true);
  });
});
