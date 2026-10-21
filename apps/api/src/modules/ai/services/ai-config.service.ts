import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import OpenAI from 'openai';
import { AI_CONFIG, AI_FEATURE_FLAGS } from '@homemate/constants';

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Lỗi chuyên biệt: không có AI provider nào dùng được cho vision (mock mode
 * hoặc mọi lời gọi đều thất bại). Tầng service phía trên bắt lỗi này để trả
 * { available: false } cho client thay vì ném 500.
 */
export class AiProviderUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private isGeminiEnabled = false;
  private isOpenAiEnabled = false;
  private activeProvider: 'gemini' | 'openai' | 'mock' = 'mock';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const geminiKey = this.configService.get<string>('ai.geminiApiKey');
    const openaiKey = this.configService.get<string>('ai.openaiApiKey');

    // 1. Khởi tạo Gemini
    if (geminiKey && geminiKey !== 'your_gemini_api_key_here' && geminiKey.trim().length > 10) {
      try {
        this.geminiClient = new GoogleGenerativeAI(geminiKey.trim());
        this.isGeminiEnabled = true;
        this.activeProvider = 'gemini';
        this.logger.log(
          `🤖 AI Module: Google Gemini (${this.configService.get('ai.geminiModel') || 'gemini-2.5-flash'}) initialized successfully!`,
        );
      } catch (err) {
        this.logger.error('Failed to initialize Google Gemini client', err);
      }
    }

    // 2. Khởi tạo OpenAI (Fallback)
    if (openaiKey && openaiKey !== 'sk-placeholder' && openaiKey.trim().length > 10) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiKey.trim() });
        this.isOpenAiEnabled = true;
        if (!this.isGeminiEnabled) {
          this.activeProvider = 'openai';
          this.logger.log('🤖 AI Module: OpenAI (gpt-4o-mini) initialized as primary provider.');
        }
      } catch (err) {
        this.logger.error('Failed to initialize OpenAI client', err);
      }
    }

    if (!this.isGeminiEnabled && !this.isOpenAiEnabled) {
      this.activeProvider = 'mock';
      this.logger.warn(
        '⚠️ AI Module: No valid GEMINI_API_KEY or OPENAI_API_KEY found. Running in SMART MOCK MODE (Zero-crash deterministic engine).',
      );
    }
  }

  get provider(): 'gemini' | 'openai' | 'mock' {
    return this.activeProvider;
  }

  get enabled(): boolean {
    return this.isGeminiEnabled || this.isOpenAiEnabled;
  }

  isFeatureEnabled(feature: keyof typeof AI_FEATURE_FLAGS): boolean {
    return AI_FEATURE_FLAGS[feature] ?? true;
  }

  /**
   * Gọi AI Chat Completion (Ưu tiên Google Gemini -> OpenAI -> Fallback)
   */
  async chat(
    messages: ChatMessageParam[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      jsonMode?: boolean;
    } = {},
  ): Promise<string> {
    // ── 1. GỌI GOOGLE GEMINI NẾU CÓ KEY ──────────────────────────────────────
    if (this.isGeminiEnabled && this.geminiClient) {
      try {
        const modelName =
          options.model || this.configService.get<string>('ai.geminiModel') || 'gemini-2.5-flash';

        // Tách system prompt và user prompt
        const systemMsg = messages.find(m => m.role === 'system');
        const userAndAssistantMsgs = messages.filter(m => m.role !== 'system');

        const model = this.geminiClient.getGenerativeModel({
          model: modelName,
          systemInstruction: systemMsg ? systemMsg.content : undefined,
          generationConfig: {
            temperature: options.temperature ?? (options.jsonMode ? 0.2 : 0.7),
            maxOutputTokens: options.maxTokens ?? 1000,
            responseMimeType: options.jsonMode ? 'application/json' : 'text/plain',
          },
        });

        // Format history cho Gemini
        if (userAndAssistantMsgs.length === 1 && userAndAssistantMsgs[0].role === 'user') {
          const result = await model.generateContent(userAndAssistantMsgs[0].content);
          return result.response.text();
        }

        // Chat session nếu có nhiều tin nhắn
        const contents = userAndAssistantMsgs.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const result = await model.generateContent({ contents });
        return result.response.text();
      } catch (err: any) {
        this.logger.error('Google Gemini call failed, trying fallback...', err?.message || err);
      }
    }

    // ── 2. GỌI OPENAI NẾU CÓ KEY ─────────────────────────────────────────────
    if (this.isOpenAiEnabled && this.openaiClient) {
      try {
        const response = await this.openaiClient.chat.completions.create({
          model: options.model || this.configService.get<string>('ai.openaiModel') || 'gpt-4o-mini',
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          max_tokens: options.maxTokens ?? 1000,
          temperature: options.temperature ?? (options.jsonMode ? 0.2 : 0.7),
          response_format: options.jsonMode ? { type: 'json_object' } : { type: 'text' },
        });

        return response.choices[0]?.message?.content ?? '';
      } catch (err: any) {
        this.logger.error('OpenAI call failed', err?.message || err);
      }
    }

    throw new Error('No AI provider available or all API calls failed');
  }

  /**
   * Gọi AI Vision (ảnh + text) — Gemini ưu tiên, OpenAI fallback.
   * Mock mode hoặc mọi provider đều lỗi → ném AiProviderUnavailableError.
   */
  async chatWithImage(
    systemPrompt: string,
    userText: string,
    imageBase64: string,
    mimeType: string,
  ): Promise<string> {
    if (this.activeProvider === 'mock') {
      throw new AiProviderUnavailableError('AI is running in mock mode (no API key configured)');
    }
    const visionModel = this.configService.get<string>('ai.visionModel') || 'gemini-2.5-flash';

    // ── 1. Google Gemini Vision ─────────────────────────────────────────────
    if (this.isGeminiEnabled && this.geminiClient) {
      try {
        const model = this.geminiClient.getGenerativeModel({
          model: visionModel,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json',
          },
        });
        const result = await model.generateContent([
          { text: `${systemPrompt}\n\n${userText}` },
          { inlineData: { data: imageBase64, mimeType } },
        ]);
        return result.response.text();
      } catch (err: any) {
        this.logger.error('Gemini vision call failed, trying fallback...', err?.message || err);
      }
    }

    // ── 2. OpenAI Vision (fallback) ─────────────────────────────────────────
    if (this.isOpenAiEnabled && this.openaiClient) {
      try {
        // AI_VISION_MODEL có thể đang trỏ tới model Gemini → chỉ dùng cho
        // OpenAI khi tên model không phải của Gemini, mặc định gpt-4o-mini.
        const openAiVisionModel = visionModel.startsWith('gemini') ? 'gpt-4o-mini' : visionModel;
        const response = await this.openaiClient.chat.completions.create({
          model: openAiVisionModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `${systemPrompt}\n\n${userText}` },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                },
              ],
            },
          ],
          max_tokens: 1000,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });
        return response.choices[0]?.message?.content ?? '';
      } catch (err: any) {
        this.logger.error('OpenAI vision call failed', err?.message || err);
      }
    }

    throw new AiProviderUnavailableError('All vision providers failed or are unavailable');
  }
}
