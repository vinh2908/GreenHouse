import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { Job, Quote, Contract } from './schemas/job.schema';
import { Service } from '../services/schemas/service.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { HelperPenaltyEvent } from '../helpers/schemas/helper-penalty-event.schema';
import { User } from '../users/schemas/user.schema';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { PaymentsService } from '../payments/payments.service';
import { RoutingService } from './routing.service';
import { FavoritesService } from '../favorites/favorites.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DisputesService } from './disputes.service';
import {
  JobStatus,
  QuoteStatus,
  VerificationStatus,
  HelperStatus,
  UserStatus,
} from '@homemate/types';
import { Types } from 'mongoose';

/**
 * Spec B3: báo giá biến mất cả 2 bên ~15 phút sau khi gửi (live 2026-11-12).
 *
 * Cơ chế đã xác minh bằng đọc code (không có log/DB production để đối chiếu
 * trực tiếp, xem ghi chú cuối file):
 * - Sweep 5 phút `sweepExpiredJobsAndQuotes` lật báo giá PENDING → EXPIRED
 *   (bước 3: hết hạn riêng lẻ; bước 1: đơn hết hạn → toàn bộ báo giá
 *   EXPIRED). Cả 2 bước đều KHÔNG đồng bộ lại đơn, nên đơn kẹt ở
 *   RECEIVING_QUOTES ("Có báo giá") với total_quotes_count cũ trong khi
 *   getJobQuotes đã loại EXPIRED khỏi cả 2 phía (customer: chỉ
 *   PENDING/REJECTED/ACCEPTED; helper: chỉ PENDING) — đúng hiện tượng
 *   "Danh sách thợ báo giá (0)" + thợ không còn thấy mục báo giá của mình.
 * - `rejectQuote` cũng lật PENDING → REJECTED mà không sync (cùng lỗi
 *   stale-label).
 * - `submitQuote` hứa báo giá sống 24h (JOB_QUOTE_EXPIRY_HOURS) nhưng
 *   không nhìn `job.expires_at`: đơn SOS chỉ mở 2 giờ (createSosJob),
 *   đơn thường 72 giờ — báo giá có thể bị sweep của đơn giết chỉ vài
 *   phút sau khi gửi.
 * - Lỗi nền CHỨNG MINH ĐƯỢC bằng chạy code: bước 1 gọi
 *   `addEvent(job, EXPIRED, 'system', ...)` mà addEvent làm
 *   `new Types.ObjectId('system')` → ném BSONError TRƯỚC job.save(),
 *   nên đơn hết hạn không bao giờ được lưu EXPIRED, báo giá của nó
 *   không bao giờ được lật, và exception lan ra ngoài làm bước 2–4
 *   của sweep bị bỏ qua ở tick đó — sweep kẹt vĩnh viễn từ lúc có đơn
 *   đầu tiên hết hạn. Fix: addEvent chịu được actor 'system' (sentinel
 *   ObjectId 0) + từng đơn hết hạn được bọc try/catch riêng.
 *
 * Các test dưới đây chạy hàm service THẬT với model fake trong bộ nhớ và
 * PHẢI FAIL trên code cũ, PASS sau fix.
 */

// ─── Harness: model fake trong bộ nhớ ───────────────────────────────────────

function matches(doc: any, filter: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(filter ?? {})) {
    const value = doc?.[key];
    if (
      cond &&
      typeof cond === 'object' &&
      !(cond instanceof Date) &&
      !Array.isArray(cond) &&
      !(cond instanceof Types.ObjectId)
    ) {
      if ('$in' in cond) {
        if (!cond.$in.some((v: any) => String(v) === String(value))) return false;
      }
      if ('$ne' in cond && String(value) === String(cond.$ne)) return false;
      if ('$exists' in cond) {
        const exists = value !== undefined && value !== null;
        if (cond.$exists ? !exists : exists) return false;
      }
      if ('$lte' in cond && !(value <= cond.$lte)) return false;
      if ('$gte' in cond && !(value >= cond.$gte)) return false;
      if ('$gt' in cond && !(value > cond.$gt)) return false;
      if ('$lt' in cond && !(value < cond.$lt)) return false;
    } else if (cond instanceof Date && value instanceof Date) {
      if (cond.getTime() !== value.getTime()) return false;
    } else if (String(value) !== String(cond)) {
      return false;
    }
  }
  return true;
}

/** Query fake: .exec() / .select() / .lean() / .sort() / .populate() đều chain được. */
function fakeQuery<T>(value: T): any {
  const q: any = {
    exec: async () => value,
    select: () => q,
    lean: () => q,
    sort: () => q,
    populate: () => q,
  };
  return q;
}

describe('JobsService quote expiry (B3)', () => {
  let service: JobsService;
  let jobs: Map<string, any>;
  let quotes: any[];
  let jobModel: any;
  let quoteModel: any;
  let helperModel: any;
  let serviceModel: any;
  let notificationsService: any;

  function makeJob(overrides: Record<string, any> = {}): any {
    const job: any = {
      _id: new Types.ObjectId(),
      customer_id: new Types.ObjectId(),
      service_id: new Types.ObjectId(),
      status: JobStatus.RECEIVING_QUOTES,
      title: 'TEST Q7-SOS',
      total_quotes_count: 1,
      preferred_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
      events: [],
      save: async function (this: any) {
        jobs.set(String(this._id), this);
        return this;
      },
      ...overrides,
    };
    jobs.set(String(job._id), job);
    return job;
  }

  function makeQuote(jobId: Types.ObjectId, helperId: Types.ObjectId, overrides: any = {}): any {
    const quote: any = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: helperId,
      status: QuoteStatus.PENDING,
      labor_cost: 70000,
      materials_cost: 0,
      total_price: 70000,
      platform_fee: 0,
      helper_receives: 70000,
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      save: async function (this: any) {
        return this;
      },
      ...overrides,
    };
    quotes.push(quote);
    return quote;
  }

  beforeEach(async () => {
    jobs = new Map();
    quotes = [];

    jobModel = {
      find: jest.fn((filter: any) => fakeQuery([...jobs.values()].filter(j => matches(j, filter)))),
      findById: jest.fn((id: any) => fakeQuery(jobs.get(String(id)) ?? null)),
      countDocuments: jest.fn((filter: any) =>
        fakeQuery([...jobs.values()].filter(j => matches(j, filter)).length),
      ),
      findOneAndUpdate: jest.fn((filter: any, update: any) => {
        const job = [...jobs.values()].find(j => matches(j, filter));
        if (job && update?.$set) Object.assign(job, update.$set);
        return fakeQuery(job ?? null);
      }),
      updateOne: jest.fn(() => fakeQuery({})),
    };

    quoteModel = {
      find: jest.fn((filter: any) => fakeQuery(quotes.filter(q => matches(q, filter)))),
      findById: jest.fn((id: any) =>
        fakeQuery(quotes.find(q => String(q._id) === String(id)) ?? null),
      ),
      findOne: jest.fn((filter: any) => fakeQuery(quotes.find(q => matches(q, filter)) ?? null)),
      countDocuments: jest.fn((filter: any) =>
        fakeQuery(quotes.filter(q => matches(q, filter)).length),
      ),
      distinct: jest.fn((field: string, filter: any) =>
        fakeQuery([...new Set(quotes.filter(q => matches(q, filter)).map(q => String(q[field])))]),
      ),
      updateMany: jest.fn((filter: any, update: any) => {
        let modifiedCount = 0;
        for (const q of quotes) {
          if (matches(q, filter)) {
            if (update?.$set) Object.assign(q, update.$set);
            modifiedCount++;
          }
        }
        return fakeQuery({ modifiedCount });
      }),
      updateOne: jest.fn((filter: any, update: any) => {
        const q = quotes.find(x => matches(x, filter));
        if (q && update?.$set) Object.assign(q, update.$set);
        return fakeQuery({});
      }),
      create: jest.fn(async (dto: any) => {
        const doc: any = {
          _id: new Types.ObjectId(),
          status: QuoteStatus.PENDING,
          ...dto,
          save: async function (this: any) {
            return this;
          },
        };
        quotes.push(doc);
        return doc;
      }),
    };

    helperModel = {
      findOne: jest.fn(() =>
        fakeQuery({
          user_id: { full_name: 'Nguyễn Văn Vinh', status: UserStatus.ACTIVE, is_verified: true },
          verification_status: VerificationStatus.APPROVED,
          status: HelperStatus.ONLINE,
        }),
      ),
      updateOne: jest.fn(() => fakeQuery({})),
    };

    serviceModel = {
      findById: jest.fn(() => fakeQuery({ platform_fee_percent: 15 })),
    };

    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
      notifyNewQuote: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        { provide: getModelToken(Quote.name), useValue: quoteModel },
        {
          provide: getModelToken(Contract.name),
          useValue: { findOne: jest.fn(() => fakeQuery(null)) },
        },
        { provide: getModelToken(Service.name), useValue: serviceModel },
        { provide: getModelToken(HelperProfile.name), useValue: helperModel },
        { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        {
          provide: AppGateway,
          useValue: { emitToJob: jest.fn(), emitToUser: jest.fn() },
        },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('B3-1: sweep hết hạn báo giá riêng lẻ → đơn hết báo giá phải về OPEN + count 0 (không còn nhãn "Có báo giá" giả)', async () => {
    const helperId = new Types.ObjectId();
    // Đơn còn hạn 72h nhưng báo giá đã quá hạn riêng lẻ (expires_at đã qua).
    const job = makeJob({ status: JobStatus.RECEIVING_QUOTES, total_quotes_count: 1 });
    const quote = makeQuote(job._id, helperId, {
      expires_at: new Date(Date.now() - 60 * 60 * 1000),
    });

    await service.sweepExpiredJobsAndQuotes();

    expect(quote.status).toBe(QuoteStatus.EXPIRED);
    // Code cũ: job vẫn RECEIVING_QUOTES + total_quotes_count 1 → test này FAIL.
    expect(job.status).toBe(JobStatus.OPEN);
    expect(job.total_quotes_count).toBe(0);
  });

  it('B3-2: sweep hết hạn đơn → đơn EXPIRED và total_quotes_count reset 0 (báo giá cũng EXPIRED)', async () => {
    const helperId = new Types.ObjectId();
    const job = makeJob({
      status: JobStatus.RECEIVING_QUOTES,
      total_quotes_count: 1,
      // Đơn hết hạn 1 giờ trước (vd: đơn SOS tạo cách đây > 2 giờ).
      expires_at: new Date(Date.now() - 60 * 60 * 1000),
    });
    const quote = makeQuote(job._id, helperId, {
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await service.sweepExpiredJobsAndQuotes();

    expect(job.status).toBe(JobStatus.EXPIRED);
    expect(quote.status).toBe(QuoteStatus.EXPIRED);
    // Code cũ: total_quotes_count vẫn 1 → test này FAIL.
    expect(job.total_quotes_count).toBe(0);
  });

  it('B3-3: khách từ chối báo giá PENDING cuối cùng → đơn phải về OPEN + count 0', async () => {
    const helperId = new Types.ObjectId();
    const job = makeJob({ status: JobStatus.RECEIVING_QUOTES, total_quotes_count: 1 });
    const quote = makeQuote(job._id, helperId, { status: QuoteStatus.PENDING });

    await service.rejectQuote(String(job.customer_id), String(job._id), String(quote._id));

    expect(quote.status).toBe(QuoteStatus.REJECTED);
    // Code cũ: rejectQuote không sync → job vẫn RECEIVING_QUOTES → FAIL.
    expect(job.status).toBe(JobStatus.OPEN);
    expect(job.total_quotes_count).toBe(0);
  });

  it('B3-4: submitQuote trên đơn sắp hết hạn (cửa sổ còn 1 giờ) → hạn báo giá bị capped ở hạn đơn, không hứa 24h giả', async () => {
    const helperId = new Types.ObjectId();
    const jobExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const job = makeJob({
      status: JobStatus.OPEN,
      total_quotes_count: 0,
      expires_at: jobExpiresAt,
    });

    const created = await service.submitQuote(String(helperId), String(job._id), {
      labor_cost: 70000,
      materials_cost: 0,
      estimated_duration: 2,
    } as never);

    // Code cũ: expires_at = now + 24h → test này FAIL.
    expect(new Date((created as any).expires_at).getTime()).toBe(jobExpiresAt.getTime());
    expect((created as any).status).toBe(QuoteStatus.PENDING);
    expect(job.status).toBe(JobStatus.RECEIVING_QUOTES);
    expect(job.total_quotes_count).toBe(1);
  });
});

/**
 * GHI CHÚ — điều chưa chứng minh được nếu không có log/DB production:
 * Với code hiện tại, submitQuote gán expires_at = now + 24h (đã kiểm bằng
 * node: setHours(+24) đúng +24h tuyệt đối, hằng JOB_QUOTE_EXPIRY_HOURS = 24
 * trong mọi bản). Nên sweep bước 3 chỉ giết được báo giá khi expires_at
 * trong DB đã qua — tức là hoặc báo giá đó không phải hàng mới tạo lúc
 * 18:17, hoặc cửa sổ của ĐƠN (bước 1) đã tới: đơn SOS chỉ mở 2 giờ
 * (createSosJob, jobs.service.ts ~1486), đơn thường 72 giờ. Không có
 * created_at/expires_at thật của job C (6af59fdfbb2b94f98da7e888) và log
 * sweep thì không phân biệt được 2 nhánh này. Fix ở đây sửa cả 2 nhánh
 * (sync sau sweep bước 1 + bước 3, reset count, cap hạn báo giá ở hạn
 * đơn) để dù nhánh nào đã nổ thì trạng thái đơn cũng tự sửa đúng và
 * báo giá mới không còn bị hứa 24h giả.
 */
