import { RoutingService } from './routing.service';
import { Types } from 'mongoose';
import { JobStatus, PaymentStatus, VerificationStatus } from '@homemate/types';
import { JobsService, MAX_FEED_SORT_CANDIDATES } from './jobs.service';
import { AdminService } from '../admin/admin.service';

describe('ĐỢT 2 (P1) — G1–G9 & J1–J3 Regression & Correctness Specs', () => {
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
        await expect(routingService.getRoute(16.054, 108.202, 16.07, 108.22)).rejects.toThrow(
          'Goong 500 Server Error',
        );
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

  // ─── G5 & J3: Admin hủy đơn khôi phục quyền lợi khách qua code AdminService thật ───
  describe('G5 & J3: Admin cancelJob calls restoreJobBenefitsOnCancel on real AdminService', () => {
    it('AdminService.updateJobStatus(CANCELLED) chạy qua AdminService thật và gọi restoreJobBenefitsOnCancel', async () => {
      const jobId = new Types.ObjectId().toString();
      const adminId = new Types.ObjectId().toString();
      const mockJob: any = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.IN_PROGRESS,
        payment_status: PaymentStatus.PAID,
        events: [],
        save: jest.fn().mockResolvedValue(true),
      };

      const restoreMock = jest.fn().mockResolvedValue(undefined);
      const jobsServiceMock: any = {
        restoreJobBenefitsOnCancel: restoreMock,
        emitJobStatusChange: jest.fn(),
        emitJobCancelled: jest.fn(),
      };

      const jobModel = {
        findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) }),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };
      const contractModel = {
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      };

      const adminService = new AdminService(
        {} as any, // userModel
        {} as any, // helperModel
        jobModel as any,
        contractModel as any,
        {} as any, // notificationModel
        {} as any, // walletModel
        { findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) } as any, // transactionModel
        {} as any, // withdrawalModel
        { exists: jest.fn().mockResolvedValue(false) } as any, // reviewModel
        {} as any, // customerModel
        {} as any, // sosModel
        {} as any, // penaltyEventModel
        { create: jest.fn().mockResolvedValue({}) } as any, // notificationsService
        {} as any, // paymentsService
        jobsServiceMock,
      );

      const result = await adminService.updateJobStatus(
        jobId,
        JobStatus.CANCELLED,
        'Admin test cancel',
        adminId,
      );

      expect(result.status).toBe(JobStatus.CANCELLED);
      expect(restoreMock).toHaveBeenCalledWith(mockJob);
      expect(jobsServiceMock.emitJobCancelled).toHaveBeenCalledWith(mockJob, 'Admin test cancel');
    });
  });

  // ─── G6: mapServerErrorMessage đa ngôn ngữ và rút tiền tối thiểu ────────────
  describe('G6: mapServerErrorMessage i18n behavior', () => {
    let mapServerErrorMessage: (msg: string, lang: string) => string;

    beforeAll(() => {
      const fs = require('fs');
      const path = require('path');
      const i18nContent = fs.readFileSync(
        path.resolve(__dirname, '../../../../mobile/services/i18n.ts'),
        'utf8',
      );
      const mapMatch = i18nContent.match(/const SERVER_ERROR_EN_MAP[\s\S]*?\n\};/);
      const fnMatch = i18nContent.match(/export function mapServerErrorMessage\([\s\S]*?\n\}/);
      const cleanedMap = mapMatch![0].replace(/: Record<string, string>/, '');
      const cleanedFn = fnMatch![0].replace(
        "export function mapServerErrorMessage(rawMessage: unknown, lang: AppLanguage = 'vi'): string",
        'function mapServerErrorMessage(rawMessage, lang = "vi")',
      );
      mapServerErrorMessage = new Function(
        `${cleanedMap}\n${cleanedFn}\nreturn mapServerErrorMessage;`,
      )();
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
      expect(mapServerErrorMessage('Đơn hàng này đã có thợ', 'en')).toBe(
        'This job has already been taken',
      );
    });
  });

  // ─── G9 & J3: Refund Sweep logic chạy code thật của JobsService.sweepPendingRefundRetries ───
  describe('G9 & J3: JobsService.sweepPendingRefundRetries refund logic', () => {
    it('chạy logic sweep thật: chỉ hoàn phần còn lại toRefund = Math.max(0, refundAmount - refundedSoFar)', async () => {
      const jobId = new Types.ObjectId();
      const customerId = new Types.ObjectId();

      const pendingJob: any = {
        _id: jobId,
        customer_id: customerId,
        title: 'Đơn test hoàn tiền dở dang',
        status: JobStatus.CANCELLED,
        payment_status: PaymentStatus.PAID,
        refund_pending_retry: true,
        refund_pending_amount: 500_000,
        refund_retry_count: 0,
        save: jest.fn().mockResolvedValue(true),
      };

      const jobModel = {
        find: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([pendingJob]),
        }),
      };

      const paymentsService = {
        getTotalRefundedForJob: jest.fn().mockResolvedValue(200_000), // Đã hoàn 200k trước đó
        refundCustomer: jest.fn().mockResolvedValue({}),
      };

      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel as any,
        dummy, // quoteModel
        dummy, // contractModel
        dummy, // serviceModel
        dummy, // helperModel
        dummy, // penaltyEventModel
        dummy, // userModel
        dummy, // gateway
        notificationsService as any,
        dummy, // chatService
        paymentsService as any,
        dummy, // routingService
        dummy, // favoritesService
        dummy, // vouchersService
        dummy, // loyaltyService
        dummy, // disputesService
      );

      const recovered = await jobsService.sweepPendingRefundRetries();

      expect(recovered).toBe(1);
      // Kiểm tra toRefund được tính đúng là 500k - 200k = 300k, KHÔNG phải 500k
      expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
        String(customerId),
        String(jobId),
        300_000,
        expect.any(String),
      );
    });

    it('nếu đã hoàn đủ (refundedSoFar >= refundAmount), không gọi refundCustomer lần nữa', async () => {
      const jobId = new Types.ObjectId();
      const customerId = new Types.ObjectId();

      const pendingJob: any = {
        _id: jobId,
        customer_id: customerId,
        title: 'Đơn test đã hoàn đủ',
        status: JobStatus.CANCELLED,
        payment_status: PaymentStatus.PAID,
        refund_pending_retry: true,
        refund_pending_amount: 500_000,
        refund_retry_count: 0,
        save: jest.fn().mockResolvedValue(true),
      };

      const jobModel = {
        find: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([pendingJob]),
        }),
      };

      const paymentsService = {
        // Lần 1 (guard): trả về 0 (ví dụ tx vừa xong chưa thấy)
        // Lần 2 (ngay trước khi hoàn): trả về 500k (đã hoàn đủ)
        getTotalRefundedForJob: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(500_000),
        refundCustomer: jest.fn().mockResolvedValue({}),
      };

      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel as any,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        notificationsService as any,
        dummy,
        paymentsService as any,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const recovered = await jobsService.sweepPendingRefundRetries();

      expect(recovered).toBe(0);
      // Đã hoàn đủ -> không gọi refundCustomer
      expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    });
  });

  // ─── J1: Feed thợ sắp xếp gần-nhất-trước (P1-18) ───────────────────────────
  describe('J1: getAvailableJobs feed sorts by distance nearest-first', () => {
    it('với tọa độ thợ + các đơn đã biết trước -> feed trả về đơn gần nhất lên đầu trên trang 1', async () => {
      const helperId = new Types.ObjectId().toString();
      // Tọa độ thợ: 16.0544, 108.2022 (Đà Nẵng)
      const helperLat = 16.0544;
      const helperLng = 108.2022;

      // 3 đơn:
      // Job Far: tạo mới nhất (10:00), khoảng cách xa (~15km)
      const jobFar: any = {
        _id: new Types.ObjectId(),
        title: 'Job Far (15km)',
        status: JobStatus.OPEN,
        created_at: new Date('2026-11-08T10:00:00Z'),
        address: { location: { coordinates: [108.3, 16.15] } },
        toObject: function () {
          return { ...this };
        },
      };
      // Job Mid: tạo lúc 09:00, khoảng cách trung bình (~8km)
      const jobMid: any = {
        _id: new Types.ObjectId(),
        title: 'Job Mid (8km)',
        status: JobStatus.OPEN,
        created_at: new Date('2026-11-08T09:00:00Z'),
        address: { location: { coordinates: [108.25, 16.1] } },
        toObject: function () {
          return { ...this };
        },
      };
      // Job Near: tạo cũ nhất (08:00), khoảng cách gần nhất (~1km)
      const jobNear: any = {
        _id: new Types.ObjectId(),
        title: 'Job Near (1km)',
        status: JobStatus.OPEN,
        created_at: new Date('2026-11-08T08:00:00Z'),
        address: { location: { coordinates: [108.205, 16.055] } },
        toObject: function () {
          return { ...this };
        },
      };

      const allJobs = [jobFar, jobMid, jobNear];

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(3) }),
        find: jest.fn().mockImplementation(() => {
          let skipVal = 0;
          let limitVal = 50;
          const chain: any = {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockImplementation((sortObj: any) => {
              if (sortObj?.created_at === -1) {
                allJobs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
              }
              return chain;
            }),
            skip: jest.fn().mockImplementation((n: number) => {
              skipVal = n;
              return chain;
            }),
            limit: jest.fn().mockImplementation((n: number) => {
              limitVal = n;
              return chain;
            }),
            exec: jest.fn().mockImplementation(async () => {
              return allJobs.slice(skipVal, skipVal + limitVal);
            }),
          };
          return chain;
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                location: { coordinates: [helperLng, helperLat] },
                availability: { enabled: false },
              }),
            }),
          }),
        }),
      };

      const routingService = new RoutingService();
      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Gọi getAvailableJobs với page = 1, limit = 2
      const res = await jobsService.getAvailableJobs(
        helperId,
        undefined,
        1,
        2,
        helperLat,
        helperLng,
      );

      // KẾT QUẢ MONG MUỐN: Job Near gần nhất (1km) PHẢI xuất hiện trên trang 1 và đứng đầu tiên!
      expect(res.jobs.length).toBe(2);
      expect(res.jobs[0].title).toBe('Job Near (1km)');
      expect(res.jobs[1].title).toBe('Job Mid (8km)');
    });
  });

  // ─── J2: Nhánh lọc availability đếm đúng total và total_pages khi có > 150 đơn ───
  describe('J2: getAvailableJobs availability branch counts true total', () => {
    it('khi có hơn 150 đơn khớp availability -> total và total_pages đếm đúng tổng thật', async () => {
      const helperId = new Types.ObjectId().toString();

      // Tạo 180 đơn khớp điều kiện
      const jobs180: any[] = [];
      for (let i = 0; i < 180; i++) {
        jobs180.push({
          _id: new Types.ObjectId(),
          title: `Job ${i}`,
          status: JobStatus.OPEN,
          preferred_date: new Date('2026-11-09T08:00:00Z'),
          preferred_time_start: '09:00',
          created_at: new Date(Date.now() - i * 60000),
          toObject: function () {
            return { ...this };
          },
        });
      }

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(180) }),
        find: jest.fn().mockImplementation(() => {
          let limitVal = 180;
          const chain: any = {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation((n: number) => {
              limitVal = n;
              return chain;
            }),
            exec: jest.fn().mockImplementation(async () => {
              return jobs180.slice(0, limitVal);
            }),
          };
          return chain;
        }),
      };

      // Thợ bật availability tất cả các ngày trong tuần
      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                availability: {
                  enabled: true,
                  days_of_week: [0, 1, 2, 3, 4, 5, 6],
                  start_time: '07:00',
                  end_time: '20:00',
                },
              }),
            }),
          }),
        }),
      };

      const routingService = new RoutingService();
      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Trang 1, limit 20
      const res = await jobsService.getAvailableJobs(helperId, undefined, 1, 20);

      // Cũ (lỗi): cap 150 -> res.total = 150, res.total_pages = 8
      // Mới (sửa đúng): res.total = 180, res.total_pages = 9
      expect(res.total).toBe(180);
      expect(res.total_pages).toBe(9);
    });
  });

  // ─── Q1: Nhánh fallback ≤200 đơn vẫn lọc availability (regression P7(c)) ───
  describe('Q1: getAvailableJobs fallback branch keeps availability filter when total <= 200', () => {
    it('thợ bật lịch rảnh, tổng ≤ 200 đơn trộn khớp/không khớp -> chỉ trả đơn khớp, total = số đơn khớp', async () => {
      const helperId = new Types.ObjectId().toString();

      // 180 đơn: 100 khớp (thứ 2, 09:00 trong khung 07:00–20:00), 80 không khớp (thứ 3)
      const jobs180: any[] = [];
      for (let i = 0; i < 180; i++) {
        const matching = i % 9 < 5; // xen kẽ để trang 1 cũng trộn cả hai loại
        jobs180.push({
          _id: new Types.ObjectId(),
          title: `Job ${i}`,
          status: JobStatus.OPEN,
          preferred_date: matching
            ? new Date('2026-11-09T08:00:00Z') // thứ 2
            : new Date('2026-11-10T08:00:00Z'), // thứ 3
          preferred_time_start: '09:00',
          created_at: new Date(Date.now() - i * 60000),
          toObject: function () {
            return { ...this };
          },
        });
      }
      const matchingCount = jobs180.filter(j => j.preferred_date.getDay() === 1).length;
      expect(matchingCount).toBe(100);

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(180) }),
        find: jest.fn().mockImplementation(() => {
          let limitVal = 180;
          const chain: any = {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation((n: number) => {
              limitVal = n;
              return chain;
            }),
            exec: jest.fn().mockImplementation(async () => {
              return jobs180.slice(0, limitVal);
            }),
          };
          return chain;
        }),
      };

      // Thợ bật availability chỉ thứ 2, khung 07:00–20:00, không có vị trí (đi nhánh fallback, không $geoNear)
      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                availability: {
                  enabled: true,
                  days_of_week: [1],
                  start_time: '07:00',
                  end_time: '20:00',
                },
              }),
            }),
          }),
        }),
      };

      const routingService = new RoutingService();
      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Trang 1, limit 20 — tổng 180 ≤ 200 nên đi nhánh fallback
      const res = await jobsService.getAvailableJobs(helperId, undefined, 1, 20);

      // Lỗi P7(c): total = 180, trang 1 chứa cả đơn thứ 3 ngoài lịch rảnh
      // Sửa đúng: total = 100, total_pages = 5, trang 1 chỉ có đơn thứ 2
      expect(res.total).toBe(100);
      expect(res.total_pages).toBe(5);
      expect(res.jobs.length).toBe(20);
      for (const job of res.jobs) {
        expect(new Date(job.preferred_date).getDay()).toBe(1);
      }
    });
  });

  // ─── M1: getAvailableJobs sort gần-nhất với > 150 đơn có giới hạn RAM + đếm tổng đúng ───
  describe('M1: getAvailableJobs feed bounded query and true total with 150+ jobs', () => {
    it('khi có hơn 150 đơn khớp -> trang đầu trả về đơn gần nhất lên đầu, query bị giới hạn bởi MAX_FEED_SORT_CANDIDATES và total/total_pages đúng tổng thật', async () => {
      const helperId = new Types.ObjectId().toString();
      const helperLat = 16.0544;
      const helperLng = 108.2022;

      // Tạo 160 đơn: đơn 0 gần nhất (1km), các đơn sau xa dần
      const jobs160: any[] = [];
      for (let i = 0; i < 160; i++) {
        jobs160.push({
          _id: new Types.ObjectId(),
          title: `Job ${i} (${i + 1}km)`,
          status: JobStatus.OPEN,
          address: {
            location: {
              coordinates: [helperLng + 0.005 * (i + 1), helperLat + 0.005 * (i + 1)],
            },
          },
          created_at: new Date(Date.now() - i * 60000),
          toObject: function () {
            return { ...this };
          },
        });
      }

      let limitApplied: number | undefined;
      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(160) }),
        find: jest.fn().mockImplementation(() => {
          const chain: any = {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation((n: number) => {
              limitApplied = n;
              return chain;
            }),
            exec: jest.fn().mockImplementation(async () => {
              return jobs160.slice(0, limitApplied ?? 160);
            }),
          };
          return chain;
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                location: { coordinates: [helperLng, helperLat] },
                availability: { enabled: false },
              }),
            }),
          }),
        }),
      };

      const routingService = new RoutingService();
      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const res = await jobsService.getAvailableJobs(
        helperId,
        undefined,
        1,
        20,
        helperLat,
        helperLng,
      );

      // (a) Trang đầu trả về đúng thứ tự gần nhất lên đầu
      expect(res.jobs[0].title).toBe('Job 0 (1km)');
      expect(res.jobs.length).toBe(20);

      // (b) Total và total_pages đúng tổng thật
      expect(res.total).toBe(160);
      expect(res.total_pages).toBe(8);

      // (c) Query có giới hạn an toàn, không load toàn bộ RAM vô hạn
      expect(limitApplied).toBe(MAX_FEED_SORT_CANDIDATES);
      expect(res.candidate_cap).toBe(MAX_FEED_SORT_CANDIDATES);
    });
  });

  describe('K2: Ẩn báo giá của thợ chưa xác minh danh tính và gửi thông báo đúng 1 lần', () => {
    it('thợ chưa xác minh danh tính -> báo giá bị gắn cờ unverified, gửi thông báo cho thợ và cập nhật cờ DB', async () => {
      const jobId = '507f1f77bcf86cd799439011';
      const customerId = '507f1f77bcf86cd799439012';
      const helperId = '507f1f77bcf86cd799439013';
      const quoteId = '507f1f77bcf86cd799439014';

      const mockJob = {
        _id: jobId,
        customer_id: customerId,
        title: 'Sửa ống nước',
        address: { location: { coordinates: [106.68, 10.77] } },
      };

      const mockQuote = {
        _id: quoteId,
        job_id: jobId,
        helper_id: helperId,
        status: 'pending',
        total_price: 200000,
        unverified_hidden_notified: false,
        toObject: function () {
          return { ...this };
        },
      };

      const jobModel: any = {
        findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) }),
      };

      const quoteModel: any = {
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([mockQuote]),
          }),
        }),
        updateOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      };

      const helperModel: any = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([
                {
                  user_id: helperId,
                  verification_status: VerificationStatus.REJECTED,
                  rating: 4.5,
                  completed_jobs: 5,
                },
              ]),
            }),
          }),
        }),
      };

      const notificationsService: any = {
        create: jest.fn().mockResolvedValue({}),
      };

      const routingService = new RoutingService();
      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        quoteModel,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        notificationsService,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const quotes = await jobsService.getJobQuotes(jobId, customerId, 'customer');
      expect(quotes).toHaveLength(1);
      expect((quotes[0] as any).helper_unverified).toBe(true);
      expect((quotes[0] as any).helper_unverified_reason).toBe('Thợ này đã bị thu hồi xác minh');

      // Đợi promise microtask chạy xong
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(quoteModel.updateOne).toHaveBeenCalledWith(
        { _id: quoteId, unverified_hidden_notified: { $ne: true } },
        { $set: { unverified_hidden_notified: true } },
      );
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: helperId,
          title: 'Báo giá đã bị ẩn',
          body: expect.stringContaining('chưa xác minh danh tính'),
        }),
      );

      // Khi đã gắn cờ unverified_hidden_notified = true thì lần lấy tiếp theo không gửi lại
      notificationsService.create.mockClear();
      quoteModel.updateOne.mockClear();
      mockQuote.unverified_hidden_notified = true;

      const quotes2 = await jobsService.getJobQuotes(jobId, customerId, 'customer');
      expect((quotes2[0] as any).helper_unverified).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('K8: getSkippedJobs tính ETA từ GPS thiết bị khi thợ không có vị trí profile và xóa estimated_travel_minutes', () => {
    it('thợ không có location trong profile -> nhận GPS lat/lng từ query, tính route và chỉ trả estimated_minutes (không trả estimated_travel_minutes)', async () => {
      const helperId = '507f1f77bcf86cd799439099';
      const skippedJob = {
        _id: '507f1f77bcf86cd799439088',
        title: 'Đơn đã bỏ qua',
        address: { location: { coordinates: [106.69, 10.78] } },
        toObject: function () {
          return { ...this };
        },
      };

      const jobModel: any = {
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([skippedJob]),
        }),
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      };

      // Profile thợ hoàn toàn không có location
      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({ _id: helperId, location: null }),
            }),
          }),
        }),
      };

      const routingService = new RoutingService();
      jest
        .spyOn(routingService, 'getRoutesBatch')
        .mockResolvedValue(
          new Map([
            [
              '507f1f77bcf86cd799439088',
              { distance_km: 2.5, estimated_minutes: 10, estimated: false } as any,
            ],
          ]),
        );

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Gọi getSkippedJobs với GPS thiết bị (lat: 10.77, lng: 106.68)
      const res = await jobsService.getSkippedJobs(helperId, 1, 20, 10.77, 106.68);

      expect(res.jobs).toHaveLength(1);
      const j = res.jobs[0] as any;
      expect(j.distance_km).toBe(2.5);
      expect(j.estimated_minutes).toBe(10);
      // Assert xóa hẳn tên trường cũ estimated_travel_minutes
      expect(j.estimated_travel_minutes).toBeUndefined();
      expect(routingService.getRoutesBatch).toHaveBeenCalledWith(
        10.77,
        106.68,
        expect.arrayContaining([expect.objectContaining({ id: '507f1f77bcf86cd799439088' })]),
      );
    });
  });

  describe('N2, N3 & N7(a): $geoNear non-geo fallback, availability exact total & warn logging', () => {
    describe('O1, N2 & O7(d): $geoNear phân trang 4 nhánh và chống rò rỉ đơn private-offer không tọa độ', () => {
      const helperId = '507f1f77bcf86cd799439011';
      const dummy = {} as never;

      it('Nhánh 1 (toàn-có-tọa-độ): pageSkip + pageSize <= geoCount → chỉ chạy $geoNear pipeline', async () => {
        const geoJobs = Array.from({ length: 10 }, (_, i) => ({
          _id: `job-geo-${i}`,
          title: `Đơn có GPS ${i}`,
          address: { location: { type: 'Point', coordinates: [106.7, 10.78] } },
        }));

        const jobModel: any = {
          countDocuments: jest.fn().mockImplementation((query: any) => {
            if (query && query['address.location.coordinates.0']) {
              return { exec: jest.fn().mockResolvedValue(25) }; // 25 đơn có tọa độ
            }
            return { exec: jest.fn().mockResolvedValue(30) }; // 30 đơn tổng
          }),
          aggregate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(geoJobs),
          }),
          find: jest.fn(),
        };

        const helperModel: any = {
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue({ _id: helperId, verification_status: 'approved' }),
              }),
            }),
          }),
        };

        const jobsService = new JobsService(
          jobModel,
          dummy,
          dummy,
          dummy,
          helperModel,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
          dummy,
          dummy,
          dummy,
          dummy,
        );

        const res = await jobsService.getAvailableJobs(helperId, undefined, 1, 10, 10.77, 106.68);
        expect(res.jobs).toHaveLength(10);
        expect(jobModel.aggregate).toHaveBeenCalled();
        expect(jobModel.find).not.toHaveBeenCalled();
        expect(res.total).toBe(30);
      });

      it('Nhánh 2 (hỗn hợp / ranh giới): pageSkip < geoCount && pageSkip + pageSize > geoCount → ghép geo và non-geo cuối trang', async () => {
        const geoJob1 = {
          _id: 'job-geo-1',
          title: 'Đơn có GPS 1',
          address: { location: { type: 'Point', coordinates: [106.7, 10.78] } },
        };
        const geoJob2 = {
          _id: 'job-geo-2',
          title: 'Đơn có GPS 2',
          address: { location: { type: 'Point', coordinates: [106.71, 10.79] } },
        };
        const nonGeoJob = {
          _id: 'job-no-geo',
          title: 'Đơn không có GPS',
          address: { full_address: '123 Đường Test, Quận 1' },
        };

        const jobModel: any = {
          countDocuments: jest.fn().mockImplementation((query: any) => {
            if (query && query['address.location.coordinates.0']) {
              return { exec: jest.fn().mockResolvedValue(2) }; // 2 đơn có tọa độ
            }
            return { exec: jest.fn().mockResolvedValue(3) }; // tổng 3 đơn
          }),
          aggregate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([geoJob1, geoJob2]),
          }),
          find: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                skip: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue([nonGeoJob]),
                  }),
                }),
              }),
            }),
          }),
        };

        const helperModel: any = {
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue({ _id: helperId, verification_status: 'approved' }),
              }),
            }),
          }),
        };

        const jobsService = new JobsService(
          jobModel,
          dummy,
          dummy,
          dummy,
          helperModel,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
          dummy,
          dummy,
          dummy,
          dummy,
        );

        const res = await jobsService.getAvailableJobs(helperId, undefined, 1, 10, 10.77, 106.68);
        expect(res.jobs).toHaveLength(3);
        expect(res.jobs[0]._id).toBe('job-geo-1');
        expect(res.jobs[1]._id).toBe('job-geo-2');
        expect(res.jobs[2]._id).toBe('job-no-geo');
        expect(res.total).toBe(3);
      });

      it('Nhánh 3 (toàn-không-tọa-độ): pageSkip >= geoCount → chỉ lấy phần bù không tọa độ xếp ở cuối feed', async () => {
        const nonGeoJob1 = {
          _id: 'job-no-geo-1',
          title: 'Đơn không GPS 1',
          address: { full_address: '456 Đường ABC, Quận 3' },
        };
        const nonGeoJob2 = {
          _id: 'job-no-geo-2',
          title: 'Đơn không GPS 2',
          address: { full_address: '789 Đường XYZ, Quận 5' },
        };

        let capturedNonGeoQuery: any = null;

        const jobModel: any = {
          countDocuments: jest.fn().mockImplementation((query: any) => {
            if (query && query['address.location.coordinates.0']) {
              return { exec: jest.fn().mockResolvedValue(2) }; // 2 đơn có GPS
            }
            return { exec: jest.fn().mockResolvedValue(4) }; // 4 đơn tổng
          }),
          aggregate: jest.fn(),
          find: jest.fn().mockImplementation((q: any) => {
            capturedNonGeoQuery = q;
            return {
              populate: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                  skip: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      exec: jest.fn().mockResolvedValue([nonGeoJob1, nonGeoJob2]),
                    }),
                  }),
                }),
              }),
            };
          }),
        };

        const helperModel: any = {
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue({ _id: helperId, verification_status: 'approved' }),
              }),
            }),
          }),
        };

        const jobsService = new JobsService(
          jobModel,
          dummy,
          dummy,
          dummy,
          helperModel,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
          dummy,
          dummy,
          dummy,
          dummy,
        );

        // Trang 2: skip 2 (bằng đúng geoCount = 2) → toàn bộ thuộc tập non-geo
        const res = await jobsService.getAvailableJobs(helperId, undefined, 2, 2, 10.77, 106.68);
        expect(res.jobs).toHaveLength(2);
        expect(res.jobs[0]._id).toBe('job-no-geo-1');
        expect(res.jobs[1]._id).toBe('job-no-geo-2');
        expect(jobModel.aggregate).not.toHaveBeenCalled();

        // P3 assert: Bảo toàn $and trong nhánh 3 (toàn-đơn-không-tọa-độ)
        expect(capturedNonGeoQuery).toBeDefined();
        expect(capturedNonGeoQuery.$and).toBeDefined();
        expect(Array.isArray(capturedNonGeoQuery.$and)).toBe(true);
        const hasNonGeoOr = capturedNonGeoQuery.$and.some(
          (clause: any) =>
            Array.isArray(clause.$or) &&
            clause.$or.some(
              (item: any) => 'address.location' in item || 'address.location.coordinates.0' in item,
            ),
        );
        expect(hasNonGeoOr).toBe(true);
      });

      it('O1 & Nhánh 4: nonGeoQuery bảo toàn $or private-offer qua $and, không làm lọt đơn chào riêng cho thợ khác', async () => {
        let capturedNonGeoQuery: any = null;

        const jobModel: any = {
          countDocuments: jest.fn().mockImplementation((query: any) => {
            if (query && query['address.location.coordinates.0']) {
              return { exec: jest.fn().mockResolvedValue(1) };
            }
            return { exec: jest.fn().mockResolvedValue(2) };
          }),
          aggregate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: 'job-geo-mine',
                title: 'Đơn của tôi có GPS',
                address: { location: { type: 'Point', coordinates: [106.7, 10.78] } },
              },
            ]),
          }),
          find: jest.fn().mockImplementation((q: any) => {
            capturedNonGeoQuery = q;
            return {
              populate: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                  skip: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      exec: jest.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            };
          }),
        };

        const helperModel: any = {
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue({ _id: helperId, verification_status: 'approved' }),
              }),
            }),
          }),
        };

        const jobsService = new JobsService(
          jobModel,
          dummy,
          dummy,
          dummy,
          helperModel,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
          dummy,
          dummy,
          dummy,
          dummy,
        );

        await jobsService.getAvailableJobs(helperId, undefined, 1, 10, 10.77, 106.68);

        // O1 assert: capturedNonGeoQuery phải chứa $and gồm cả $or private offer và $or non-geo
        expect(capturedNonGeoQuery).toBeDefined();
        expect(capturedNonGeoQuery.$and).toBeDefined();
        expect(Array.isArray(capturedNonGeoQuery.$and)).toBe(true);

        // Kiểm tra xem $or private offer ban đầu có được giữ lại trong $and không
        const hasPrivateOfferCondition = capturedNonGeoQuery.$and.some(
          (clause: any) =>
            Array.isArray(clause.$or) &&
            clause.$or.some((item: any) => 'private_offer_helper_id' in item),
        );
        expect(hasPrivateOfferCondition).toBe(true);

        // Kiểm tra xem $or non-geo có nằm trong $and không
        const hasNonGeoCondition = capturedNonGeoQuery.$and.some(
          (clause: any) =>
            Array.isArray(clause.$or) &&
            clause.$or.some(
              (item: any) => 'address.location' in item || 'address.location.coordinates.0' in item,
            ),
        );
        expect(hasNonGeoCondition).toBe(true);
      });

      it('P3: đơn không tọa độ đang private-offer cho thợ B phải VẮNG MẶT trong feed của thợ A', async () => {
        const helperAId = '507f1f77bcf86cd799439011';
        const helperBId = '507f1f77bcf86cd799439022';
        const now = new Date();
        const futureDate = new Date(Date.now() + 3600000);

        // Job 1: Đơn công khai không có tọa độ GPS
        const publicNonGeoJob: any = {
          _id: 'job-public-no-geo',
          title: 'Đơn dọn dẹp công khai không GPS',
          status: JobStatus.OPEN,
          created_at: now,
          address: { full_address: 'Quận 1, TP.HCM' },
        };

        // Job 2: Đơn chào riêng cho thợ B, không có GPS, chưa hết hạn
        const privateJobForB: any = {
          _id: 'job-private-for-b-no-geo',
          title: 'Đơn riêng cho thợ B không GPS',
          status: JobStatus.OPEN,
          private_offer_helper_id: new Types.ObjectId(helperBId),
          private_offer_expires_at: futureDate,
          created_at: now,
          address: { full_address: 'Quận 3, TP.HCM' },
        };

        const allCandidateJobs: any[] = [publicNonGeoJob, privateJobForB];

        const jobModel: any = {
          countDocuments: jest.fn().mockImplementation((q: any) => {
            if (q && q['address.location.coordinates.0']) {
              return { exec: jest.fn().mockResolvedValue(0) }; // 0 đơn có GPS
            }
            return { exec: jest.fn().mockResolvedValue(1) }; // 1 đơn hợp lệ cho thợ A
          }),
          aggregate: jest.fn(),
          find: jest.fn().mockImplementation((q: any) => {
            // Mô phỏng bộ lọc của MongoDB engine theo đúng query q nhận được:
            // Nếu query có $and gồm bộ lọc private offer, đơn privateJobForB sẽ bị loại!
            // Nếu query cũ ghi đè $or bằng nonGeoOr (mất điều kiện private offer), privateJobForB sẽ lọt vào!
            const filtered = allCandidateJobs.filter(j => {
              if (q.$and && Array.isArray(q.$and)) {
                const privateOfferClause = q.$and.find(
                  (clause: any) =>
                    Array.isArray(clause.$or) &&
                    clause.$or.some((item: any) => 'private_offer_helper_id' in item),
                );
                if (privateOfferClause) {
                  const matchPrivate = privateOfferClause.$or.some((cond: any) => {
                    if (
                      cond.private_offer_helper_id &&
                      (cond.private_offer_helper_id instanceof Types.ObjectId ||
                        typeof cond.private_offer_helper_id === 'string')
                    ) {
                      return (
                        String(j.private_offer_helper_id) === String(cond.private_offer_helper_id)
                      );
                    }
                    if (cond.private_offer_helper_id === null) {
                      return !j.private_offer_helper_id;
                    }
                    if (cond.private_offer_helper_id?.$exists === false) {
                      return !j.private_offer_helper_id;
                    }
                    if (cond.private_offer_expires_at?.$lte) {
                      return Boolean(
                        j.private_offer_expires_at &&
                        j.private_offer_expires_at <= cond.private_offer_expires_at.$lte,
                      );
                    }
                    return false;
                  });
                  if (!matchPrivate) return false;
                }
              }
              return true;
            });

            return {
              populate: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                  skip: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      exec: jest.fn().mockResolvedValue(filtered),
                    }),
                  }),
                }),
              }),
            };
          }),
        };

        const helperModel: any = {
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue({ _id: helperAId, verification_status: 'approved' }),
              }),
            }),
          }),
        };

        const jobsService = new JobsService(
          jobModel,
          dummy,
          dummy,
          dummy,
          helperModel,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          dummy,
          { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
          dummy,
          dummy,
          dummy,
          dummy,
        );

        // Thợ A lấy danh sách đơn với GPS device
        const res = await jobsService.getAvailableJobs(helperAId, undefined, 1, 10, 10.77, 106.68);

        // Assert hành vi: Đơn của thợ B TUYỆT ĐỐI KHÔNG xuất hiện trong feed thợ A
        expect(res.jobs.map(j => j._id)).toContain('job-public-no-geo');
        expect(res.jobs.map(j => j._id)).not.toContain('job-private-for-b-no-geo');
        expect(res.jobs).toHaveLength(1);
      });
    });

    it('O3: khi > 200 đơn ở nhánh availability với phân bố lệch, total tính đúng tổng thật và không trùng ước lượng cũ', async () => {
      const helperId = '507f1f77bcf86cd799439011';
      // Phân bố lệch: 200 đơn ca chiều (14:00) và 50 đơn ca sáng (08:00)
      // Thợ chỉ rảnh ca sáng (07:00 - 12:00) → Tổng thật chính xác là 50 đơn!
      // Nếu dùng ước lượng cũ từ 200 candidate đầu (toàn ca 14:00): ratio = 0/200 = 0 -> total sẽ ra 0!
      const leanCandidates = [
        ...Array.from({ length: 200 }, () => ({
          _id: new Types.ObjectId(),
          preferred_date: new Date('2026-11-09'),
          preferred_time_start: '14:00', // không khớp
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          _id: new Types.ObjectId(),
          preferred_date: new Date('2026-11-09'),
          preferred_time_start: '08:00', // khớp ca sáng
        })),
      ];

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        find: jest.fn().mockImplementation((query: any) => {
          if (query?._id?.$in) {
            const pageDocs = leanCandidates
              .filter(c => query._id.$in.map(String).includes(String(c._id)))
              .map(c => ({
                _id: c._id,
                title: `Job ${c._id}`,
                preferred_date: c.preferred_date,
                preferred_time_start: c.preferred_time_start,
                service_id: { name: 'Dọn nhà' },
              }));
            return {
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(pageDocs),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(leanCandidates),
              }),
            }),
          };
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                availability: {
                  enabled: true,
                  days_of_week: [1], // Monday
                  start_time: '07:00',
                  end_time: '12:00', // Chỉ khớp ca sáng (50 đơn)
                },
              }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const res = await jobsService.getAvailableJobs(helperId, undefined, 1, 10);

      // Phải ra đúng tổng thật 50, không phải ước lượng sai (0)
      expect(res.total).toBe(50);
      expect(res.total_pages).toBe(5); // Math.ceil(50 / 10)
      expect(res.jobs).toHaveLength(10);
    });

    it('O3: phân trang sâu (> 200 đơn khớp) ở nhánh availability vẫn trả dữ liệu và trang cuối không bị rỗng', async () => {
      const helperId = '507f1f77bcf86cd799439011';
      // 250 đơn đều khớp lịch ca sáng
      const leanCandidates = Array.from({ length: 250 }, (_, i) => ({
        _id: `job-avail-${i}`,
        preferred_date: new Date('2026-11-09'),
        preferred_time_start: '08:00',
      }));

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        find: jest.fn().mockImplementation((query: any) => {
          if (query?._id?.$in) {
            const pageDocs = query._id.$in.map((id: string) => ({
              _id: id,
              title: `Job ${id}`,
              preferred_date: new Date('2026-11-09'),
              preferred_time_start: '08:00',
              service_id: { name: 'Dọn dẹp' },
            }));
            return {
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(pageDocs),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(leanCandidates),
              }),
            }),
          };
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                availability: {
                  enabled: true,
                  days_of_week: [1],
                  start_time: '07:00',
                  end_time: '12:00',
                },
              }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Yêu cầu trang cuối cùng: trang 13 với limit = 20 (skip = 240, còn 10 đơn từ index 240-249)
      const res = await jobsService.getAvailableJobs(helperId, undefined, 13, 20);

      expect(res.total).toBe(250);
      expect(res.total_pages).toBe(13); // Math.ceil(250 / 20)
      // Trang cuối KHÔNG RỖNG mà trả đủ 10 đơn còn lại
      expect(res.jobs).toHaveLength(10);
      expect(res.jobs[0]._id).toBe('job-avail-240');
      expect(res.jobs[9]._id).toBe('job-avail-249');
    });

    it('N7(a): lỗi $geoNear được log cảnh báo với context rõ trước khi fallback', async () => {
      const helperId = '507f1f77bcf86cd799439011';
      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(5) }),
        aggregate: jest.fn().mockReturnValue({
          exec: jest.fn().mockRejectedValue(new Error('MongoServerError: 2dsphere index missing')),
        }),
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({ _id: helperId, verification_status: 'approved' }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const warnSpy = jest.spyOn((jobsService as any).logger, 'warn');
      await jobsService.getAvailableJobs(helperId, undefined, 1, 10, 10.77, 106.68);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('$geoNear aggregation failed, falling back to in-memory sort'),
      );
    });

    // ─── P7: Phân trang sâu, sắp xếp created_at: -1 và tính đúng is_capped / candidate_cap ───
    it('P7(b): phân trang sâu NHÁNH LEAN-SCAN (availability BẬT, tổng > 200, không GPS) sắp xếp theo created_at: -1', async () => {
      const helperId = '507f1f77bcf86cd799439011';
      let sortArg: any = null;

      // 250 đơn đều khớp lịch thợ (thứ 2 09:00, thợ rảnh thứ 2 07:00–20:00),
      // nhưng created_at CỐ TÌNH XÁO TRỘN (nửa sau mới hơn nửa đầu) để chứng minh
      // thứ tự trang sâu đến từ sort({ created_at: -1 }) của lean query,
      // không phải thứ tự chèn của mock. Code cũ (pre-P7(b)) không gọi .sort()
      // nên trang sâu sẽ sai thứ tự -> test FAIL trên code cũ.
      const base = new Date('2026-11-09T09:00:00+07:00').getTime();
      const ordered = Array.from({ length: 250 }, (_, i) => ({
        _id: `job-lean-${i}`,
        preferred_date: new Date('2026-11-09'),
        preferred_time_start: '09:00',
        created_at: new Date(base - i * 60_000), // i càng nhỏ càng mới
      }));
      const leanCandidates = [...ordered.slice(125), ...ordered.slice(0, 125)];

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        find: jest.fn().mockImplementation((query: any) => {
          if (query?._id?.$in) {
            const pageDocs = leanCandidates
              .filter(c => query._id.$in.map(String).includes(String(c._id)))
              .map(c => ({
                _id: c._id,
                title: `Job ${c._id}`,
                preferred_date: c.preferred_date,
                preferred_time_start: c.preferred_time_start,
                created_at: c.created_at,
                service_id: { name: 'Dọn nhà' },
              }));
            return {
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(pageDocs),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              // Mô phỏng DB sort: chỉ khi service gọi .sort({ created_at: -1 })
              // thì candidates mới được xếp mới-nhất-trước (như MongoDB thật).
              sort: jest.fn().mockImplementation((arg: any) => {
                sortArg = arg;
                const sorted =
                  arg && arg.created_at === -1
                    ? [...leanCandidates].sort(
                        (a, b) => b.created_at.getTime() - a.created_at.getTime(),
                      )
                    : leanCandidates;
                return {
                  lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(sorted),
                  }),
                };
              }),
              // Code cũ (pre-P7(b)) đi thẳng .lean() không qua .sort():
              // trả candidates theo thứ tự chèn (đã xáo trộn).
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(leanCandidates),
              }),
            }),
          };
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                location: undefined,
                availability: {
                  enabled: true,
                  days_of_week: [1], // Thứ 2
                  start_time: '07:00',
                  end_time: '20:00',
                },
              }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Trang 11, limit 20 -> skip = 200; nhánh lean-scan (availability ON, tổng 250 > 200, không GPS)
      const res = await jobsService.getAvailableJobs(helperId, undefined, 11, 20);

      expect(sortArg).toEqual({ created_at: -1 });
      expect(res.total).toBe(250);
      expect(res.total_pages).toBe(13); // Math.ceil(250 / 20)
      expect(res.jobs).toHaveLength(20);
      expect(res.jobs[0]._id).toBe('job-lean-200'); // đơn mới thứ 201
      expect(res.jobs[19]._id).toBe('job-lean-219');
    });

    it('P7(c): phân trang sâu NHÁNH FALLBACK DEEP-PAGE (không-availability, CÓ GPS nhưng $geoNear lỗi, skip ≥ 200) trả về đơn ở trang cuối không bị rỗng', async () => {
      const helperId = '507f1f77bcf86cd799439011';
      let sortArg: any = null;
      let skipArg: any = null;
      let limitArg: any = null;

      const mockJobsPage13 = Array.from({ length: 10 }, (_, i) => ({
        _id: `job-page13-${i + 240}`,
        title: `Job ${i + 240}`,
        service_id: { name: 'Sửa điện' },
      }));

      const jobModel: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        // $geoNear lỗi -> rơi vào nhánh fallback (như N7(a)); CÓ GPS nên KHÔNG đi nhánh G4.
        aggregate: jest.fn().mockReturnValue({
          exec: jest.fn().mockRejectedValue(new Error('MongoServerError: 2dsphere index missing')),
        }),
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockImplementation((arg: any) => {
              sortArg = arg;
              return {
                skip: jest.fn().mockImplementation((s: number) => {
                  skipArg = s;
                  return {
                    limit: jest.fn().mockImplementation((l: number) => {
                      limitArg = l;
                      return {
                        exec: jest.fn().mockResolvedValue(s === 240 ? mockJobsPage13 : []),
                      };
                    }),
                  };
                }),
                // Nhánh fallback cũ (pre-P7(c)) gọi .limit(200) trực tiếp sau .sort():
                // trả [] để test FAIL ở assert số đơn thay vì TypeError.
                limit: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      };

      const helperModel: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                location: undefined,
                availability: { enabled: false },
              }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsService = new JobsService(
        jobModel,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      // Trang 13, limit 20 -> skip = 240; CÓ GPS (10.77, 106.68) để thoát nhánh G4,
      // $geoNear lỗi -> nhánh fallback deep-page (không-availability, skip ≥ 200).
      const res = await jobsService.getAvailableJobs(helperId, undefined, 13, 20, 10.77, 106.68);

      expect(sortArg).toEqual({ created_at: -1 });
      expect(skipArg).toBe(240);
      expect(limitArg).toBe(20);
      expect(res.total).toBe(250);
      expect(res.total_pages).toBe(13);
      expect(res.jobs).toHaveLength(10);
      expect(res.jobs[0]._id).toBe('job-page13-240');
      expect(res.jobs[9]._id).toBe('job-page13-249');
    });

    it('P7(d): is_capped và candidate_cap phản ánh chính xác khi cap áp dụng và không báo true sai', async () => {
      const helperId = '507f1f77bcf86cd799439011';

      // Case 1: Availability enabled, 250 jobs -> KHÔNG bị cap bộ nhớ 200 (quét lean toàn bộ), is_capped = false
      const leanCandidates = Array.from({ length: 250 }, (_, i) => ({
        _id: `job-avail-${i}`,
        preferred_date: new Date('2026-11-09'),
        preferred_time_start: '08:00',
      }));

      const jobModelAvail: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        find: jest.fn().mockImplementation((query: any) => {
          if (query?._id?.$in) {
            return {
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                lean: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue(leanCandidates),
                }),
              }),
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(leanCandidates),
              }),
            }),
          };
        }),
      };

      const helperModelAvail: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                availability: {
                  enabled: true,
                  days_of_week: [1],
                  start_time: '07:00',
                  end_time: '12:00',
                },
              }),
            }),
          }),
        }),
      };

      const dummy = {} as never;
      const jobsServiceAvail = new JobsService(
        jobModelAvail,
        dummy,
        dummy,
        dummy,
        helperModelAvail,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const resAvail = await jobsServiceAvail.getAvailableJobs(helperId, undefined, 1, 10);
      expect(resAvail.availability_filtered).toBe(true);
      expect(resAvail.is_capped).toBe(false);
      expect(resAvail.candidate_cap).toBeUndefined();

      // Case 2: Availability disabled, fallback in-memory sort với 250 jobs (> 200) -> is_capped = true, candidate_cap = 200
      const jobModelFallback: any = {
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(250) }),
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };

      const helperModelFallback: any = {
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: helperId,
                verification_status: 'approved',
                location: { coordinates: [106.68, 10.77] },
                availability: { enabled: false },
              }),
            }),
          }),
        }),
      };

      const jobsServiceFallback = new JobsService(
        jobModelFallback,
        dummy,
        dummy,
        dummy,
        helperModelFallback,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as any,
        dummy,
        dummy,
        dummy,
        dummy,
      );

      const resFallback = await jobsServiceFallback.getAvailableJobs(
        helperId,
        undefined,
        1,
        10,
        10.77,
        106.68,
      );
      expect(resFallback.availability_filtered).toBe(false);
      expect(resFallback.is_capped).toBe(true);
      expect(resFallback.candidate_cap).toBe(MAX_FEED_SORT_CANDIDATES);
    });
  });
});
