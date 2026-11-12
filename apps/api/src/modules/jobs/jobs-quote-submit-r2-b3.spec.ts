/**
 * R2-B3: submitQuote must not turn a persisted quote into a failed response.
 *
 * LIVE 2026-11-12 19:47/19:51: helper submitted 70.000₫ on job C twice — the
 * form never self-closed (error toast), reload showed no quote on either
 * side, and the second submit raised NO Conflict.
 *
 * Prime suspect EXONERATED by this spec (real Mongoose documents on
 * MongoMemoryServer, not fakes): the R1 F3 EXPIRED-reuse path
 * (`existing.save()` on the old EXPIRED row) works — R2-B3-1 passes on OLD
 * code (9515dd7) too. The fresh-create path, the no-service_id job path and
 * the read path (customer + helper) were also verified against real
 * documents during the investigation and all work.
 *
 * REAL DEFECT found in the submit-to-persist chain (R2-B3-2..6): the quote
 * write is the commit point, but every step AFTER it ran unguarded — a
 * failure in syncJobQuotesState, the helper $inc, gateway.emitToUser or
 * notifyNewQuote threw AFTER `existing.save()` / `quoteModel.create()` had
 * already committed, so the API answered 500 while the quote sat PENDING
 * in the DB. The app then shows an error toast, keeps the form open, and a
 * retry meets a confusing Conflict for a quote the helper was just told
 * failed. Fix: post-write fan-out is best-effort (log + return success).
 *
 * R2-B3-1 passes on old code (exoneration); R2-B3-2..6 FAIL on old code
 * (submitQuote rejects) and PASS after the fix (submitQuote resolves and
 * the quote is PENDING in the DB).
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { Job, JobSchema, Quote, QuoteSchema, Contract, ContractSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  JobStatus,
  QuoteStatus,
  VerificationStatus,
  HelperStatus,
  UserStatus,
} from '@homemate/types';

describe('JobsService submitQuote (R2-B3, real documents)', () => {
  let mongod: MongoMemoryServer;
  let JobModel: any;
  let QuoteModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let gateway: any;
  let notifications: any;

  function buildService(notifOverride?: any, gatewayOverride?: any): JobsService {
    const dummy = {} as never;
    return new JobsService(
      JobModel,
      QuoteModel,
      dummy,
      ServiceModel,
      HelperModel,
      dummy,
      dummy,
      gatewayOverride ?? gateway,
      notifOverride ?? notifications,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
    );
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    JobModel = mongoose.models[Job.name] ?? mongoose.model(Job.name, JobSchema);
    QuoteModel = mongoose.models[Quote.name] ?? mongoose.model(Quote.name, QuoteSchema);
    mongoose.models[Contract.name] ?? mongoose.model(Contract.name, ContractSchema);
    ServiceModel = mongoose.models[Service.name] ?? mongoose.model(Service.name, ServiceSchema);
    HelperModel =
      mongoose.models[HelperProfile.name] ??
      mongoose.model(HelperProfile.name, HelperProfileSchema);
    mongoose.models[User.name] ?? mongoose.model(User.name, UserSchema);
    gateway = { emitToUser: jest.fn(), emitToJob: jest.fn() };
    notifications = {
      notifyNewQuote: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({}),
    };
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  /** Seeds a job C look-alike + an EXPIRED quote row from the same helper. */
  async function seed(opts: { quoteStatus?: string } = {}) {
    const db = mongoose.connection.db!;
    await db.dropDatabase();
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    await db.collection('users').insertMany([
      {
        _id: helperId,
        phone: '0365290805',
        full_name: 'Nguyễn Văn Vinh',
        status: UserStatus.ACTIVE,
        is_verified: true,
        password_hash: 'probe',
      },
      {
        _id: customerId,
        phone: '0334818713',
        full_name: 'Khách',
        status: UserStatus.ACTIVE,
        is_verified: true,
        password_hash: 'probe',
      },
    ]);
    await HelperModel.create({
      user_id: helperId,
      verification_status: VerificationStatus.APPROVED,
      status: HelperStatus.ONLINE,
    });
    const serviceId = new Types.ObjectId();
    await db.collection('services').insertOne({
      _id: serviceId,
      category_id: new Types.ObjectId(),
      name: 'Dọn nhà',
      slug: 'don-nha',
      description: 'probe',
      platform_fee_percent: 15,
    });
    const job = await JobModel.create({
      customer_id: customerId,
      service_id: serviceId,
      title: 'Job C probe',
      description: 'probe',
      status: JobStatus.OPEN,
      address: {
        full_address: '1 Test St',
        district: 'Quận 1',
        city: 'Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.7, 10.77] },
      },
      preferred_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      estimated_duration: 3,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    let quote: any = null;
    if (opts.quoteStatus) {
      quote = await QuoteModel.create({
        job_id: job._id,
        helper_id: helperId,
        status: opts.quoteStatus,
        labor_cost: 70000,
        materials_cost: 0,
        total_price: 70000,
        platform_fee: 10500,
        helper_receives: 59500,
        estimated_duration: 2,
        warranty_days: 0,
        expires_at: new Date(Date.now() - 60 * 60 * 1000),
      });
    }
    return { customerId, helperId, job, quote };
  }

  /** Exact payload the mobile/web quote form sends (labor 70.000₫, 3h). */
  function submit(svc: JobsService, helperId: Types.ObjectId, job: any) {
    return svc.submitQuote(String(helperId), String(job._id), {
      labor_cost: 70000,
      estimated_duration: 3,
    } as never);
  }

  async function dbQuote(job: any, helperId: Types.ObjectId) {
    return QuoteModel.findOne({ job_id: job._id, helper_id: helperId }).lean();
  }

  it('R2-B3-1 (exoneration): EXPIRED reuse on a REAL document persists PENDING, visible both sides', async () => {
    const { customerId, helperId, job } = await seed({ quoteStatus: QuoteStatus.EXPIRED });
    const svc = buildService();

    const res = await submit(svc, helperId, job);

    expect((res as any).status).toBe(QuoteStatus.PENDING);
    const row = await dbQuote(job, helperId);
    expect(row?.status).toBe(QuoteStatus.PENDING);
    expect(row?.total_price).toBe(70000);
    const jobAfter = await JobModel.findById(job._id).lean();
    expect(jobAfter?.status).toBe(JobStatus.RECEIVING_QUOTES);
    expect(jobAfter?.total_quotes_count).toBe(1);
    expect(
      (await svc.getJobQuotes(String(job._id), String(customerId), 'customer')) as any[],
    ).toHaveLength(1);
    expect(
      (await svc.getJobQuotes(String(job._id), String(helperId), 'helper')) as any[],
    ).toHaveLength(1);
    // A re-submit now MUST Conflict (a PENDING row exists) — the live second
    // submit did not, so no PENDING row had persisted from the first.
    await expect(submit(svc, helperId, job)).rejects.toMatchObject({ status: 409 });
  }, 60000);

  it('R2-B3-2: notifyNewQuote throws AFTER save → submit still resolves, quote PENDING', async () => {
    const { helperId, job } = await seed({ quoteStatus: QuoteStatus.EXPIRED });
    const throwingNotif = {
      notifyNewQuote: jest.fn().mockRejectedValue(new Error('FCM boom')),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({}),
    };
    const svc = buildService(throwingNotif);

    const res = await submit(svc, helperId, job);

    expect((res as any).status).toBe(QuoteStatus.PENDING);
    expect((await dbQuote(job, helperId))?.status).toBe(QuoteStatus.PENDING);
  }, 60000);

  it('R2-B3-3: gateway.emitToUser throws AFTER save → submit still resolves, quote PENDING', async () => {
    const { helperId, job } = await seed({ quoteStatus: QuoteStatus.EXPIRED });
    const throwingGw = {
      emitToUser: jest.fn(() => {
        throw new Error('socket boom');
      }),
      emitToJob: jest.fn(),
    };
    const svc = buildService(undefined, throwingGw);

    const res = await submit(svc, helperId, job);

    expect((res as any).status).toBe(QuoteStatus.PENDING);
    expect((await dbQuote(job, helperId))?.status).toBe(QuoteStatus.PENDING);
  }, 60000);

  it('R2-B3-4: syncJobQuotesState throws AFTER save → submit still resolves, quote PENDING', async () => {
    const { helperId, job } = await seed({ quoteStatus: QuoteStatus.EXPIRED });
    const svc = buildService();
    const origCountDocuments = (QuoteModel as any).countDocuments;
    (QuoteModel as any).countDocuments = () => ({
      exec: async () => {
        throw new Error('sync boom');
      },
    });
    try {
      const res = await submit(svc, helperId, job);
      expect((res as any).status).toBe(QuoteStatus.PENDING);
    } finally {
      (QuoteModel as any).countDocuments = origCountDocuments;
    }
    expect((await dbQuote(job, helperId))?.status).toBe(QuoteStatus.PENDING);
  }, 60000);

  it('R2-B3-5: helper total_quotes_sent $inc throws AFTER save → submit still resolves, quote PENDING', async () => {
    const { helperId, job } = await seed({ quoteStatus: QuoteStatus.EXPIRED });
    const svc = buildService();
    const origUpdateOne = (HelperModel as any).updateOne;
    (HelperModel as any).updateOne = () => ({
      exec: async () => {
        throw new Error('inc boom');
      },
    });
    try {
      const res = await submit(svc, helperId, job);
      expect((res as any).status).toBe(QuoteStatus.PENDING);
    } finally {
      (HelperModel as any).updateOne = origUpdateOne;
    }
    expect((await dbQuote(job, helperId))?.status).toBe(QuoteStatus.PENDING);
  }, 60000);

  it('R2-B3-6: fresh create + notifyNewQuote throws → submit still resolves, quote PENDING', async () => {
    const { helperId, job } = await seed({});
    const throwingNotif = {
      notifyNewQuote: jest.fn().mockRejectedValue(new Error('FCM boom')),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({}),
    };
    const svc = buildService(throwingNotif);

    const res = await submit(svc, helperId, job);

    expect((res as any).status).toBe(QuoteStatus.PENDING);
    expect((await dbQuote(job, helperId))?.status).toBe(QuoteStatus.PENDING);
  }, 60000);
});
