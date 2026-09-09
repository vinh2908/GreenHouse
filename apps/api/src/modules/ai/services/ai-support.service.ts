import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { AiChatMessage, AiSupportResponse } from '@homemate/types';

const SYSTEM_PROMPT = `Bạn là trợ lý chăm sóc khách hàng của HomeMate — nền tảng kết nối người giúp việc tại Việt Nam.

Bạn có thể giúp khách hàng:
- Giải đáp thắc mắc về dịch vụ (giúp việc theo giờ, theo ngày, tổng vệ sinh, nấu ăn)
- Hướng dẫn cách đặt lịch, chọn helper, thanh toán
- Giải quyết vấn đề phổ biến (hủy đơn, khiếu nại, hoàn tiền)
- Thông tin về giá cả và quy trình

Quy tắc:
- Trả lời ngắn gọn, thân thiện, bằng tiếng Việt
- Không hứa hẹn điều mà bạn không chắc
- Nếu cần xử lý gấp hoặc khiếu nại nghiêm trọng, đề nghị liên hệ hotline: 1900-xxxx
- Tối đa 3-4 câu mỗi lần trả lời`;

@Injectable()
export class AiSupportService {
  private readonly logger = new Logger(AiSupportService.name);

  constructor(private readonly aiConfig: AiConfigService) {}

  async chat(messages: AiChatMessage[], userMessage: string): Promise<AiSupportResponse> {
    if (!this.aiConfig.isFeatureEnabled('CUSTOMER_SUPPORT')) {
      return {
        answer:
          'Tính năng hỗ trợ AI hiện chưa khả dụng. Vui lòng liên hệ hotline 1900-xxxx để được hỗ trợ.',
        intent: 'general',
        suggested_actions: ['Gọi hotline', 'Gửi email hỗ trợ'],
        confidence: 1,
      };
    }

    // Convert history to OpenAI format
    const history = messages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    try {
      const answer = await this.aiConfig.chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: userMessage },
        ],
        { maxTokens: 300, temperature: 0.7 },
      );

      // Simple intent detection from answer
      const lower = answer.toLowerCase();
      let intent = 'general';
      if (lower.includes('hủy') || lower.includes('cancel')) intent = 'cancel_booking';
      else if (lower.includes('hoàn tiền') || lower.includes('refund')) intent = 'refund';
      else if (lower.includes('đặt lịch') || lower.includes('book')) intent = 'booking';
      else if (lower.includes('thanh toán') || lower.includes('payment')) intent = 'payment';
      else if (lower.includes('khiếu nại') || lower.includes('complaint')) intent = 'complaint';

      return {
        answer,
        intent,
        confidence: 0.9,
      };
    } catch (err) {
      this.logger.error('AI support chat failed', err);
      return {
        answer:
          'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau hoặc liên hệ hotline 1900-xxxx.',
        intent: 'error',
        confidence: 0,
      };
    }
  }

  // ─── Quick FAQ answers (no AI, deterministic) ──────────────────────────────

  getFaqAnswer(question: string): string | null {
    const lower = question.toLowerCase();

    if (lower.includes('giá') || lower.includes('bao nhiêu') || lower.includes('phí')) {
      return 'Giá dịch vụ tùy thuộc loại và thời gian: Giúp việc theo giờ 45k-80k/giờ, theo ngày 350k-600k/ngày, tổng vệ sinh 800k-2.5tr/lần, nấu ăn 60k-120k/giờ. Giá cuối do helper báo giá cụ thể.';
    }
    if (lower.includes('hủy') && lower.includes('đơn')) {
      return 'Bạn có thể hủy đơn trước khi helper xác nhận mà không mất phí. Sau khi helper xác nhận, việc hủy sẽ tùy thuộc vào chính sách hủy của từng gói dịch vụ.';
    }
    if (lower.includes('thanh toán') || lower.includes('trả tiền')) {
      return 'HomeMate hỗ trợ thanh toán qua ví điện tử (MoMo, ZaloPay), thẻ ngân hàng và tiền mặt. Tiền được giữ an toàn và chuyển cho helper sau khi bạn nghiệm thu hoàn thành.';
    }
    if (lower.includes('helper') && (lower.includes('xác minh') || lower.includes('an toàn'))) {
      return 'Tất cả helper đều phải trải qua xác minh danh tính (KYC) bằng CCCD trước khi nhận việc. HomeMate đảm bảo an toàn cho cả khách hàng và helper.';
    }

    return null; // No FAQ match — use AI
  }
}
