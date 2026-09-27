import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'Green House',
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3001').split(','),
}));

// Separate AI config namespace
export const aiConfig = registerAs('ai', () => ({
  provider: process.env.AI_PROVIDER || 'gemini', // 'gemini' | 'openai' | 'mock'
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  // Feature flags (read from env, default true)
  bookingAssistant: process.env.AI_BOOKING_ASSISTANT !== 'false',
  priceEstimator: process.env.AI_PRICE_ESTIMATOR !== 'false',
  matchExplanation: process.env.AI_MATCH_EXPLANATION !== 'false',
  customerSupport: process.env.AI_CUSTOMER_SUPPORT !== 'false',
}));
