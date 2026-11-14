/**
 * R7 watchdog (iii)/(iv): at-risk detection — DETECT + NOTIFY + admin
 * visibility, NO auto-repair (no cancel/refund — needs Vinh's decision).
 *
 * - (iii) helper_no_start: accepted job (CONFIRMED/ON_THE_WAY/ARRIVED) whose
 *   start passed 1h ago with no start → notify customer + helper once.
 * - (iv) review_waiting_3d: PENDING_REVIEW 3 days with no customer action →
 *   remind customer once; review_waiting_7d: + escalate to admin once.
 * Flags are stored on the job (at_risk_flags + at_risk_detected_at) and
 * cleared when the job leaves the at-risk state; admin getJobs supports
 * at_risk=true. The 1h/3d/7d windows are PROPOSALS (not decided by Vinh) —
 * they gate detection/notify only, never money or cancellation.
 *
 * (i) PROCESSING payments > 15 min is covered by the existing
 * clearStuckProcessingPayments — verified by payments-stuck-processing-r7.spec.ts.
 * (ii) step-2 past-start + all quotes expired is covered by the item-1
 * notification + +5m auto-cancel sweep (jobs-overdue-sweep-h1.spec.ts).
 *
 * FAILS on base 85fd7ba (no at-risk.ts, no sweepAtRiskJobs, no schema fields);
 * passes after the fix.
 *
 * HARNESS: real mongod from the cached binary. Port 27125 / dbpath
 * /tmp/mongo-r7-a-5 (B7 = 27121, item 2 = 27122, item 3 = 27123, item 1 =
 * 27124 — separate ports so suites can run in parallel).
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
import { AdminService } from '../admin/admin.service';
import {
  detectAtRiskFlags,
  AT_RISK_HELPER_NO_START,
  AT_RISK_REVIEW_WAITING_3D,
  AT_RISK_REVIEW_WAITING_7D,
} from './at-risk';
import { JobStatus, VerificationStatus, HelperStatus, UserStatus, UserRole } from '@homemate/types';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r7-a-5';
const PORT = 27125;

function vnDateTime(targetMs: number): { date: Date; time: string } {
  const vn = new Date(targetMs + 7 * 60 * 60 * 1000);
  const dateKey = vn.toISOString().slice(0, 10);
  return {
    date: new Date(`${dateKey}T00:00:00+07:00`),
    time: vn.toISOString().slice(11, 16),
  };
}

describe('At-risk watchdog (iii)/(iv) (R7, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;
  let adminService: AdminService;
  let notifyCreate: jest.Mock;
  let notifyAdmins: jest.Mock;

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
        '/tmp/mongo-r7-a-5-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/w`);
    await new Promise<void>((resolve, reject) => {
      conn.once('connected', () => resolve());
      conn.once('error', reject);
    });

    JobModel = conn.model(Job.name, JobSchema);
    conn.model(Quote.name, QuoteSchema);
    conn.model(Contract.name, ContractSchema);
    conn.model(Service.name, ServiceSchema);
    HelperModel = conn.model(HelperProfile.name, HelperProfileSchema);
    conn.model(HelperPenaltyEvent.name, HelperPenaltyEventSchema);
    UserModel = conn.model(User.name, UserSchema);

    notifyCreate = jest.fn().mockResolvedValue({});
    notifyAdmins = jest.fn().mockResolvedValue(undefined);
    const notifications = {
      create: notifyCreate,
      notifyNewQuote: jest.fn().mockResolvedValue(undefined),
      notifyAdmins,
      notifyQuoteAccepted: jest.fn().mockResolvedValue(undefined),
      notifyQuoteRejected: jest.fn().mockResolvedValue(undefined),
    } as never;
    service = new JobsService(
      JobModel,
      conn.model(Quote.name) as never,
      conn.model(Contract.name) as never,
      conn.model(Service.name) as never,
      HelperModel,
      conn.model(HelperPenaltyEvent.name) as never,
      UserModel,
      { emitToUser: jest.fn(), emitToJob: jest.fn() } as never,
      notifications,
      {} as never,
      {} as never,
      { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
    // AdminService: only jobModel is real (getJobs uses nothing else).
    const mockModel = {} as never;
    adminService = new AdminService(
      mockModel,
      mockModel,
      JobModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      notifications,
      {} as never,
      {} as never,
      mockModel,
      mockModel,
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

  async function seedJob(opts: {
    status: JobStatus;
    startOffsetMin?: number;
    reviewSinceMs?: number;
  }) {
    const { date, time } = vnDateTime(Date.now() + (opts.startOffsetMin ?? -120) * 60 * 1000);
    const events: any[] = [];
    if (opts.reviewSinceMs != null) {
      events.push({
        status: JobStatus.PENDING_REVIEW,
        note: 'Hoàn thành',
        actor_id: helperUser._id,
        actor_role: 'helper',
        timestamp: new Date(opts.reviewSinceMs),
      });
    }
    return JobModel.create({
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST W at-risk',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: opts.status,
      helper_id: helperUser._id,
      preferred_date: date,
      preferred_time_start: time,
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
      events,
    });
  }

  beforeEach(async () => {
    await JobModel.deleteMany({});
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

  describe('W-0: pure flag detection (no DB)', () => {
    const now = Date.now();
    const base = {
      status: JobStatus.CONFIRMED,
      helper_id: new Types.ObjectId(),
      preferred_date: new Date(now - 3 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
    };
    it('flags helper_no_start at start+61m, not at start+59m', () => {
      const { date, time } = vnDateTime(now - 61 * 60 * 1000);
      expect(
        detectAtRiskFlags({ ...base, preferred_date: date, preferred_time_start: time }, now),
      ).toEqual([AT_RISK_HELPER_NO_START]);
      const near = vnDateTime(now - 59 * 60 * 1000);
      expect(
        detectAtRiskFlags(
          { ...base, preferred_date: near.date, preferred_time_start: near.time },
          now,
        ),
      ).toEqual([]);
    });
    it('never flags IN_PROGRESS or unassigned jobs', () => {
      const { date, time } = vnDateTime(now - 5 * 60 * 60 * 1000);
      expect(
        detectAtRiskFlags(
          {
            ...base,
            status: JobStatus.IN_PROGRESS,
            preferred_date: date,
            preferred_time_start: time,
          },
          now,
        ),
      ).toEqual([]);
      expect(
        detectAtRiskFlags(
          { ...base, helper_id: null, preferred_date: date, preferred_time_start: time },
          now,
        ),
      ).toEqual([]);
    });
    it('flags review waits from the PENDING_REVIEW event (3d, then 3d+7d)', () => {
      const job3d = {
        status: JobStatus.PENDING_REVIEW,
        helper_id: new Types.ObjectId(),
        events: [
          { status: JobStatus.PENDING_REVIEW, timestamp: new Date(now - 4 * 24 * 60 * 60 * 1000) },
        ],
      };
      expect(detectAtRiskFlags(job3d, now)).toEqual([AT_RISK_REVIEW_WAITING_3D]);
      const job7d = {
        status: JobStatus.PENDING_REVIEW,
        helper_id: new Types.ObjectId(),
        events: [
          { status: JobStatus.PENDING_REVIEW, timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000) },
        ],
      };
      expect(detectAtRiskFlags(job7d, now)).toEqual([
        AT_RISK_REVIEW_WAITING_3D,
        AT_RISK_REVIEW_WAITING_7D,
      ]);
      const jobFresh = {
        status: JobStatus.PENDING_REVIEW,
        helper_id: new Types.ObjectId(),
        events: [
          { status: JobStatus.PENDING_REVIEW, timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000) },
        ],
      };
      expect(detectAtRiskFlags(jobFresh, now)).toEqual([]);
    });
  });

  it('W-1: helper_no_start → flag stored + customer & helper notified once; re-run silent', async () => {
    const job = await seedJob({ status: JobStatus.CONFIRMED, startOffsetMin: -120 });
    await service.sweepAtRiskJobs();

    let stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([AT_RISK_HELPER_NO_START]);
    expect(stored.at_risk_detected_at).toBeDefined();
    expect(stored.status).toBe(JobStatus.CONFIRMED); // no auto-repair
    const customerNotes = notifyCreate.mock.calls.filter(
      c => c[0]?.userId === String(customer._id),
    );
    const helperNotes = notifyCreate.mock.calls.filter(
      c => c[0]?.userId === String(helperUser._id),
    );
    expect(customerNotes.length).toBe(1);
    expect(customerNotes[0][0].title).toMatch(/chưa bắt đầu/);
    expect(helperNotes.length).toBe(1);
    expect(notifyAdmins).not.toHaveBeenCalled();

    await service.sweepAtRiskJobs();
    expect(notifyCreate).toHaveBeenCalledTimes(2);
    stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([AT_RISK_HELPER_NO_START]);
  });

  it('W-2: review 4 days → 3d flag + one customer reminder; re-run silent', async () => {
    const job = await seedJob({
      status: JobStatus.PENDING_REVIEW,
      reviewSinceMs: Date.now() - 4 * 24 * 60 * 60 * 1000,
    });
    await service.sweepAtRiskJobs();
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([AT_RISK_REVIEW_WAITING_3D]);
    expect(notifyCreate).toHaveBeenCalledTimes(1);
    expect(notifyCreate.mock.calls[0][0].title).toMatch(/nghiệm thu/);
    expect(notifyAdmins).not.toHaveBeenCalled();
    await service.sweepAtRiskJobs();
    expect(notifyCreate).toHaveBeenCalledTimes(1);
  });

  it('W-3: review 8 days → 3d+7d flags, customer reminded + admin escalated once', async () => {
    const job = await seedJob({
      status: JobStatus.PENDING_REVIEW,
      reviewSinceMs: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    await service.sweepAtRiskJobs();
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([AT_RISK_REVIEW_WAITING_3D, AT_RISK_REVIEW_WAITING_7D]);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins.mock.calls[0][0].title).toMatch(/7 ngày/);
    // Customer gets the 3d reminder + the 7d reminder (both flags are new).
    expect(notifyCreate).toHaveBeenCalledTimes(2);
    await service.sweepAtRiskJobs();
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyCreate).toHaveBeenCalledTimes(2);
  });

  it('W-4: flags clear when the job leaves the at-risk state', async () => {
    const job = await seedJob({ status: JobStatus.CONFIRMED, startOffsetMin: -120 });
    await service.sweepAtRiskJobs();
    let stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([AT_RISK_HELPER_NO_START]);
    await JobModel.updateOne({ _id: job._id }, { $set: { status: JobStatus.IN_PROGRESS } }).exec();
    await service.sweepAtRiskJobs();
    stored = await JobModel.findById(job._id).lean();
    expect(stored.at_risk_flags).toEqual([]);
    expect(stored.at_risk_detected_at).toBeUndefined();
  });

  it('W-5: admin getJobs at_risk=true returns only flagged jobs', async () => {
    const flagged = await seedJob({ status: JobStatus.CONFIRMED, startOffsetMin: -120 });
    await seedJob({ status: JobStatus.CONFIRMED, startOffsetMin: -30 });
    await service.sweepAtRiskJobs();
    const all = await adminService.getJobs(undefined, undefined, 1, 20);
    expect(all.total).toBe(2);
    const onlyRisk = await adminService.getJobs(undefined, undefined, 1, 20, true);
    expect(onlyRisk.total).toBe(1);
    expect(String(onlyRisk.jobs[0]._id)).toBe(String(flagged._id));
  });
});
