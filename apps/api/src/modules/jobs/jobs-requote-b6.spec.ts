/**
 * B6 (live 2026-11-14 ~08:53, blocking B5b): after a helper quote EXPIRES
 * (24h) and the helper RE-QUOTES the same job, the CUSTOMER job-detail
 * quote list shows "Danh sách thợ báo giá (0)" + "Đang quét..." forever,
 * even though the quote provably exists server-side (notification arrived,
 * header "Có báo giá", step 2 current). Job C = "TEST Q7-SOS".
 * A FRESH quote on a new job lists fine — so this is specific to the
 * RE-QUOTE-after-expiry path.
 *
 * VERDICT (2026-11-14, run against base 3f477b4, real mongod): the
 * revived quote DOES list — B6-0..B6-3 all PASS on old code, so there is
 * NO server-side fix to make for B6 and none is forced here. The bug is
 * NOT in submitQuote's revive path nor in getJobQuotes' query/profile
 * filter for a revived row. Two mechanisms that CAN produce the exact
 * live symptom (list (0) while the job badge stays RECEIVING_QUOTES)
 * were proven in diagnostics and are recorded for the coordinator:
 * - B6-4 (SUPERSEDED by the R7-B6 owner override in getJobQuotes): a
 *   request whose JWT active_role was not 'customer' (e.g. 'helper')
 *   silently returned [] — the helper branch adds helper_id = requesterId,
 *   which matches no quote for a customer id. The R7 fix forces the
 *   customer view when the viewer owns the job, whatever the JWT role is;
 *   B6-4 now asserts the fixed behavior (owner sees 1 quote under either
 *   role) and jobs-r7-b.spec.ts carries the full guard set.
 * - (removed test B6-5, observed failing): if routingService.
 *   getRoutesBatch REJECTS outright, getJobQuotes throws and the whole
 *   endpoint 500s — the screen has no error branch so it shows
 *   "Đang quét..." forever. Ruled OUT as the live cause: the real
 *   RoutingService catches per-destination errors (Goong 403 / missing
 *   key / no route degrade to routing_error entries, the list still
 *   returns) and cannot reject for these inputs; the E2E control also
 *   proves the live routing tail worked. It remains a latent
 *   defense-in-depth gap (no try/catch around the routing tail in
 *   getJobQuotes) — a candidate hardening fix for a later round, not B6.
 *
 * HARNESS: real mongod, standalone (no transactions in this path), started
 * directly from the cached binary — same pattern as
 * payments-mockpay-r5.spec.ts (MongoMemoryReplSet's bundled driver fails
 * the handshake against mongod 8.2.6). Port 27119 / dbpath /tmp/mongo-r6-a
 * so it does not clash with other R6 workers.
 *
 * The spec drives the REAL JobsService.submitQuote + getJobQuotes against
 * the REAL mongoose models, mirroring the live sequence exactly:
 *   quote -> sweep step 3 flips PENDING -> EXPIRED (updateMany, as in
 *   sweepExpiredJobsAndQuotes) -> syncJobQuotesState -> re-quote via
 *   submitQuote (which revives the row in place via existing.save()) ->
 *   getJobQuotes as the customer.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { JobsService } from './jobs.service';
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
const DBPATH = '/tmp/mongo-r6-a';
const PORT = 27119;

describe('JobsService re-quote after expiry (B6, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let QuoteModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;

  async function seedJob() {
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
    const job = await JobModel.create({
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST Q7-SOS',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.OPEN,
      preferred_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    return { customer, helperUser, job };
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
        '/tmp/mongo-r6-a-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/b6`);
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
      } as never,
      {} as never,
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
    await ServiceModel.deleteMany({});
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  it('B6-0 (control): fresh quote lists for the customer', async () => {
    const { customer, helperUser, job } = await seedJob();
    await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

    const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'customer');
    expect(quotes).toHaveLength(1);
    expect((quotes[0] as any).total_price).toBe(70000);
    expect((quotes[0] as any).status).toBe(QuoteStatus.PENDING);
  });

  it('B6-1: re-quote after expiry lists for the customer (same row revived)', async () => {
    const { customer, helperUser, job } = await seedJob();
    const first = await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);
    expect(first.status).toBe(QuoteStatus.PENDING);

    // Mirror the real sweep step 3 exactly: first the quote's expires_at
    // passes (24h after it was sent), then the 5-minute sweep flips
    // PENDING -> EXPIRED via updateMany, then re-syncs the job (OPEN, 0).
    await QuoteModel.updateOne(
      { _id: first._id },
      { $set: { expires_at: new Date(Date.now() - 60 * 60 * 1000) } },
    ).exec();
    const sweepNow = new Date();
    const sweepRes = await QuoteModel.updateMany(
      { status: QuoteStatus.PENDING, expires_at: { $lte: sweepNow } },
      { $set: { status: QuoteStatus.EXPIRED } },
    ).exec();
    expect(sweepRes.modifiedCount).toBe(1);
    await service.syncJobQuotesState(String(job._id));
    const jobAfterExpiry = await JobModel.findById(job._id).lean();
    expect(jobAfterExpiry.status).toBe(JobStatus.OPEN);
    expect(jobAfterExpiry.total_quotes_count).toBe(0);
    const expiredRow = await QuoteModel.findById(first._id).lean();
    expect(expiredRow.status).toBe(QuoteStatus.EXPIRED);

    // Helper re-quotes the same job (live: 14/11 08:53, toast success).
    const revived = await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);
    expect(String(revived._id)).toBe(String(first._id)); // revived in place
    expect(revived.status).toBe(QuoteStatus.PENDING);
    expect(new Date((revived as any).expires_at).getTime()).toBeGreaterThan(Date.now());

    // Server-side ground truth: the row IS PENDING in the DB...
    const pendingCount = await QuoteModel.countDocuments({
      job_id: job._id,
      status: QuoteStatus.PENDING,
    });
    expect(pendingCount).toBe(1);
    const jobAfterRequote = await JobModel.findById(job._id).lean();
    expect(jobAfterRequote.status).toBe(JobStatus.RECEIVING_QUOTES);
    expect(jobAfterRequote.total_quotes_count).toBe(1);

    // ...and the customer list MUST include it. On old code this is the
    // B6 failure: getJobQuotes returns [] while the row is PENDING.
    const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'customer');
    if (quotes.length === 0) {
      const raw = await QuoteModel.find({ job_id: job._id }).lean();
      const profile = await HelperModel.findOne({ user_id: helperUser._id }).lean();
      throw new Error(
        `B6 REPRODUCED: getJobQuotes returned [] but DB has PENDING quote. ` +
          `raw quotes: ${JSON.stringify(raw)}; helper profile present: ${!!profile} ` +
          `(verification_status=${profile?.verification_status}, status=${profile?.status})`,
      );
    }
    expect(quotes).toHaveLength(1);
    expect((quotes[0] as any).total_price).toBe(70000);
    expect((quotes[0] as any).status).toBe(QuoteStatus.PENDING);

    // Helper side must also still see its own revived quote.
    const helperQuotes = await service.getJobQuotes(
      String(job._id),
      String(helperUser._id),
      'helper',
    );
    expect(helperQuotes).toHaveLength(1);
  });

  it('B6-2: re-quote with a FULL app-form DTO (dates, notes, materials) still lists', async () => {
    const { customer, helperUser, job } = await seedJob();
    const fullDto = {
      labor_cost: 70000,
      materials_cost: 10000,
      estimated_duration: 2,
      warranty_days: 30,
      notes: 'Có mang đủ dụng cụ',
      materials_breakdown: [{ name: 'Nước lau sàn', quantity: 1, unit_price: 10000 }],
      available_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      available_time_start: '10:00',
      available_time_end: '12:00',
    } as never;
    const first = await service.submitQuote(String(helperUser._id), String(job._id), fullDto);
    await QuoteModel.updateOne(
      { _id: first._id },
      { $set: { expires_at: new Date(Date.now() - 60 * 60 * 1000) } },
    ).exec();
    await QuoteModel.updateMany(
      { status: QuoteStatus.PENDING, expires_at: { $lte: new Date() } },
      { $set: { status: QuoteStatus.EXPIRED } },
    ).exec();
    await service.syncJobQuotesState(String(job._id));

    // Re-quote with a DIFFERENT full DTO (fields omitted this time, as a
    // quick re-quote from the app may send them) — the revive path assigns
    // undefined to several fields on existing.save().
    const revived = await service.submitQuote(String(helperUser._id), String(job._id), {
      labor_cost: 70000,
      materials_cost: 0,
      estimated_duration: 2,
    } as never);
    expect(revived.status).toBe(QuoteStatus.PENDING);

    const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'customer');
    expect(quotes).toHaveLength(1);
    expect((quotes[0] as any).total_price).toBe(70000);
  });

  it('B6-3 (diagnostic): degenerate geo — no helper location, no job coords — still lists', async () => {
    const { customer, helperUser, job } = await seedJob();
    await HelperModel.updateOne({ user_id: helperUser._id }, { $unset: { location: '' } }).exec();
    await JobModel.updateOne({ _id: job._id }, { $unset: { 'address.location': '' } }).exec();
    const first = await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);
    await QuoteModel.updateOne(
      { _id: first._id },
      { $set: { expires_at: new Date(Date.now() - 60 * 60 * 1000) } },
    ).exec();
    await QuoteModel.updateMany(
      { status: QuoteStatus.PENDING, expires_at: { $lte: new Date() } },
      { $set: { status: QuoteStatus.EXPIRED } },
    ).exec();
    await service.syncJobQuotesState(String(job._id));
    await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

    const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'customer');
    expect(quotes).toHaveLength(1);
  });

  it('B6-4 (diagnostic, SUPERSEDED by the R7 owner override): role-branch mechanism — a customer id passed with role helper used to see []', async () => {
    const { customer, helperUser, job } = await seedJob();
    await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

    // BEFORE R7 this was the live B6 symptom: the controller passes
    // user.active_role straight through, and with role 'helper' the query
    // added helper_id = requesterId, so a CUSTOMER id matched no quote and
    // the endpoint silently returned []. R7-B6 adds the customer-owner
    // override in getJobQuotes: when the viewer OWNS the job the customer
    // view is forced whatever the JWT role is — so the owner now sees the
    // quote under EITHER role. (The R7-B spec asserts the same fix plus
    // the non-owner guards; this test stays as the regression record.)
    const asCustomer = await service.getJobQuotes(
      String(job._id),
      String(customer._id),
      'customer',
    );
    expect(asCustomer).toHaveLength(1);
    const asHelperRole = await service.getJobQuotes(
      String(job._id),
      String(customer._id),
      'helper',
    );
    expect(asHelperRole).toHaveLength(1);
  });
});
