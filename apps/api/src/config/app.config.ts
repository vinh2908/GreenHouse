import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'HomeMate',
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3001').split(','),
}));

// Separate AI config namespace
export const aiConfig = registerAs('ai', () => ({
  openaiApiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
  // Feature flags (read from env, default true if key set)
  bookingAssistant: process.env.AI_BOOKING_ASSISTANT !== 'false',
  priceEstimator: process.env.AI_PRICE_ESTIMATOR !== 'false',
  matchExplanation: process.env.AI_MATCH_EXPLANATION !== 'false',
  customerSupport: process.env.AI_CUSTOMER_SUPPORT !== 'false',
}));
