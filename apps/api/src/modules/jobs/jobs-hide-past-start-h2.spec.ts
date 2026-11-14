/**
 * R7 item 2 (Vinh, decided 2026-11-14): "quá giờ hẹn thì ẩn hết bên thợ" —
 * once a job's scheduled start has passed AND no helper is assigned yet, the
 * job must be hidden from the helper side entirely (feed, skipped list,
 * demand map) AND the quote endpoint must reject new quotes on it (server
 * guard, not just a UI filter). Exceptions: the job stays visible to the
 * CUSTOMER, and stays visible to a helper who was ALREADY assigned to it
 * (accepted + contract — an in-progress job is not hidden from its helper).
 *
 * Two layers, one rule (`isPastStartUnassigned` in jobs.service.ts):
 *  (1) DB layer `pastStartDateFilter` — excludes jobs whose scheduled DATE
 *      is before today (VN) from the helper-facing queries (works in every
 *      feed path incl. $geoNear, plain field predicate, no $expr);
 *  (2) exact in-memory post-filter — hides today's jobs whose TIME has
 *      passed (date + time only combine into one instant in memory).
 * There is no separate helper job-search endpoint in the API (feed +
 * skipped + demand-map are the helper discovery surfaces), so those three
 * plus the submitQuote/acceptFixedPrice guards are the complete surface.
 *
 * FAILS on base 85fd7ba (H2-1..H2-3, H2-5: the past-start job is still
 * listed / quotable); passes after the fix. H2-0/H2-4 are controls that
 * pass on both.
 *
 * HARNESS: real mongod from the cached binary. Port 27122 / dbpath
 * /tmp/mongo-r7-a-2 (B7's spec uses 27121 — separate ports so the two
 * suites can run in parallel without clashing).
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import mongoose, { Types } from 'mongoose';
import {
  JobsService,
  isPastStartUnassigned,
  pastStartDateFilter,
  jobScheduledStart,
} from './jobs.service';
import { Job, JobSchema, Quote, QuoteSchema, Contract, ContractSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventSchema,
} from '../helpers/schemas/helper-penalty-event.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  JobStatus,
  QuoteStatus,
  VerificationStatus,
  HelperStatus,
  UserStatus,
  UserRole,
} from '@homemate/types';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r7-a-2';
const PORT = 27122;

describe('Hide past-start unassigned jobs from helpers (R7 item 2, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let QuoteModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;

  async function seed() {
    const customer = await UserModel.create({
      phone: '0900000001',
      full_name: 'Khách Test',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER],
      active_role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    const helperUser = await UserModel.create({
      phone: '0900000002',
      full_name: 'Nguyễn Văn Vinh',
      password_hash: 'x',
      roles: [UserRole.HELPER],
      active_role: UserRole.HELPER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    await HelperModel.create({
      user_id: helperUser._id,
      verification_status: VerificationStatus.APPROVED,
      status: HelperStatus.ONLINE,
      location: { type: 'Point', coordinates: [108.2, 16.05] },
      rating: 5,
      completed_jobs: 10,
    });
    const svc = await ServiceModel.create({
      category_id: new Types.ObjectId(),
      name: 'Giúp việc theo giờ',
      slug: 'giup-viec-theo-gio',
      description: 'Dọn nhà theo giờ',
      platform_fee_percent: 15,
    });
    const base = {
      customer_id: customer._id,
      service_id: svc._id,
      description: 'Dọn nhà 2 phòng',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    };
    const addressFor = (district: string) => ({
      full_address: `123 Lê Lợi, ${district}`,
      district,
      city: 'Đà Nẵng',
      location: { type: 'Point', coordinates: [108.21, 16.06] },
    });
    // A: past start (yesterday 10:00), unassigned, still OPEN.
    const pastJob = await JobModel.create({
      ...base,
      title: 'TEST H2 past start',
      address: addressFor('Hải Châu'),
      status: JobStatus.OPEN,
      preferred_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
    });
    // B: future start (tomorrow 10:00), unassigned, OPEN.
    const futureJob = await JobModel.create({
      ...base,
      title: 'TEST H2 future start',
      address: addressFor('Sơn Trà'),
      status: JobStatus.OPEN,
      preferred_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
    });
    // C: past start but ASSIGNED (helper accepted + contract) — must stay
    // visible to its own helper.
    const assignedJob = await JobModel.create({
      ...base,
      title: 'TEST H2 assigned past start',
      address: addressFor('Ngũ Hành Sơn'),
      status: JobStatus.CONFIRMED,
      helper_id: helperUser._id,
      preferred_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
    });
    await conn.model(Contract.name).create({
      job_id: assignedJob._id,
      customer_id: customer._id,
      helper_id: helperUser._id,
      labor_cost: 70000,
      materials_cost: 0,
      total_price: 70000,
      platform_fee: 10500,
      helper_receives: 59500,
      scheduled_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      signed_by_customer_at: new Date(),
    });
    return { customer, helperUser, pastJob, futureJob, assignedJob };
  }

  const quoteDto = {
    labor_cost: 70000,
    materials_cost: 0,
    estimated_duration: 2,
  } as never;

  beforeAll(async () => {
    spawnSync(MONGOD, ['--dbpath', DBPATH, '--shutdown'], { stdio: 'ignore' });
    fs.rmSync(DBPATH, { recursive: true, force: true });
    fs.mkdirSync(DBPATH, { recursive: true });
    const child = spawn(
      MONGOD,
      [
        '--dbpath',
        DBPATH,
        '--port',
        String(PORT),
        '--bind_ip',
        '127.0.0.1',
        '--logpath',
        '/tmp/mongo-r7-a-2-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/h2`);
    await new Promise<void>((resolve, reject) => {
      conn.once('connected', () => resolve());
      conn.once('error', reject);
    });

    JobModel = conn.model(Job.name, JobSchema);
    QuoteModel = conn.model(Quote.name, QuoteSchema);
    conn.model(Contract.name, ContractSchema);
    ServiceModel = conn.model(Service.name, ServiceSchema);
    HelperModel = conn.model(HelperProfile.name, HelperProfileSchema);
    conn.model(HelperPenaltyEvent.name, HelperPenaltyEventSchema);
    UserModel = conn.model(User.name, UserSchema);

    service = new JobsService(
      JobModel,
      QuoteModel,
      conn.model(Contract.name) as never,
      ServiceModel,
      HelperModel,
      conn.model(HelperPenaltyEvent.name) as never,
      UserModel,
      { emitToUser: jest.fn(), emitToJob: jest.fn() } as never,
      {
        create: jest.fn().mockResolvedValue({}),
        notifyNewQuote: jest.fn().mockResolvedValue(undefined),
        notifyAdmins: jest.fn().mockResolvedValue(undefined),
        notifyQuoteAccepted: jest.fn().mockResolvedValue(undefined),
        notifyQuoteRejected: jest.fn().mockResolvedValue(undefined),
      } as never,
      { getOrCreateConversation: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
  });

  afterAll(async () => {
    try {
      await Promise.race([conn.close(), sleep(5000)]);
    } catch {
      /* ignore */
    }
    spawnSync(MONGOD, ['--dbpath', DBPATH, '--shutdown'], { stdio: 'ignore' });
    fs.rmSync(DBPATH, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await JobModel.deleteMany({});
    await QuoteModel.deleteMany({});
    await conn.model(Contract.name).deleteMany({});
    await ServiceModel.deleteMany({});
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  it('H2-0 (control): a future-start job lists in the feed on any code', async () => {
    const { helperUser, futureJob } = await seed();
    const feed = await service.getAvailableJobs(String(helperUser._id));
    expect(feed.jobs.map((j: any) => String(j._id))).toContain(String(futureJob._id));
  });

  it('H2-1: past-start unassigned job is hidden from the helper feed', async () => {
    const { helperUser, pastJob, futureJob } = await seed();
    const feed = await service.getAvailableJobs(String(helperUser._id));
    const ids = feed.jobs.map((j: any) => String(j._id));
    expect(ids).not.toContain(String(pastJob._id));
    expect(ids).toContain(String(futureJob._id));
  });

  it('H2-2: past-start unassigned job is hidden from skipped list + demand map', async () => {
    const { helperUser, pastJob, futureJob } = await seed();
    // Demand map first (before any reject — rejected jobs are excluded from
    // the map by the rejected_helper_ids filter regardless of start time).
    const rows = await service.getDemandMap(String(helperUser._id));
    const haiChau = rows.find((r: any) => r.district === 'Hải Châu');
    const sonTra = rows.find((r: any) => r.district === 'Sơn Trà');
    expect(haiChau).toBeUndefined();
    expect(sonTra?.open_jobs).toBe(1);

    // Helper skipped both jobs — the skipped list must still hide the past one.
    await service.rejectJob(String(helperUser._id), String(pastJob._id));
    await service.rejectJob(String(helperUser._id), String(futureJob._id));
    const skipped = await service.getSkippedJobs(String(helperUser._id));
    const skippedIds = skipped.jobs.map((j: any) => String(j._id));
    expect(skippedIds).not.toContain(String(pastJob._id));
    expect(skippedIds).toContain(String(futureJob._id));
  });

  it('H2-3: submitQuote rejects a past-start unassigned job, accepts a future one', async () => {
    const { helperUser, pastJob, futureJob } = await seed();
    await expect(
      service.submitQuote(String(helperUser._id), String(pastJob._id), quoteDto),
    ).rejects.toThrow('Đã quá giờ hẹn');
    const quote = await service.submitQuote(
      String(helperUser._id),
      String(futureJob._id),
      quoteDto,
    );
    expect(quote.status).toBe(QuoteStatus.PENDING);
  });

  it('H2-4 (exception control): an assigned past-start job stays visible to its helper', async () => {
    const { helperUser, assignedJob } = await seed();
    const mine = (await service.getHelperJobs(String(helperUser._id))) as any[];
    expect(mine.map((j: any) => String(j._id))).toContain(String(assignedJob._id));
    expect(isPastStartUnassigned(assignedJob as any)).toBe(false);
  });

  it('H2-5: rescheduling to the future (B7) makes the job visible + quotable again', async () => {
    const { customer, helperUser, pastJob } = await seed();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateKey = new Date(tomorrow.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await service.updateJob(String(customer._id), String(pastJob._id), {
      preferred_date: dateKey,
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
    } as never);
    const feed = await service.getAvailableJobs(String(helperUser._id));
    expect(feed.jobs.map((j: any) => String(j._id))).toContain(String(pastJob._id));
    const quote = await service.submitQuote(String(helperUser._id), String(pastJob._id), quoteDto);
    expect(quote.status).toBe(QuoteStatus.PENDING);
  });

  it('H2-6: the DB layer (pastStartDateFilter) excludes past dates, keeps today/future/no-date', async () => {
    const { pastJob, futureJob } = await seed();
    const todayJob = await JobModel.create({
      customer_id: new Types.ObjectId(),
      service_id: new Types.ObjectId(),
      title: 'today',
      description: 'x',
      address: {
        full_address: 'x',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.OPEN,
      preferred_date: new Date(),
      preferred_time_start: '10:00',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    const noDateJob = await JobModel.create({
      customer_id: new Types.ObjectId(),
      service_id: new Types.ObjectId(),
      title: 'nodate',
      description: 'x',
      address: {
        full_address: 'x',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.OPEN,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    const found = await JobModel.find({
      status: JobStatus.OPEN,
      $and: [pastStartDateFilter(new Date())],
    })
      .select('_id')
      .lean();
    const ids = found.map((j: any) => String(j._id));
    expect(ids).not.toContain(String(pastJob._id));
    expect(ids).toContain(String(futureJob._id));
    expect(ids).toContain(String(todayJob._id));
    expect(ids).toContain(String(noDateJob._id));
  });

  it('H2-7 (pure rule): start instant parsing + no-date/flexible jobs never hidden', () => {
    expect(
      jobScheduledStart({ preferred_date: '2026-11-14', preferred_time_start: '10:00' }),
    ).toEqual(new Date('2026-11-14T10:00:00+07:00'));
    expect(
      jobScheduledStart({ preferred_date: '2026-11-14', preferred_time_start: '' }),
    ).toBeNull();
    expect(isPastStartUnassigned({ preferred_date: null, preferred_time_start: null })).toBe(false);
    expect(
      isPastStartUnassigned({
        preferred_date: new Date(Date.now() - 3600_000),
        preferred_time_start: '00:00',
        helper_id: new Types.ObjectId(),
      }),
    ).toBe(false);
  });
});
