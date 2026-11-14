/**
 * R7 item 1 + auto-cancel (Vinh quyết 2026-11-14): one sweep, two time-based
 * actions for OPEN/RECEIVING_QUOTES jobs with no helper assigned.
 *
 * - At start time: notify the customer "Chưa có thợ nhận đơn" (in-app +
 *   SendGrid email), once per job+start-time (overdue_notified_for key).
 * - Start + 5 min, still unassigned: AUTO-CANCEL (status CANCELLED, reason
 *   + actor 'system' in the event), notify the customer in-app + email,
 *   reject PENDING quotes (helpers notified), restore voucher/points.
 *   NO money moves: no contract/escrow at that point — paymentsService is
 *   never called and payment_status stays UNPAID.
 * - Reschedule resets the clock (new start → new key, no cancel).
 * - Assigned jobs (helper_id / contract) NEVER auto-cancel under this rule.
 *
 * FAILS on base 85fd7ba (no sweepOverdueUnassignedJobs method);
 * passes after the fix.
 *
 * HARNESS: real mongod from the cached binary. Port 27124 / dbpath
 * /tmp/mongo-r7-a-4 (B7 = 27121, item 2 = 27122, item 3 = 27123 — separate
 * ports so suites can run in parallel). notifications + mail + payments are
 * mocks so we can assert exactly-once delivery and zero money calls.
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
  PaymentStatus,
} from '@homemate/types';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r7-a-4';
const PORT = 27124;

/** VN date+time (HH:mm) for a target instant, matching jobScheduledStart. */
function vnDateTime(targetMs: number): { date: Date; time: string } {
  const vn = new Date(targetMs + 7 * 60 * 60 * 1000);
  const dateKey = vn.toISOString().slice(0, 10);
  return {
    date: new Date(`${dateKey}T00:00:00+07:00`),
    time: vn.toISOString().slice(11, 16),
  };
}

describe('Overdue sweep: start notification + auto-cancel at +5m (R7, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let QuoteModel: any;
  let ContractModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;
  let notifyCreate: jest.Mock;
  let sendJobEmail: jest.Mock;
  let payments: Record<string, jest.Mock>;

  async function seedJob(opts: {
    startOffsetMin: number;
    helperId?: Types.ObjectId;
    status?: JobStatus;
    customer: any;
    helperUser: any;
    svc: any;
    withQuote?: boolean;
    withContract?: boolean;
    voucherCode?: string;
  }) {
    const { date, time } = vnDateTime(Date.now() + opts.startOffsetMin * 60 * 1000);
    const job = await JobModel.create({
      customer_id: opts.customer._id,
      service_id: opts.svc._id,
      title: 'TEST H1 sweep',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: opts.status ?? JobStatus.OPEN,
      helper_id: opts.helperId ?? null,
      preferred_date: date,
      preferred_time_start: time,
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
      voucher_code: opts.voucherCode,
    });
    if (opts.withQuote) {
      await QuoteModel.create({
        job_id: job._id,
        helper_id: opts.helperUser._id,
        price: 70000,
        labor_cost: 70000,
        total_price: 70000,
        estimated_duration: 2,
        status: QuoteStatus.PENDING,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
    if (opts.withContract) {
      await ContractModel.create({
        job_id: job._id,
        customer_id: opts.customer._id,
        helper_id: opts.helperUser._id,
        labor_cost: 70000,
        total_price: 70000,
        helper_receives: 59500,
        scheduled_at: new Date(Date.now() + opts.startOffsetMin * 60 * 1000),
      });
    }
    return job;
  }

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
        '/tmp/mongo-r7-a-4-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/h1`);
    await new Promise<void>((resolve, reject) => {
      conn.once('connected', () => resolve());
      conn.once('error', reject);
    });

    JobModel = conn.model(Job.name, JobSchema);
    QuoteModel = conn.model(Quote.name, QuoteSchema);
    ContractModel = conn.model(Contract.name, ContractSchema);
    conn.model(Service.name, ServiceSchema);
    HelperModel = conn.model(HelperProfile.name, HelperProfileSchema);
    conn.model(HelperPenaltyEvent.name, HelperPenaltyEventSchema);
    UserModel = conn.model(User.name, UserSchema);

    notifyCreate = jest.fn().mockResolvedValue({});
    sendJobEmail = jest.fn().mockResolvedValue(true);
    payments = {
      refundCustomer: jest.fn().mockResolvedValue(undefined),
      refundToCustomer: jest.fn().mockResolvedValue(undefined),
      processRefund: jest.fn().mockResolvedValue(undefined),
      payHelper: jest.fn().mockResolvedValue(undefined),
      mockPayJob: jest.fn().mockResolvedValue(undefined),
    };
    service = new JobsService(
      JobModel,
      QuoteModel as never,
      ContractModel as never,
      conn.model(Service.name) as never,
      HelperModel,
      conn.model(HelperPenaltyEvent.name) as never,
      UserModel,
      { emitToUser: jest.fn(), emitToJob: jest.fn() } as never,
      {
        create: notifyCreate,
        notifyNewQuote: jest.fn().mockResolvedValue(undefined),
        notifyAdmins: jest.fn().mockResolvedValue(undefined),
        notifyQuoteAccepted: jest.fn().mockResolvedValue(undefined),
        notifyQuoteRejected: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      payments as never,
      { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
      { restoreForJob: jest.fn().mockResolvedValue({ restored: false }) } as never,
      { reverseRedeemForJob: jest.fn().mockResolvedValue({ points_restored: 0 }) } as never,
      {} as never,
      undefined,
      { sendJobEmail } as never,
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

  let customer: any;
  let helperUser: any;
  let svc: any;

  beforeEach(async () => {
    await JobModel.deleteMany({});
    await QuoteModel.deleteMany({});
    await ContractModel.deleteMany({});
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
    await conn.model(Service.name).deleteMany({});
    jest.clearAllMocks();
    customer = await UserModel.create({
      phone: '0900000001',
      email: 'khach@test.vn',
      full_name: 'Khách Test',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER],
      active_role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    helperUser = await UserModel.create({
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
    svc = await conn.model(Service.name).create({
      category_id: new Types.ObjectId(),
      name: 'Giúp việc theo giờ',
      slug: 'giup-viec-theo-gio',
      description: 'Dọn nhà theo giờ',
      platform_fee_percent: 15,
    });
  });

  const notifOfType = (type: string) => notifyCreate.mock.calls.filter(c => c[0]?.type === type);

  it('H1-a: 6 min past start, unassigned → auto-cancels; cancel notice exactly once; no money moves', async () => {
    const job = await seedJob({
      startOffsetMin: -6,
      customer,
      helperUser,
      svc,
      withQuote: true,
    });
    await service.sweepOverdueUnassignedJobs();

    const stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.CANCELLED);
    expect(stored.cancellation_reason).toMatch(/Tự động hủy/);
    expect(stored.cancelled_by_role).toBe('system');
    expect(stored.events.map((e: any) => e.actor_role)).toContain('system');
    // No money moved: payment untouched, no refund flags, no payments calls.
    expect(stored.payment_status).toBe(PaymentStatus.UNPAID);
    expect(stored.refund_pending_retry).toBeFalsy();
    for (const fn of Object.values(payments)) expect(fn).not.toHaveBeenCalled();
    // Pending quote rejected + helper told.
    const quote = await QuoteModel.findOne({ job_id: job._id }).lean();
    expect(quote.status).toBe(QuoteStatus.REJECTED);
    expect(notifOfType('system').length).toBe(1);
    // Cancel notification exactly once (in-app + email); the start-time
    // "no helper yet" notice is suppressed when the cancel is due already.
    expect(notifOfType('job_auto_cancelled').length).toBe(1);
    expect(notifOfType('job_auto_cancelled')[0][0].payload.job_id).toBe(String(job._id));
    expect(notifOfType('job_no_helper_at_start').length).toBe(0);
    expect(sendJobEmail).toHaveBeenCalledTimes(1);
    expect(sendJobEmail.mock.calls[0][0]).toBe('khach@test.vn');
    expect(sendJobEmail.mock.calls[0][1]).toMatch(/tự động hủy/i);

    // Second sweep: still exactly once (idempotent — job no longer OPEN).
    await service.sweepOverdueUnassignedJobs();
    expect(notifOfType('job_auto_cancelled').length).toBe(1);
    expect(sendJobEmail).toHaveBeenCalledTimes(1);
  });

  it('H1-b: 1 min past start → start notification once (in-app + email), job stays OPEN; re-run does not re-notify', async () => {
    const job = await seedJob({ startOffsetMin: -1, customer, helperUser, svc });
    await service.sweepOverdueUnassignedJobs();

    let stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.OPEN);
    expect(notifOfType('job_no_helper_at_start').length).toBe(1);
    const n = notifOfType('job_no_helper_at_start')[0][0];
    expect(n.title).toBe('Chưa có thợ nhận đơn');
    expect(n.body).toMatch(/đến giờ làm/);
    expect(n.payload.job_id).toBe(String(job._id));
    expect(sendJobEmail).toHaveBeenCalledTimes(1);
    expect(sendJobEmail.mock.calls[0][0]).toBe('khach@test.vn');
    expect(stored.overdue_notified_for).toBeTruthy();

    await service.sweepOverdueUnassignedJobs();
    expect(notifOfType('job_no_helper_at_start').length).toBe(1);
    expect(sendJobEmail).toHaveBeenCalledTimes(1);
    stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.OPEN);

    // Reschedule to the future → clock resets: no cancel, no new notice.
    const { date, time } = vnDateTime(Date.now() + 60 * 60 * 1000);
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { preferred_date: date, preferred_time_start: time } },
    ).exec();
    await service.sweepOverdueUnassignedJobs();
    stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.OPEN);
    expect(notifOfType('job_no_helper_at_start').length).toBe(1);
    expect(notifOfType('job_auto_cancelled').length).toBe(0);
  });

  it('H1-c: future start → nothing happens', async () => {
    const job = await seedJob({ startOffsetMin: 60, customer, helperUser, svc });
    await service.sweepOverdueUnassignedJobs();
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.OPEN);
    expect(notifyCreate).not.toHaveBeenCalled();
    expect(sendJobEmail).not.toHaveBeenCalled();
  });

  it('H1-d: assigned job 60 min past start NEVER auto-cancels', async () => {
    const job = await seedJob({
      startOffsetMin: -60,
      helperId: helperUser._id,
      status: JobStatus.CONFIRMED,
      customer,
      helperUser,
      svc,
    });
    await service.sweepOverdueUnassignedJobs();
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.CONFIRMED);
    expect(notifyCreate).not.toHaveBeenCalled();
    expect(sendJobEmail).not.toHaveBeenCalled();
  });

  it('H1-e: OPEN job with a contract 60 min past start is NOT auto-cancelled (contract guard)', async () => {
    const job = await seedJob({
      startOffsetMin: -60,
      customer,
      helperUser,
      svc,
      withContract: true,
    });
    await service.sweepOverdueUnassignedJobs();
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.status).toBe(JobStatus.OPEN);
    expect(notifOfType('job_auto_cancelled').length).toBe(0);
  });
});
