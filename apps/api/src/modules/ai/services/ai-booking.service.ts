import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { AiBookingAnalysis, AiPriceEstimate } from '@homemate/types';
import { PLATFORM_FEE_BY_SERVICE, SERVICE_SLUG_VI } from '@homemate/constants';

// ─── Price reference table (VND/giờ theo dịch vụ) ─────────────────────────────
const PRICE_REFERENCE: Record<string, { min: number; max: number; unit: string }> = {
  housekeeping_hourly: { min: 45000, max: 80000, unit: 'hour' },
  housekeeping_daily: { min: 350000, max: 600000, unit: 'day' },
  deep_cleaning: { min: 800000, max: 2500000, unit: 'job' },
  housekeeping_periodic: { min: 45000, max: 80000, unit: 'hour' },
  cooking: { min: 60000, max: 120000, unit: 'hour' },
};

@Injectable()
export class AiBookingService {
  private readonly logger = new Logger(AiBookingService.name);

  constructor(private readonly aiConfig: AiConfigService) {}

  // ─── Mock: phân tích text khi không có API key ─────────────────────────────

  private mockAnalyze(text: string): AiBookingAnalysis {
    const lower = text.toLowerCase();

    let service_type = 'housekeeping_hourly';
    let service_name = 'Giúp việc theo giờ';

    if (
      lower.includes('tổng vệ sinh') ||
      lower.includes('tong ve sinh') ||
      lower.includes('dọn tổng')
    ) {
      service_type = 'deep_cleaning';
      service_name = 'Tổng vệ sinh nhà';
    } else if (lower.includes('nấu ăn') || lower.includes('nau an') || lower.includes('nấu cơm')) {
      service_type = 'cooking';
      service_name = 'Nấu ăn gia đình';
    } else if (lower.includes('theo ngày') || lower.includes('cả ngày')) {
      service_type = 'housekeeping_daily';
      service_name = 'Giúp việc theo ngày';
    } else if (
      lower.includes('định kỳ') ||
      lower.includes('hàng tuần') ||
      lower.includes('hàng tháng')
    ) {
      service_type = 'housekeeping_periodic';
      service_name = 'Giúp việc định kỳ';
    }

    const ref = PRICE_REFERENCE[service_type] ?? PRICE_REFERENCE['housekeeping_hourly'];

    // Đoán số giờ từ text
    let hours = 3;
    const hourMatch = lower.match(/(\d+)\s*(tiếng|giờ|tieng|gio)/);
    if (hourMatch) hours = parseInt(hourMatch[1], 10);

    return {
      service_type,
      service_name,
      estimated_duration_hours: hours,
      num_workers: 1,
      tasks: ['Dọn phòng', 'Lau sàn', 'Vệ sinh bếp'],
      price_min: ref.min * (ref.unit === 'hour' ? hours : 1),
      price_max: ref.max * (ref.unit === 'hour' ? hours : 1),
      confidence: 0.6,
      raw_input: text,
    };
  }

  // ─── Phân tích yêu cầu tự nhiên ngữ của khách hàng ───────────────────────

  async analyzeBookingRequest(text: string): Promise<AiBookingAnalysis> {
    if (!this.aiConfig.isFeatureEnabled('BOOKING_ASSISTANT')) {
      this.logger.debug('Booking assistant disabled — returning mock');
      return this.mockAnalyze(text);
    }

    const systemPrompt = `Bạn là trợ lý đặt lịch giúp việc nhà HomeMate. Phân tích yêu cầu của khách và trả về JSON.

Các loại dịch vụ:
- housekeeping_hourly: Giúp việc theo giờ (45k-80k/giờ)
- housekeeping_daily: Giúp việc theo ngày (350k-600k/ngày)
- deep_cleaning: Tổng vệ sinh nhà (800k-2.5tr/lần)
- housekeeping_periodic: Giúp việc định kỳ (hàng tuần/tháng)
- cooking: Nấu ăn gia đình (60k-120k/giờ)

Trả về JSON với các field:
{
  "service_type": string,
  "service_name": string (tiếng Việt),
  "estimated_duration_hours": number,
  "num_workers": number,
  "tasks": string[] (danh sách việc cần làm),
  "price_min": number (VND),
  "price_max": number (VND),
  "confidence": number (0-1),
  "notes": string (gợi ý thêm nếu cần)
}`;

    try {
      const content = await this.aiConfig.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        { jsonMode: true, temperature: 0.2 },
      );

      const parsed = JSON.parse(content) as Omit<AiBookingAnalysis, 'raw_input'>;
      return { ...parsed, raw_input: text };
    } catch (err) {
      this.logger.error('AI booking analysis failed, falling back to mock', err);
      return this.mockAnalyze(text);
    }
  }

  // ─── Ước tính giá từ mô tả công việc ─────────────────────────────────────

  async estimatePrice(description: string, serviceType?: string): Promise<AiPriceEstimate> {
    const ref = serviceType ? PRICE_REFERENCE[serviceType] : PRICE_REFERENCE['housekeeping_hourly'];

    if (!this.aiConfig.isFeatureEnabled('PRICE_ESTIMATOR')) {
      // Mock estimate
      const hours = 3;
      return {
        service_type: serviceType ?? 'housekeeping_hourly',
        price_min: ref.min * (ref.unit === 'hour' ? hours : 1),
        price_max: ref.max * (ref.unit === 'hour' ? hours : 1),
        estimated_duration_hours: hours,
        num_workers: 1,
        complexity: 'medium',
        reasoning: 'Ước tính dựa trên bảng giá chuẩn. Giá thực tế do helper báo giá cụ thể.',
        tasks: ['Dọn phòng khách', 'Lau sàn', 'Vệ sinh bếp'],
        confidence: 0.5,
      };
    }

    const systemPrompt = `Bạn là chuyên gia định giá dịch vụ giúp việc nhà tại Việt Nam.
Phân tích mô tả và ước tính giá dịch vụ theo bảng giá chuẩn.

Bảng giá tham khảo (VND):
- Giúp việc theo giờ: 45,000 - 80,000/giờ
- Giúp việc theo ngày: 350,000 - 600,000/ngày
- Tổng vệ sinh: 800,000 - 2,500,000/lần
- Nấu ăn: 60,000 - 120,000/giờ

Trả về JSON:
{
  "service_type": string,
  "price_min": number,
  "price_max": number,
  "estimated_duration_hours": number,
  "num_workers": number,
  "complexity": "easy" | "medium" | "hard",
  "reasoning": string (giải thích ngắn gọn tiếng Việt),
  "tasks": string[],
  "confidence": number (0-1)
}`;

    try {
      const content = await this.aiConfig.chat(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Loại dịch vụ: ${SERVICE_SLUG_VI[serviceType ?? ''] ?? 'Giúp việc'}\nMô tả: ${description}`,
          },
        ],
        { jsonMode: true, temperature: 0.2 },
      );

      return JSON.parse(content) as AiPriceEstimate;
    } catch (err) {
      this.logger.error('AI price estimation failed', err);
      const hours = 3;
      return {
        service_type: serviceType ?? 'housekeeping_hourly',
        price_min: ref.min * (ref.unit === 'hour' ? hours : 1),
        price_max: ref.max * (ref.unit === 'hour' ? hours : 1),
        estimated_duration_hours: hours,
        num_workers: 1,
        complexity: 'medium',
        reasoning: 'Ước tính theo bảng giá chuẩn.',
        confidence: 0.4,
      };
    }
  }
}
