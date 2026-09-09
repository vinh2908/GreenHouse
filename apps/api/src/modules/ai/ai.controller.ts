import {
  Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiBookingService } from './services/ai-booking.service';
import { AiMatchingService } from './services/ai-matching.service';
import { AiSupportService } from './services/ai-support.service';
import { AiConfigService } from './services/ai-config.service';
import {
  AnalyzeBookingDto,
  EstimatePriceDto,
  SupportChatDto,
} from './dto/ai.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AI_FEATURE_FLAGS } from '@homemate/constants';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    private readonly bookingService: AiBookingService,
    private readonly matchingService: AiMatchingService,
    private readonly supportService: AiSupportService,
    private readonly aiConfig: AiConfigService,
  ) {}

  // ─── Status: kiểm tra AI module ──────────────────────────────────────────

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Kiểm tra trạng thái AI module' })
  getStatus() {
    return {
      enabled: this.aiConfig.enabled,
      mode: this.aiConfig.enabled ? 'live' : 'mock',
      features: {
        booking_assistant: this.aiConfig.isFeatureEnabled('BOOKING_ASSISTANT'),
        price_estimator: this.aiConfig.isFeatureEnabled('PRICE_ESTIMATOR'),
        match_explanation: this.aiConfig.isFeatureEnabled('MATCH_EXPLANATION'),
        customer_support: this.aiConfig.isFeatureEnabled('CUSTOMER_SUPPORT'),
      },
    };
  }

  // ─── Booking Assistant ────────────────────────────────────────────────────

  @Post('booking/analyze')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[AI] Phân tích yêu cầu đặt lịch bằng ngôn ngữ tự nhiên',
    description:
      'Khách nhập mô tả tự do → AI phân tích → trả về service type, thời gian, số người, ước giá',
  })
  async analyzeBooking(
    @Body() dto: AnalyzeBookingDto,
    @CurrentUser() _user: { sub: string },
  ) {
    return this.bookingService.analyzeBookingRequest(dto.text);
  }

  // ─── Price Estimator ──────────────────────────────────────────────────────

  @Post('price/estimate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[AI] Ước tính giá dịch vụ từ mô tả công việc',
    description:
      'Khách mô tả công việc → AI ước tính giá min/max, thời gian, độ phức tạp',
  })
  async estimatePrice(@Body() dto: EstimatePriceDto) {
    return this.bookingService.estimatePrice(dto.description, dto.service_type);
  }

  // ─── Customer Support ─────────────────────────────────────────────────────

  @Post('support/chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[AI] Chat hỗ trợ khách hàng',
    description:
      'Khách hỏi câu hỏi tự nhiên → AI trả lời về dịch vụ, giá cả, quy trình, vấn đề phổ biến',
  })
  async supportChat(@Body() dto: SupportChatDto) {
    // Try FAQ first (free, instant)
    const faqAnswer = this.supportService.getFaqAnswer(dto.message);
    if (faqAnswer) {
      return {
        answer: faqAnswer,
        intent: 'faq',
        source: 'faq',
        confidence: 1,
      };
    }

    const response = await this.supportService.chat(
      dto.history?.map(h => ({ role: h.role, content: h.content })) ?? [],
      dto.message,
    );
    return { ...response, source: 'ai' };
  }
}
