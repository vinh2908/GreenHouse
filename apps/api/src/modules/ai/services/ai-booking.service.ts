import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { AiBookingAnalysis, AiPriceEstimate } from '@homemate/types';
import { PLATFORM_FEE_BY_SERVICE, SERVICE_SLUG_VI } from '@homemate/constants';

// ─── Price reference table (VND/giờ hoặc theo lần theo dịch vụ) ─────────────────────────────
const PRICE_REFERENCE: Record<string, { min: number; max: number; unit: string }> = {
  housekeeping_hourly: { min: 45000, max: 80000, unit: 'hour' },
  housekeeping_daily: { min: 350000, max: 600000, unit: 'day' },
  deep_cleaning: { min: 800000, max: 2500000, unit: 'job' },
  housekeeping_periodic: { min: 45000, max: 80000, unit: 'hour' },
  cooking: { min: 60000, max: 120000, unit: 'hour' },
  electrician: { min: 150000, max: 500000, unit: 'job' },
  plumbing: { min: 150000, max: 600000, unit: 'job' },
  ac_repair: { min: 180000, max: 550000, unit: 'job' },
  appliance: { min: 200000, max: 700000, unit: 'job' },
  locksmith: { min: 150000, max: 500000, unit: 'job' },
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

    const systemPrompt = `Bạn là trợ lý đặt lịch dịch vụ gia đình và sửa chữa HomeMate (Vua Thợ). Phân tích yêu cầu tự do của khách hàng và trả về JSON chuẩn xác.

Danh sách 8 dịch vụ cốt lõi của HomeMate:
1. housekeeping_hourly: Giúp việc theo giờ, dọn dẹp phòng, lau nhà, giặt ủi (45k - 80k/giờ)
2. deep_cleaning: Tổng vệ sinh nhà cửa, căn hộ, biệt thự, dọn nhà đón Tết (800k - 2.5tr/lần)
3. cooking: Nấu ăn gia đình, tiệc nhỏ, đi chợ (60k - 120k/giờ)
4. electrician: Sửa điện gia dụng, chập cháy điện, lắp đèn, ổ cắm, quạt (150k - 500k/lần)
5. plumbing: Sửa ống nước, rò rỉ bồn rửa/lavabo, thông cống nghẹt, thay vòi sen (150k - 600k/lần)
6. ac_repair: Vệ sinh máy lạnh, bơm gas, sửa máy lạnh chảy nước/không lạnh (180k - 550k/máy)
7. appliance: Sửa máy giặt, tủ lạnh, lò vi sóng, bếp từ (200k - 700k/lần)
8. locksmith: Sửa khóa cửa, thay ổ khóa, lắp đặt camera an ninh (150k - 500k/lần)

Quy tắc phân tích:
- Xác định đúng nhất 1 trong 8 service_type trên (Bắt buộc phải chọn 1 trong 8 slug trên, không được để null).
- service_name: Tên tiêu đề công việc ngắn gọn (tiếng Việt).
- estimated_duration_hours: Số giờ ước tính (từ 1 đến 8).
- num_workers: Số thợ phù hợp (1-3 người).
- tasks: Danh sách các đầu việc cụ thể cần thực hiện.
- price_min, price_max: Khoảng giá thị trường hợp lý (VND).
- confidence: Độ tự tin (0.5 - 1.0).
- notes: Ghi chú hữu ích hoặc lời khuyên cho gia chủ.

Trả về duy nhất JSON hợp lệ theo cấu trúc:
{
  "service_type": "plumbing" | "electrician" | "ac_repair" | "deep_cleaning" | "housekeeping_hourly" | "cooking" | "appliance" | "locksmith",
  "service_name": string,
  "estimated_duration_hours": number,
  "num_workers": number,
  "tasks": string[],
  "price_min": number,
  "price_max": number,
  "confidence": number,
  "notes": string
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

    const systemPrompt = `Bạn là chuyên gia định giá dịch vụ gia đình và sửa chữa HomeMate (Vua Thợ) tại Việt Nam.
Phân tích mô tả công việc và ước tính khoảng giá thị trường hợp lý.

Bảng giá tham khảo (VND):
- Giúp việc theo giờ: 45,000 - 80,000/giờ
- Tổng vệ sinh nhà cửa: 800,000 - 2,500,000/lần
- Nấu ăn gia đình: 60,000 - 120,000/giờ
- Sửa điện gia dụng: 150,000 - 500,000/lần
- Sửa ống nước, thông cống: 150,000 - 600,000/lần
- Vệ sinh & Sửa máy lạnh: 180,000 - 550,000/máy
- Sửa máy giặt, tủ lạnh: 200,000 - 700,000/lần
- Sửa khóa & Lắp camera: 150,000 - 500,000/lần

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
      const serviceName =
        serviceType && (SERVICE_SLUG_VI as Record<string, string>)[serviceType]
          ? (SERVICE_SLUG_VI as Record<string, string>)[serviceType]
          : 'Dịch vụ';
      const content = await this.aiConfig.chat(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Loại dịch vụ: ${serviceName}\nMô tả: ${description}`,
          },
        ],
        { jsonMode: true, temperature: 0.2 },
      );

      const parsed = JSON.parse(content) as AiPriceEstimate;
      if (parsed && typeof parsed.price_min === 'number') {
        return parsed;
      }
      throw new Error('Invalid JSON structure from AI');
    } catch (err) {
      this.logger.error('AI price estimation failed, falling back to rule-based table', err);
      const hours = 3;
      return {
        service_type: serviceType ?? 'housekeeping_hourly',
        price_min: ref.min * (ref.unit === 'hour' ? hours : 1),
        price_max: ref.max * (ref.unit === 'hour' ? hours : 1),
        estimated_duration_hours: hours,
        num_workers: 1,
        complexity: 'medium',
        reasoning: 'Ước tính theo bảng giá chuẩn HomeMate.',
        tasks: ['Kiểm tra hiện trạng', 'Thực hiện kỹ thuật', 'Nghiệm thu bàn giao'],
        confidence: 0.8,
      };
    }
  }
}
