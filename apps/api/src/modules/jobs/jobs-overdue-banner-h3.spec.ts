/**
 * R7 item 3: overdue banner (customer side) + re-broadcast action.
 *
 * Banner renders exactly when (start time passed AND no helper assigned);
 * never for assigned/in-progress jobs. The render condition is the pure
 * `isOverdueUnassigned` in apps/mobile/utils/job-overdue.ts (mirrors the
 * server's `isPastStartUnassigned`); the shared OverdueJobBanner component
 * is used on job detail, job list and home. Re-broadcast reuses the
 * existing notifyNearbyHelpers path (socket JOB_CREATED + NEW_JOB_NEARBY to
 * nearby ONLINE helpers) — no new broadcast system — exposed as
 * POST /jobs/:jobId/rebroadcast with a 10-minute anti-spam throttle.
 *
 * FAILS on base 85fd7ba (no job-overdue util, no rebroadcastJob method);
 * passes after the fix.
 *
 * HARNESS: real mongod from the cached binary. Port 27123 / dbpath
 * /tmp/mongo-r7-a-3 (B7 = 27121, item 2 = 27122 — separate ports so suites
 * can run in parallel).
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { JobsService, isPastStartUnassigned } from './jobs.service';
import { Job, JobSchema, Quote, QuoteSchema, Contract, ContractSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventSchema,
} from '../helpers/schemas/helper-penalty-event.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { JobStatus, VerificationStatus, HelperStatus, UserStatus, UserRole } from '@homemate/types';
import { isOverdueUnassigned } from '@/utils/job-overdue';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r7-a-3';
const PORT = 27123;

describe('Overdue banner predicate + rebroadcast (R7 item 3, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;
  let notifyCreate: jest.Mock;

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
    const otherCustomer = await UserModel.create({
      phone: '0900000003',
      full_name: 'Khách Khác',
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
    const svc = await conn.model(Service.name).create({
      category_id: new Types.ObjectId(),
      name: 'Giúp việc theo giờ',
      slug: 'giup-viec-theo-gio',
      description: 'Dọn nhà theo giờ',
      platform_fee_percent: 15,
    });
    const job = await JobModel.create({
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST H3 overdue',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.OPEN,
      preferred_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    return { customer, otherCustomer, helperUser, job };
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
        '/tmp/mongo-r7-a-3-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/h3`);
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
    service = new JobsService(
      JobModel,
      conn.model(Quote.name) as never,
      conn.model(Contract.name) as never,
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
      {} as never,
      { getRoutesBatch: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
    // notifyNearbyHelpers uses $geoNear on helperprofiles.location — needs the
    // 2dsphere index the production collection has.
    await HelperModel.collection.createIndex({ location: '2dsphere' });
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
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
    await conn.model(Service.name).deleteMany({});
    jest.clearAllMocks();
  });

  describe('H3-0: banner predicate (pure — the exact render condition)', () => {
    const nowMs = Date.now();
    const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(nowMs + 24 * 60 * 60 * 1000);

    it('renders for past start + no helper (OPEN)', () => {
      expect(
        isOverdueUnassigned(
          {
            preferred_date: yesterday,
            preferred_time_start: '10:00',
            helper_id: null,
            status: JobStatus.OPEN,
          },
          nowMs,
        ),
      ).toBe(true);
    });

    it('renders for past start + no helper (RECEIVING_QUOTES)', () => {
      expect(
        isOverdueUnassigned(
          {
            preferred_date: yesterday,
            preferred_time_start: '10:00',
            helper_id: null,
            status: JobStatus.RECEIVING_QUOTES,
          },
          nowMs,
        ),
      ).toBe(true);
    });

    it('never renders for a future start', () => {
      expect(
        isOverdueUnassigned(
          {
            preferred_date: tomorrow,
            preferred_time_start: '10:00',
            helper_id: null,
            status: JobStatus.OPEN,
          },
          nowMs,
        ),
      ).toBe(false);
    });

    it('never renders for assigned / in-progress jobs (helper set)', () => {
      const helperId = new Types.ObjectId();
      expect(
        isOverdueUnassigned(
          {
            preferred_date: yesterday,
            preferred_time_start: '10:00',
            helper_id: helperId,
            status: JobStatus.OPEN,
          },
          nowMs,
        ),
      ).toBe(false);
      expect(
        isOverdueUnassigned(
          {
            preferred_date: yesterday,
            preferred_time_start: '10:00',
            helper_id: String(helperId),
            status: JobStatus.RECEIVING_QUOTES,
          },
          nowMs,
        ),
      ).toBe(false);
    });

    it('never renders without a usable start (no date / no time / null job)', () => {
      expect(isOverdueUnassigned(null, nowMs)).toBe(false);
      expect(isOverdueUnassigned(undefined, nowMs)).toBe(false);
      expect(
        isOverdueUnassigned(
          { preferred_date: null, preferred_time_start: null, status: JobStatus.OPEN },
          nowMs,
        ),
      ).toBe(false);
      expect(
        isOverdueUnassigned(
          { preferred_date: yesterday, preferred_time_start: '', status: JobStatus.OPEN },
          nowMs,
        ),
      ).toBe(false);
    });

    // R8 item 1: the status gate — FAILS on base be9b158 (no status check:
    // a cancelled past-start unassigned job returned true). The live case is
    // job C (6af59fdfbb2b94f98da7e888): auto-cancelled by the R7 sweep 5 min
    // after its Fri 13/11 10:00 start, helper null — the banner must not
    // render on it.
    it.each([
      JobStatus.CANCELLED,
      JobStatus.COMPLETED,
      JobStatus.DISPUTED,
      JobStatus.EXPIRED,
      JobStatus.CONFIRMED,
      JobStatus.QUOTE_SELECTED,
      JobStatus.IN_PROGRESS,
      JobStatus.PENDING_REVIEW,
      JobStatus.REFUNDED,
      JobStatus.DRAFT,
    ])('R8-1: never renders for %s + past start + no helper', status => {
      expect(
        isOverdueUnassigned(
          { preferred_date: yesterday, preferred_time_start: '10:00', helper_id: null, status },
          nowMs,
        ),
      ).toBe(false);
    });

    it('R8-2: never renders when status is missing (strict gate)', () => {
      expect(
        isOverdueUnassigned(
          { preferred_date: yesterday, preferred_time_start: '10:00', helper_id: null },
          nowMs,
        ),
      ).toBe(false);
    });

    it('R8-3: server predicate mirrors the gate (cancelled → false)', () => {
      const past = {
        preferred_date: yesterday,
        preferred_time_start: '10:00',
        helper_id: null,
        status: JobStatus.CANCELLED,
      };
      expect(isPastStartUnassigned(past as any, new Date(nowMs))).toBe(false);
      expect(
        isPastStartUnassigned({ ...past, status: JobStatus.COMPLETED } as any, new Date(nowMs)),
      ).toBe(false);
      expect(
        isPastStartUnassigned({ ...past, status: JobStatus.OPEN } as any, new Date(nowMs)),
      ).toBe(true);
      expect(
        isPastStartUnassigned(
          { ...past, status: JobStatus.RECEIVING_QUOTES } as any,
          new Date(nowMs),
        ),
      ).toBe(true);
      // No status present (e.g. the demand-map projection selects no status
      // field): old behaviour is preserved so that path keeps hiding.
      expect(
        isPastStartUnassigned(
          { preferred_date: yesterday, preferred_time_start: '10:00', helper_id: null } as any,
          new Date(nowMs),
        ),
      ).toBe(true);
    });
  });

  it('H3-1: rebroadcast re-notifies nearby helpers + records the event + timestamp', async () => {
    const { customer, job } = await seed();
    const res = await service.rebroadcastJob(String(customer._id), String(job._id));
    expect(res.success).toBe(true);
    // The ONLINE helper ~1.5km away got a NEW_JOB_NEARBY notification.
    expect(notifyCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'new_job_nearby' }));
    const stored = await JobModel.findById(job._id).lean();
    expect(stored.last_rebroadcast_at).toBeDefined();
    expect(stored.events.map((e: any) => e.note)).toContain('Gửi lại đơn cho thợ gần đây');
  });

  it('H3-2: rebroadcast is throttled to once per 10 minutes', async () => {
    const { customer, job } = await seed();
    await service.rebroadcastJob(String(customer._id), String(job._id));
    await expect(service.rebroadcastJob(String(customer._id), String(job._id))).rejects.toThrow(
      'Vừa gửi lại',
    );
  });

  it('H3-3: rebroadcast rejects non-owners and assigned/closed jobs', async () => {
    const { customer, otherCustomer, helperUser, job } = await seed();
    await expect(
      service.rebroadcastJob(String(otherCustomer._id), String(job._id)),
    ).rejects.toThrow();
    // Assigned (helper set, status still open — the stuck-assigned shape) →
    // the helper guard fires.
    await JobModel.updateOne({ _id: job._id }, { $set: { helper_id: helperUser._id } }).exec();
    await expect(service.rebroadcastJob(String(customer._id), String(job._id))).rejects.toThrow(
      'đã có thợ',
    );
    // Confirmed job → the status guard fires.
    await JobModel.updateOne({ _id: job._id }, { $set: { status: JobStatus.CONFIRMED } }).exec();
    await expect(service.rebroadcastJob(String(customer._id), String(job._id))).rejects.toThrow(
      'đang mở nhận báo giá',
    );
  });

  it('R8-4: acceptFixedPrice on a cancelled past-start job fails with the status error, not "Đã quá giờ hẹn"', async () => {
    // R8 item 1, server side: in acceptFixedPrice the status guard sits
    // AFTER isPastStartUnassigned, so on base code the ungated predicate
    // fired first and this threw 'Đã quá giờ hẹn'. After the gate the
    // predicate is false for a cancelled job and the status guard throws.
    const { customer, helperUser } = await seed();
    const svc = await conn.model(Service.name).findOne({ slug: 'giup-viec-theo-gio' });
    const cancelledJob = await JobModel.create({
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST R8 cancelled past start',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.CANCELLED,
      is_fixed_price: true,
      fixed_price: 70000,
      preferred_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    await expect(
      service.acceptFixedPrice(String(helperUser._id), String(cancelledJob._id)),
    ).rejects.toThrow('Đơn không còn ở trạng thái chờ thợ nhận việc');
  });
});
