/**
 * R8-B — helper detail on a job that is no longer available must show an
 * honest state, not the generic "cannot connect to server" error.
 *
 * LIVE 2026-11-14 11:14–11:17: test job C (auto-cancelled by the R7 start +
 * 5 min rule) opened from a helper session showed "Không thể tải chi tiết
 * đơn hàng / Không thể kết nối đến máy chủ" while the API was up (a control
 * job's detail loaded fine). Root cause: getJobForUser threw 403 Forbidden
 * for a non-owner helper requesting a job whose status is not
 * OPEN/RECEIVING_QUOTES, and the helper detail page rendered ANY
 * detail-fetch failure as a connection error — same error class as the
 * Q2 nit (2026-11-12).
 *
 * FIX: getJobForUser answers a non-browsable job with HTTP 410 Gone
 * (GoneException) — machine-readable, distinct from 403 — while the
 * private-offer and unverified-helper refusals stay 403 Forbidden. The
 * client maps ONLY the 410 (see `@/utils/job-unavailable`) to the honest
 * "no longer available" state; 5xx / timeout / no-response and 403s keep
 * the generic connection error. No job data leaks in the 410 (status only).
 *
 * FAIL-ON-OLD: R8-B-1 and R8-B-2 FAIL on base be9b158 (403 Forbidden) and
 * PASS after the fix (410 Gone). All guard tests pass on base AND after.
 *
 * HARNESS: real mongod, standalone, started directly from the cached binary
 * — same pattern as jobs-r7-b.spec.ts (MongoMemoryReplSet's bundled driver
 * fails the handshake against mongod 8.2.6). Port 27126 / dbpath
 * /tmp/mongo-r8-b so it does not clash with the R6/R7 suites (27119–27125).
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { ForbiddenException, GoneException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { Job, JobSchema, Quote, QuoteSchema, Contract, ContractSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventSchema,
} from '../helpers/schemas/helper-penalty-event.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { JobStatus, VerificationStatus, HelperStatus, UserStatus, UserRole } from '@homemate/types';
import { isJobNoLongerAvailableError } from '@/utils/job-unavailable';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r8-b';
const PORT = 27126;

describe('R8-B (cancelled / non-browsable job detail → 410 Gone, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let UserModel: any;
  let gateway: any;
  let service: JobsService;

  async function seedUsers() {
    const customer = await UserModel.create({
      phone: '0900000001',
      full_name: 'Khách Test',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER, UserRole.HELPER],
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
    // Second verified helper (the private-offer target).
    const preferredUser = await UserModel.create({
      phone: '0900000003',
      full_name: 'Thợ Ưu Tiên',
      password_hash: 'x',
      roles: [UserRole.HELPER],
      active_role: UserRole.HELPER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    await HelperModel.create({
      user_id: preferredUser._id,
      verification_status: VerificationStatus.APPROVED,
      status: HelperStatus.ONLINE,
      location: { type: 'Point', coordinates: [108.2, 16.05] },
      rating: 5,
      completed_jobs: 3,
    });
    // Helper account with NO e-KYC profile (unverified).
    const unverifiedUser = await UserModel.create({
      phone: '0900000004',
      full_name: 'Thợ Chưa KYC',
      password_hash: 'x',
      roles: [UserRole.HELPER],
      active_role: UserRole.HELPER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    return { customer, helperUser, preferredUser, unverifiedUser };
  }

  async function seedJob(
    customerId: string,
    status: JobStatus,
    extra: Record<string, unknown> = {},
  ) {
    const svc = await ServiceModel.create({
      category_id: new Types.ObjectId(),
      name: 'Giúp việc theo giờ',
      slug: 'giup-viec-theo-gio',
      description: 'Dọn nhà theo giờ',
      platform_fee_percent: 15,
    });
    return JobModel.create({
      customer_id: new Types.ObjectId(customerId),
      service_id: svc._id,
      title: 'TEST R8-B',
      description: 'Dọn nhà 2 phòng',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status,
      preferred_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
      ...extra,
    });
  }

  /** Rejects unless the promise fails with exactly the expected HTTP status. */
  async function expectHttpStatus(promise: Promise<unknown>, status: number) {
    try {
      await promise;
    } catch (err: any) {
      const got = typeof err?.getStatus === 'function' ? err.getStatus() : err?.response?.status;
      expect(got).toBe(status);
      return err;
    }
    throw new Error(`expected rejection with HTTP ${status}, but the call resolved`);
  }

  function buildService(): JobsService {
    return new JobsService(
      JobModel,
      conn.model('Quote') as never,
      conn.model(Contract.name) as never,
      ServiceModel,
      HelperModel,
      conn.model(HelperPenaltyEvent.name) as never,
      UserModel,
      gateway,
      {
        create: jest.fn().mockResolvedValue({}),
        notifyNewQuote: jest.fn().mockResolvedValue(undefined),
        notifyJobCompleted: jest.fn().mockResolvedValue(undefined),
        notifyAdmins: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {} as never,
      {
        getRoute: jest.fn().mockResolvedValue({ distance_km: 1.2, estimated_minutes: 5 }),
        getRoutesBatch: jest.fn().mockResolvedValue(new Map()),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
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
        '/tmp/mongo-r8-b-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/r8b`);
    await new Promise<void>((resolve, reject) => {
      conn.once('connected', () => resolve());
      conn.once('error', reject);
    });

    JobModel = conn.model(Job.name, JobSchema);
    conn.model(Quote.name, QuoteSchema);
    conn.model(Contract.name, ContractSchema);
    ServiceModel = conn.model(Service.name, ServiceSchema);
    HelperModel = conn.model(HelperProfile.name, HelperProfileSchema);
    conn.model(HelperPenaltyEvent.name, HelperPenaltyEventSchema);
    UserModel = conn.model(User.name, UserSchema);

    gateway = {
      emitToUser: jest.fn(),
      emitToJob: jest.fn(),
      emitToAdmins: jest.fn(),
      broadcastHelperStatus: jest.fn().mockResolvedValue(undefined),
    };
    service = buildService();
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
    await ServiceModel.deleteMany({});
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('getJobForUser on a non-browsable job (the fix)', () => {
    it('R8-B-1 (the fix): CANCELLED job for a non-owner helper → 410 Gone, not 403', async () => {
      const { customer, helperUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.CANCELLED);

      const err = await expectHttpStatus(
        service.getJobForUser(String(job._id), String(helperUser._id), ['helper']),
        410,
      );
      expect(err).toBeInstanceOf(GoneException);
    });

    it('R8-B-2 (the fix): COMPLETED job the helper never touched → 410 Gone too', async () => {
      const { customer, helperUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.COMPLETED);

      const err = await expectHttpStatus(
        service.getJobForUser(String(job._id), String(helperUser._id), ['helper']),
        410,
      );
      expect(err).toBeInstanceOf(GoneException);
    });
  });

  describe('getJobForUser guards (unchanged behaviour)', () => {
    it('R8-B-3 (guard): owner still loads their own CANCELLED job', async () => {
      const { customer } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.CANCELLED);

      const loaded = await service.getJobForUser(String(job._id), String(customer._id), [
        'customer',
        'helper',
      ]);
      expect(String((loaded as any)._id)).toBe(String(job._id));
      expect((loaded as any).status).toBe(JobStatus.CANCELLED);
    });

    it('R8-B-4 (guard): assigned helper still loads their IN_PROGRESS job', async () => {
      const { customer, helperUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.IN_PROGRESS, {
        helper_id: helperUser._id,
      });

      const loaded = await service.getJobForUser(String(job._id), String(helperUser._id), [
        'helper',
      ]);
      expect(String((loaded as any)._id)).toBe(String(job._id));
      expect((loaded as any).status).toBe(JobStatus.IN_PROGRESS);
    });

    it('R8-B-5 (guard): browsable OPEN job still loads for a verified non-owner helper', async () => {
      const { customer, helperUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.OPEN);

      const loaded = await service.getJobForUser(String(job._id), String(helperUser._id), [
        'helper',
      ]);
      expect(String((loaded as any)._id)).toBe(String(job._id));
      expect((loaded as any).status).toBe(JobStatus.OPEN);
    });

    it('R8-B-6 (guard): private-offer OPEN job for another helper stays 403 Forbidden', async () => {
      const { customer, helperUser, preferredUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.OPEN, {
        private_offer_helper_id: preferredUser._id,
        private_offer_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      });

      const err = await expectHttpStatus(
        service.getJobForUser(String(job._id), String(helperUser._id), ['helper']),
        403,
      );
      expect(err).toBeInstanceOf(ForbiddenException);
    });

    it('R8-B-7 (guard): unverified helper on an OPEN job stays 403 Forbidden', async () => {
      const { customer, unverifiedUser } = await seedUsers();
      const job = await seedJob(String(customer._id), JobStatus.OPEN);

      const err = await expectHttpStatus(
        service.getJobForUser(String(job._id), String(unverifiedUser._id), ['helper']),
        403,
      );
      expect(err).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('isJobNoLongerAvailableError client mapper', () => {
    it('R8-B-8: matches 410 (axios shape) and the Gone error code, nothing else', () => {
      // The live shape: axios error with response.status 410.
      expect(isJobNoLongerAvailableError({ response: { status: 410 } })).toBe(true);
      // Bare status (same convention as the page's 401 check).
      expect(isJobNoLongerAvailableError({ status: 410 })).toBe(true);
      // The API filter's error code for a 410, without a status.
      expect(isJobNoLongerAvailableError({ response: { data: { error: { code: 'Gone' } } } })).toBe(
        true,
      );
      // A genuinely forbidden request must NOT render the honest state.
      expect(isJobNoLongerAvailableError({ response: { status: 403 } })).toBe(false);
      // Real server failure / session expiry / network failure keep the
      // generic connection error.
      expect(isJobNoLongerAvailableError({ response: { status: 500 } })).toBe(false);
      expect(isJobNoLongerAvailableError({ response: { status: 401 } })).toBe(false);
      expect(isJobNoLongerAvailableError(new Error('Network Error'))).toBe(false);
      expect(isJobNoLongerAvailableError(null)).toBe(false);
      expect(isJobNoLongerAvailableError(undefined)).toBe(false);
    });
  });
});
