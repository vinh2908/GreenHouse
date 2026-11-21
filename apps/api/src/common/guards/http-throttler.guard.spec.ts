import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpThrottlerGuard } from './http-throttler.guard';

describe('HttpThrottlerGuard (R15-1a, 1b)', () => {
  let guard: HttpThrottlerGuard;
  const mockStorageService = {
    increment: jest.fn(),
  };
  const mockReflector = new Reflector();

  beforeEach(() => {
    guard = new HttpThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
      mockStorageService as any,
      mockReflector,
    );
  });

  describe('getTracker (1a)', () => {
    it('uses CF-Connecting-IP when header is present', async () => {
      const req = {
        headers: {
          'cf-connecting-ip': '203.0.113.195',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        },
        ip: '10.0.0.1', // e.g. Cloudflare proxy IP
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('203.0.113.195');
    });

    it('falls back to req.ip when CF-Connecting-IP is absent and ignores spoofed x-forwarded-for', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        },
        ip: '198.51.100.42',
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('198.51.100.42');
    });

    it('handles array format in CF-Connecting-IP', async () => {
      const req = {
        headers: {
          'cf-connecting-ip': ['203.0.113.200', '198.51.100.1'],
        },
        ip: '10.0.0.1',
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('203.0.113.200');
    });
  });

  describe('shouldSkip (1b)', () => {
    it('skips throttling for /health endpoint', async () => {
      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ url: '/health' }),
        }),
      } as unknown as ExecutionContext;

      const shouldSkip = await (guard as any).shouldSkip(mockContext);
      expect(shouldSkip).toBe(true);
    });

    it('skips throttling for /api/v1/health endpoint with query params', async () => {
      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ url: '/api/v1/health?t=123' }),
        }),
      } as unknown as ExecutionContext;

      const shouldSkip = await (guard as any).shouldSkip(mockContext);
      expect(shouldSkip).toBe(true);
    });

    it('does not skip standard endpoints like /api/v1/jobs', async () => {
      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ url: '/api/v1/jobs' }),
        }),
      } as unknown as ExecutionContext;

      const shouldSkip = await (guard as any).shouldSkip(mockContext);
      expect(shouldSkip).toBe(false);
    });
  });
});
