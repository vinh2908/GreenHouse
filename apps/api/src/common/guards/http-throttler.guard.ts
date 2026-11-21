import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Global rate limiting for REST only; socket events are not throttled here.
// R15-1a & 1b: Key đếm giới hạn dùng IP thật từ CF-Connecting-IP (chỉ tin header Cloudflare),
// fallback req.ip khi không có header; bỏ qua /health khỏi giới hạn.
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const cfConnectingIp = req.headers?.['cf-connecting-ip'];
    if (cfConnectingIp) {
      const rawIp = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
      if (typeof rawIp === 'string' && rawIp.trim()) {
        return rawIp.trim();
      }
    }
    return req.ip || '127.0.0.1';
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const url = req?.url || req?.originalUrl || '';
    const cleanUrl = url.split('?')[0];
    if (
      cleanUrl === '/health' ||
      cleanUrl === '/api/v1/health' ||
      cleanUrl.startsWith('/health/') ||
      cleanUrl.startsWith('/api/v1/health/')
    ) {
      return true;
    }
    return super.shouldSkip(context);
  }

  override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return Promise.resolve(true);
    return super.canActivate(context);
  }
}

