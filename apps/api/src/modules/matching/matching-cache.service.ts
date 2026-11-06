import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * B67: Cache kết quả gợi ý thợ theo job_id (TTL 5 phút).
 * - Ưu tiên Redis (config `redis.url`); nếu Redis không nối được hoặc lỗi thì
 *   tự fallback sang bộ nhớ trong tiến trình (Map + TTL) — gợi ý vẫn chạy,
 *   chỉ không chia sẻ cache giữa các instance.
 * - Key: matching:optimal-helpers:{jobId}:{limit}
 */
@Injectable()
export class MatchingCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchingCacheService.name);
  private readonly ttlSeconds = 300;
  private redis: Redis | null = null;
  private redisFailed = false;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('redis.url');
    if (!url) return;
    try {
      // lazyConnect: chỉ kết nối khi lần đầu dùng — API vẫn khởi động được
      // dù Redis đang tắt; lỗi kết nối sẽ rơi về bộ nhớ trong tiến trình.
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      this.redis.on('error', err => {
        if (!this.redisFailed) {
          this.redisFailed = true;
          this.logger.warn(
            `Redis cache không khả dụng, dùng bộ nhớ trong tiến trình: ${err.message}`,
          );
        }
      });
    } catch {
      this.redis = null;
    }
  }

  private key(jobId: string, limit: number): string {
    return `matching:optimal-helpers:${jobId}:${limit}`;
  }

  async get<T>(jobId: string, limit: number): Promise<T | null> {
    const k = this.key(jobId, limit);
    if (this.redis && !this.redisFailed) {
      try {
        const raw = await this.redis.get(k);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        // Rơi xuống bộ nhớ trong tiến trình
      }
    }
    const hit = this.memory.get(k);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.memory.delete(k);
      return null;
    }
    return JSON.parse(hit.value) as T;
  }

  async set(jobId: string, limit: number, value: unknown): Promise<void> {
    const k = this.key(jobId, limit);
    const raw = JSON.stringify(value);
    if (this.redis && !this.redisFailed) {
      try {
        await this.redis.set(k, raw, 'EX', this.ttlSeconds);
      } catch {
        // Bỏ qua lỗi Redis — bộ nhớ trong tiến trình vẫn lưu
      }
    }
    this.memory.set(k, { value: raw, expiresAt: Date.now() + this.ttlSeconds * 1000 });
  }

  async invalidateJob(jobId: string): Promise<void> {
    const prefix = `matching:optimal-helpers:${jobId}:`;
    if (this.redis && !this.redisFailed) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) await this.redis.del(...keys);
      } catch {
        // Bỏ qua — bộ nhớ trong tiến trình vẫn được xoá bên dưới
      }
    }
    for (const k of [...this.memory.keys()]) {
      if (k.startsWith(prefix)) this.memory.delete(k);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis?.quit();
    } catch {
      // Bỏ qua lỗi đóng kết nối lúc tắt app
    }
  }
}
