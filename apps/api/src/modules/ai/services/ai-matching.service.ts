import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { AiMatchExplanation } from '@homemate/types';

interface HelperData {
  _id: string;
  user?: { full_name?: string };
  average_rating?: number;
  total_completed?: number;
  distance_km?: number;
  verification_status?: string;
  service_ids?: string[];
}

@Injectable()
export class AiMatchingService {
  private readonly logger = new Logger(AiMatchingService.name);

  constructor(private readonly aiConfig: AiConfigService) {}

  // ─── Compute weighted score (deterministic, no AI needed) ─────────────────

  computeMatchScore(helper: HelperData, jobServiceId?: string): number {
    const rating = helper.average_rating ?? 3;
    const completed = helper.total_completed ?? 0;
    const distance = helper.distance_km ?? 10;
    const isVerified = helper.verification_status === 'approved' ? 1 : 0;
    const hasService =
      !jobServiceId || (helper.service_ids ?? []).some(id => id.toString() === jobServiceId)
        ? 1
        : 0;

    // Normalize
    const ratingScore = (rating - 1) / 4; // 1-5 → 0-1
    const completedScore = Math.min(completed / 50, 1); // 0-50 jobs → 0-1
    const distanceScore = Math.max(0, 1 - distance / 30); // 0-30km → 1-0

    return (
      distanceScore * 0.3 +
      ratingScore * 0.3 +
      completedScore * 0.2 +
      isVerified * 0.1 +
      hasService * 0.1
    );
  }

  // ─── Generate human-readable explanation ──────────────────────────────────

  async explainMatch(
    helper: HelperData,
    score: number,
    jobDescription?: string,
  ): Promise<AiMatchExplanation> {
    const reasons: string[] = [];
    const strengths: string[] = [];
    const concerns: string[] = [];

    const distance = helper.distance_km ?? 10;
    const rating = helper.average_rating ?? 0;
    const completed = helper.total_completed ?? 0;

    // Deterministic reasons (no AI needed)
    if (distance <= 2) reasons.push(`Rất gần: ${distance.toFixed(1)}km`);
    else if (distance <= 5) reasons.push(`Gần: ${distance.toFixed(1)}km`);
    else reasons.push(`Khoảng cách: ${distance.toFixed(1)}km`);

    if (rating >= 4.5) {
      reasons.push(`Đánh giá xuất sắc: ★${rating.toFixed(1)}`);
      strengths.push('Khách hàng đánh giá rất cao');
    } else if (rating >= 4.0) {
      reasons.push(`Đánh giá tốt: ★${rating.toFixed(1)}`);
      strengths.push('Chất lượng dịch vụ tốt');
    } else if (rating < 3.5 && rating > 0) {
      concerns.push(`Đánh giá trung bình: ★${rating.toFixed(1)}`);
    }

    if (completed >= 50) {
      strengths.push(`Nhiều kinh nghiệm: ${completed} jobs hoàn thành`);
    } else if (completed >= 10) {
      reasons.push(`${completed} jobs hoàn thành`);
    } else if (completed < 5) {
      concerns.push('Ít kinh nghiệm (helper mới)');
    }

    if (helper.verification_status === 'approved') {
      strengths.push('Đã xác minh danh tính (KYC)');
    }

    // Optional: AI-enhanced explanation
    if (this.aiConfig.isFeatureEnabled('MATCH_EXPLANATION') && jobDescription) {
      try {
        const aiReason = await this.aiConfig.chat(
          [
            {
              role: 'system',
              content:
                'Bạn là trợ lý gợi ý người giúp việc. Giải thích ngắn gọn (1 câu tiếng Việt) tại sao helper này phù hợp với yêu cầu của khách. Chỉ trả về 1 câu văn, không JSON.',
            },
            {
              role: 'user',
              content: `Yêu cầu: ${jobDescription}\nHelper: rating ${rating}, ${completed} jobs, cách ${distance}km`,
            },
          ],
          { maxTokens: 100, temperature: 0.7 },
        );
        if (aiReason.trim()) reasons.push(aiReason.trim());
      } catch {
        // Ignore AI error — use deterministic reasons only
      }
    }

    return {
      helper_id: String(helper._id),
      score: Math.round(score * 100) / 100,
      reasons,
      strengths,
      concerns: concerns.length ? concerns : undefined,
    };
  }

  // ─── Rank and explain multiple helpers ────────────────────────────────────

  async rankAndExplain(
    helpers: HelperData[],
    jobServiceId?: string,
    jobDescription?: string,
  ): Promise<AiMatchExplanation[]> {
    const scored = helpers.map(h => ({
      helper: h,
      score: this.computeMatchScore(h, jobServiceId),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Only explain top 5 to limit API calls
    const top5 = scored.slice(0, 5);
    const explanations = await Promise.all(
      top5.map(({ helper, score }) => this.explainMatch(helper, score, jobDescription)),
    );

    return explanations;
  }
}
