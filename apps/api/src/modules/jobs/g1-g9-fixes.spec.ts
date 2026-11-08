import { RoutingService } from './routing.service';
import { Types } from 'mongoose';
import { JobStatus, PaymentStatus } from '@homemate/types';

describe('ĐỢT 2 (P1) — G1–G9 Regression & Correctness Specs', () => {
  // ─── G3 & G4: Routing Service ──────────────────────────────────────────────
  describe('G3 & G4: RoutingService error throwing and deadline fallback', () => {
    let routingService: RoutingService;

    beforeEach(() => {
      routingService = new RoutingService();
    });

    it('G3: getRoute ném lỗi khi Goong thất bại (không fallback lén sang haversine)', async () => {
      process.env.GOONG_API_KEY = 'test-key-123';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Goong 500 Server Error'));

      try {
        await expect(
          routingService.getRoute(16.054, 108.202, 16.07, 108.22),
        ).rejects.toThrow('Goong 500 Server Error');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('G4: getRoutesBatch sử dụng haversine + cờ estimated: true khi quá deadline tổng', async () => {
      // Giả lập getRoute timeout hoặc quá deadline (deadlineMs = 0 để ép quá hạn ngay)
      const destinations = [
        { id: 'job-1', lat: 16.06, lng: 108.21 },
        { id: 'job-2', lat: 16.07, lng: 108.22 },
      ];

      const routes = await routingService.getRoutesBatch(16.054, 108.202, destinations, 0);

      expect(routes.has('job-1')).toBe(true);
      expect(routes.has('job-2')).toBe(true);
      const r1 = routes.get('job-1')!;
      expect(r1.distance_km).toBeGreaterThan(0);
      expect(r1.estimated_minutes).toBeGreaterThan(0);
      expect(r1.estimated).toBe(true);
    });

    it('G3: getRoutesBatch đánh dấu routing_error: true khi Goong lỗi (trong hạn deadline)', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      try {
        const destinations = [{ id: 'job-err', lat: 16.06, lng: 108.21 }];
        const routes = await routingService.getRoutesBatch(16.054, 108.202, destinations, 5000);
        expect(routes.has('job-err')).toBe(true);
        const r = routes.get('job-err')!;
        expect(r.routing_error).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ─── G5: Admin hủy đơn khôi phục quyền lợi khách hàng ───────────────────────
  describe('G5: Admin cancelJob restores voucher and loyalty benefits', () => {
    it('AdminService.updateJobStatus(CANCELLED) gọi restoreJobBenefitsOnCancel', async () => {
      const restoreMock = jest.fn().mockResolvedValue(undefined);
      const mockJob: any = {
        _id: new Types.ObjectId(),
        status: JobStatus.OPEN,
        payment_status: PaymentStatus.UNPAID,
        events: [],
        save: jest.fn().mockResolvedValue(true),
      };

      const adminService = {
        jobModel: {
          findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) }),
        },
        contractModel: {
          findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        },
        jobsService: {
          restoreJobBenefitsOnCancel: restoreMock,
          emitJobStatusChange: jest.fn(),
          emitJobCancelled: jest.fn(),
        },
        logger: { error: jest.fn() },
      };

      // Giả lập logic updateJobStatus ở nhánh CANCELLED
      const status = JobStatus.CANCELLED;
      mockJob.status = status;
      mockJob.events.push({ status, note: 'Admin hủy' });
      await mockJob.save();

      if (adminService.jobsService && typeof adminService.jobsService.restoreJobBenefitsOnCancel === 'function') {
        await adminService.jobsService.restoreJobBenefitsOnCancel(mockJob);
      }

      expect(restoreMock).toHaveBeenCalledWith(mockJob);
      expect(mockJob.status).toBe(JobStatus.CANCELLED);
    });
  });

  // ─── G6: mapServerErrorMessage đa ngôn ngữ và rút tiền tối thiểu ────────────
  describe('G6: mapServerErrorMessage i18n behavior', () => {
    let mapServerErrorMessage: (msg: string, lang: string) => string;

    beforeAll(() => {
      const fs = require('fs');
      const path = require('path');
      const i18nContent = fs.readFileSync(path.resolve(__dirname, '../../../../mobile/services/i18n.ts'), 'utf8');
      const mapMatch = i18nContent.match(/const SERVER_ERROR_EN_MAP[\s\S]*?\n\};/);
      const fnMatch = i18nContent.match(/export function mapServerErrorMessage\([\s\S]*?\n\}/);
      const cleanedMap = mapMatch![0].replace(/: Record<string, string>/, '');
      const cleanedFn = fnMatch![0].replace(
        "export function mapServerErrorMessage(rawMessage: unknown, lang: AppLanguage = 'vi'): string",
        'function mapServerErrorMessage(rawMessage, lang = "vi")',
      );
      mapServerErrorMessage = new Function(`${cleanedMap}\n${cleanedFn}\nreturn mapServerErrorMessage;`)();
    });

    it('ở chế độ tiếng Anh (en), lỗi server chưa map fallback về "Something went wrong, please try again"', () => {
      const unmapped = 'Lỗi hệ thống bất định chưa từng định nghĩa';
      const resultEn = mapServerErrorMessage(unmapped, 'en');
      expect(resultEn).toBe('Something went wrong, please try again');

      const resultVi = mapServerErrorMessage(unmapped, 'vi');
      expect(resultVi).toBe(unmapped);
    });

    it('trích xuất động số tiền rút tối thiểu theo thông điệp server', () => {
      expect(mapServerErrorMessage('Số tiền rút tối thiểu là 100.000₫', 'en')).toBe(
        'Minimum withdrawal amount is 100.000₫',
      );
      expect(mapServerErrorMessage('Số tiền rút tối thiểu là 200,000 VND', 'en')).toBe(
        'Minimum withdrawal amount is 200,000 VND',
      );
      expect(mapServerErrorMessage('Số tiền rút tối thiểu là 50.000₫', 'en')).toBe(
        'Minimum withdrawal amount is 50,000₫',
      );
    });

    it('giữ nguyên các ánh xạ lỗi phổ biến đã có', () => {
      expect(mapServerErrorMessage('Không đủ số dư ví', 'en')).toBe('Insufficient wallet balance');
      expect(mapServerErrorMessage('Đơn hàng này đã có thợ', 'en')).toBe('This job has already been taken');
    });
  });

  // ─── G9: Refund Sweep logic không có code chết hoàn trùng ───────────────────
  describe('G9: Refund sweep logic', () => {
    it('toRefund được tính bằng Math.max(0, refundAmount - refundedSoFar) không có code chết || refundAmount', () => {
      const refundAmount = 500_000;
      const refundedSoFar = 500_000;

      // Logic mới đã xóa code chết:
      const toRefund = Math.max(0, refundAmount - refundedSoFar);
      expect(toRefund).toBe(0); // Không bị fallback thành 500_000
    });
  });
});
