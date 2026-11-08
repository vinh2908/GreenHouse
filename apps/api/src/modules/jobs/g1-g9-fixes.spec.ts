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
      jest.spyOn(routingService, 'getRoutesBatch').mockResolvedValue(
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
});
