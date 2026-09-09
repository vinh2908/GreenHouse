import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AI_CONFIG, AI_FEATURE_FLAGS } from '@homemate/constants';

@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);
  private client: OpenAI | null = null;
  private isEnabled = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('ai.openaiApiKey');
    if (!apiKey || apiKey === 'sk-placeholder') {
      this.logger.warn('AI module: OPENAI_API_KEY not set — AI features will run in MOCK mode.');
      this.isEnabled = false;
      return;
    }
    this.client = new OpenAI({ apiKey });
    this.isEnabled = true;
    this.logger.log('AI module: OpenAI client initialized.');
  }

  get openai(): OpenAI | null {
    return this.client;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  isFeatureEnabled(feature: keyof typeof AI_FEATURE_FLAGS): boolean {
    return this.isEnabled && AI_FEATURE_FLAGS[feature];
  }

  // ─── Helper: call chat completion with error handling ──────────────────────

  async chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      jsonMode?: boolean;
    } = {},
  ): Promise<string> {
    if (!this.client) {
      throw new Error('AI client not initialized');
    }

    const response = await this.client.chat.completions.create({
      model: options.model ?? AI_CONFIG.MODEL,
      messages,
      max_tokens: options.maxTokens ?? AI_CONFIG.MAX_TOKENS,
      temperature: options.temperature ?? AI_CONFIG.TEMPERATURE,
      response_format: options.jsonMode ? { type: 'json_object' } : { type: 'text' },
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
