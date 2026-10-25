import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService, AiProviderUnavailableError } from './ai-config.service';
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

/** Kết quả phân tích ảnh sự cố (Feature 17). available=false khi AI không dùng được. */
export interface IssuePhotoAnalysis {
  available: boolean;
  detected_issue?: string;
  suggested_service_slug?: string | null;
  description_draft?: string;
  price_min?: number;
  price_max?: number;
  confidence?: number;
}

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

    const systemPrompt = `Bạn là trợ lý đặt lịch dịch vụ gia đình và sửa chữa Green House. Phân tích yêu cầu tự do của khách hàng và trả về JSON chuẩn xác.

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

    const systemPrompt = `Bạn là chuyên gia định giá dịch vụ gia đình và sửa chữa Green House tại Việt Nam.
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
  // ─── Phân tích ảnh sự cố bằng AI Vision (Roadmap Phase 2 — Feature 17) ────
  // Khách chụp ảnh sự cố (vòi nước rò, máy lạnh chảy nước...) → AI nhận diện
  // vấn đề, gợi ý dịch vụ + bản nháp mô tả + khoảng giá. AI không khả dụng
  // (mock mode / lỗi provider / JSON hỏng) → { available: false }, KHÔNG ném
  // lỗi ra client: app vẫn đính kèm ảnh vào đơn và để khách tự mô tả.

  async analyzeIssuePhoto(imageBase64: string, mimeType: string): Promise<IssuePhotoAnalysis> {
    const knownSlugs = Object.keys(SERVICE_SLUG_VI);
    const slugList = knownSlugs
      .map(slug => {
        const ref = PRICE_REFERENCE[slug];
        const price = ref
          ? ` (${ref.min.toLocaleString('vi-VN')}–${ref.max.toLocaleString('vi-VN')}₫/${ref.unit === 'hour' ? 'giờ' : ref.unit === 'day' ? 'ngày' : 'lần'})`
          : '';
        return `- ${slug}: ${(SERVICE_SLUG_VI as Record<string, string>)[slug]}${price}`;
      })
      .join('\n');

    const systemPrompt = `Bạn là kỹ thuật viên của nền tảng dịch vụ gia đình Green House (HomeMate) tại Việt Nam. Khách hàng gửi 1 ảnh chụp sự cố trong nhà. Hãy nhìn ảnh, nhận diện vấn đề và trả về DUY NHẤT 1 JSON hợp lệ (không markdown, không giải thích thêm) theo cấu trúc:
{
  "detected_issue": string,            // Vấn đề phát hiện trong ảnh, tiếng Việt, ngắn gọn (VD: "Vòi sen bị rò rỉ nước ở khớp nối")
  "suggested_service_slug": string,    // BẮT BUỘC là 1 trong các slug ở danh sách dưới đây, chọn slug phù hợp nhất
  "description_draft": string,         // Bản nháp mô tả tiếng Việt viết ở ngôi khách hàng mô tả sự cố (2-4 câu, có chi tiết thấy trong ảnh) để khách dùng làm mô tả đơn
  "price_min": number,                 // Khoảng giá sửa chữa hợp lý tại VN (VND), bám bảng giá tham khảo
  "price_max": number,
  "confidence": number                 // Độ tin cậy nhận diện 0..1
}

Danh sách dịch vụ hợp lệ (suggested_service_slug CHỈ được là 1 slug trong danh sách này):
${slugList}

Nếu ảnh không liên quan sự cố gia đình / không nhận diện được: vẫn trả JSON với detected_issue mô tả trung thực những gì thấy, confidence thấp (< 0.4) và suggested_service_slug là slug gần nhất.`;

    try {
      const content = await this.aiConfig.chatWithImage(
        systemPrompt,
        'Hãy phân tích ảnh sự cố này và trả về JSON theo đúng cấu trúc đã yêu cầu.',
        imageBase64,
        mimeType,
      );

      // Parse bền vững: bỏ ``` fences, lấy từ { đầu tiên tới } cuối cùng.
      const cleaned = content.replace(/```(?:json)?/gi, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('AI vision returned no JSON object');
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

      const rawSlug =
        typeof parsed.suggested_service_slug === 'string' ? parsed.suggested_service_slug : null;
      const slug = rawSlug && knownSlugs.includes(rawSlug) ? rawSlug : null;

      const priceMin =
        typeof parsed.price_min === 'number' && parsed.price_min > 0
          ? Math.round(parsed.price_min)
          : undefined;
      const priceMax =
        typeof parsed.price_max === 'number' && parsed.price_max > 0
          ? Math.round(parsed.price_max)
          : undefined;
      const confidenceRaw = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

      return {
        available: true,
        detected_issue:
          typeof parsed.detected_issue === 'string' && parsed.detected_issue.trim()
            ? parsed.detected_issue.trim()
            : 'Chưa nhận diện rõ vấn đề trong ảnh',
        suggested_service_slug: slug,
        description_draft:
          typeof parsed.description_draft === 'string' ? parsed.description_draft.trim() : '',
        price_min: priceMin,
        price_max: priceMax && priceMin && priceMax < priceMin ? priceMin : priceMax,
        confidence: Math.min(1, Math.max(0, confidenceRaw)),
      };
    } catch (err) {
      if (err instanceof AiProviderUnavailableError) {
        this.logger.warn(`Issue photo analysis unavailable: ${err.message}`);
      } else {
        this.logger.error('Issue photo analysis failed', err as Error);
      }
      return { available: false };
    }
  }
}
