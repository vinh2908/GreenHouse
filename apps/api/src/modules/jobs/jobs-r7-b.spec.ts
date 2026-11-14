/**
 * R7-B — two live-proven fixes, one shared real-mongod harness:
 *
 * (1) B6 FOLLOW-UP (live 2026-11-14 ~09:28, NOT part of R6): getJobQuotes
 *     with active_role='helper' silently returned [] for a job the viewer
 *     OWNS, because the helper branch adds helper_id = requesterId and a
 *     customer id matches no quote. The session had landed in helper mode
 *     after sign-in, so the customer quote list showed (0) + "Đang quét..."
 *     forever while the revived quote provably existed (B6-4 diagnostic in
 *     jobs-requote-b6.spec.ts proved the mechanism: same customer id, role
 *     'customer' → 1 quote, role 'helper' → 0).
 *     FIX: server-side customer-owner override in getJobQuotes — when the
 *     viewer owns the job the customer view is forced regardless of
 *     active_role. R7-B6-2 FAILS on base 85fd7ba (returns 0) and PASSES
 *     after the fix.
 *
 * (2) DUPLICATE ACCEPTANCE NOTIFICATION (live 2026-11-14 08:47, E2E job):
 *     the 'Hoàn thành công việc' notification arrived TWICE, identical.
 *     Root cause: completeByHelper called notifyJobCompleted on EVERY call,
 *     including evidence re-uploads (isReupload — R4 re-upload button, or
 *     the offline queue replaying a completion whose first response was
 *     lost to a network error). A re-upload is not a new completion — the
 *     customer was already told to review at the first completion.
 *     FIX: notify only on first-time completion (!isReupload). The socket
 *     JOB_COMPLETION_UPLOADED fan-out still fires on re-upload so the
 *     customer UI refreshes. The R7-DUP tests drive the REAL
 *     NotificationsService and count the notification ROWS in the DB: one
 *     completion (+ any number of re-uploads) → exactly one
 *     'Hoàn thành công việc' row. R7-DUP-1 FAILS on base 85fd7ba (2 rows)
 *     and PASSES after the fix.
 *
 * HARNESS: real mongod, standalone, started directly from the cached binary
 * — same pattern as jobs-requote-b6.spec.ts (MongoMemoryReplSet's bundled
 * driver fails the handshake against mongod 8.2.6). Port 27122 / dbpath
 * /tmp/mongo-r7-b so it does not clash with other R7 workers. Both suites
 * share this one mongod (one file) so they cannot clash with each other.
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
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
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
const DBPATH = '/tmp/mongo-r7-b';
const PORT = 27122;

const quoteDto = {
  labor_cost: 70000,
  materials_cost: 0,
  estimated_duration: 2,
} as never;

describe('R7-B (B6 owner override + duplicate completion notification, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let QuoteModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let UserModel: any;
  let NotificationModel: any;
  let gateway: any;
  let service: JobsService; // mocked notifications (B6 suite)
  let serviceRealNotify: JobsService; // REAL NotificationsService (DUP suite)

  async function seedJob() {
    const customer = await UserModel.create({
      phone: '0900000001',
      full_name: 'Khách Test',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER, UserRole.HELPER],
      active_role: UserRole.HELPER,
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
    const otherCustomer = await UserModel.create({
      phone: '0900000003',
      full_name: 'Khách Khác',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER],
      active_role: UserRole.CUSTOMER,
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
      title: 'TEST R7-B6',
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
    return { customer, helperUser, otherCustomer, job };
  }

  /** Job already IN_PROGRESS with the helper assigned, ready to complete. */
  async function seedInProgressJob() {
    const { customer, helperUser, job } = await seedJob();
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { status: JobStatus.IN_PROGRESS, helper_id: helperUser._id } },
    ).exec();
    const inProgress = await JobModel.findById(job._id);
    return { customer, helperUser, job: inProgress };
  }

  async function countCompletionNotifies(customerId: string, jobId: string) {
    return NotificationModel.countDocuments({
      user_id: new Types.ObjectId(customerId),
      type: 'job_completed',
      title: 'Hoàn thành công việc',
      'data.job_id': String(jobId),
    }).exec();
  }

  function buildService(notifications: any): JobsService {
    return new JobsService(
      JobModel,
      QuoteModel,
      conn.model(Contract.name) as never,
      ServiceModel,
      HelperModel,
      conn.model(HelperPenaltyEvent.name) as never,
      UserModel,
      gateway,
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
        '/tmp/mongo-r7-b-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/r7b`);
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
    NotificationModel = conn.model(Notification.name, NotificationSchema);

    gateway = {
      emitToUser: jest.fn(),
      emitToJob: jest.fn(),
      emitToAdmins: jest.fn(),
      broadcastHelperStatus: jest.fn().mockResolvedValue(undefined),
    };

    service = buildService({
      create: jest.fn().mockResolvedValue({}),
      notifyNewQuote: jest.fn().mockResolvedValue(undefined),
      notifyJobCompleted: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    });

    // REAL notifications service: create() writes real rows, emits to the
    // mocked gateway, and sendExpoPush exits early (no push tokens).
    const realNotifications = new NotificationsService(NotificationModel, UserModel, gateway, {
      sendForNotification: jest.fn().mockResolvedValue(undefined),
    } as never);
    serviceRealNotify = buildService(realNotifications);
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
    await NotificationModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('getJobQuotes customer-owner override (R7-B6)', () => {
    it('R7-B6-1 (control): owner with role customer sees the quote', async () => {
      const { customer, helperUser, job } = await seedJob();
      await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

      const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'customer');
      expect(quotes).toHaveLength(1);
      expect((quotes[0] as any).total_price).toBe(70000);
    });

    it('R7-B6-2 (the fix): owner with role helper sees the quote — not a silent []', async () => {
      const { customer, helperUser, job } = await seedJob();
      await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

      // The live B6 symptom: same owner id, JWT active_role 'helper'.
      const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'helper');
      expect(quotes).toHaveLength(1);
      expect((quotes[0] as any).total_price).toBe(70000);
      expect((quotes[0] as any).status).toBe(QuoteStatus.PENDING);
    });

    it('R7-B6-3 (guard): non-owner helper still sees only their own quotes', async () => {
      const { helperUser, job } = await seedJob();
      await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

      // The quoting helper (not the owner) keeps the helper view.
      const own = await service.getJobQuotes(String(job._id), String(helperUser._id), 'helper');
      expect(own).toHaveLength(1);

      // A different helper with no quote on this job sees nothing — the
      // owner override must not leak other helpers' quotes to strangers.
      const stranger = await UserModel.create({
        phone: '0900000004',
        full_name: 'Thợ Lạ',
        password_hash: 'x',
        roles: [UserRole.HELPER],
        active_role: UserRole.HELPER,
        status: UserStatus.ACTIVE,
        is_verified: true,
      });
      const strangerQuotes = await service.getJobQuotes(
        String(job._id),
        String(stranger._id),
        'helper',
      );
      expect(strangerQuotes).toHaveLength(0);
    });

    it('R7-B6-4 (guard): non-owner customer is still forbidden', async () => {
      const { helperUser, otherCustomer, job } = await seedJob();
      await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

      await expect(
        service.getJobQuotes(String(job._id), String(otherCustomer._id), 'customer'),
      ).rejects.toThrow();
    });

    it('R7-B6-5 (guard): owner with an unknown/other role still gets the customer view', async () => {
      const { customer, helperUser, job } = await seedJob();
      await service.submitQuote(String(helperUser._id), String(job._id), quoteDto);

      const quotes = await service.getJobQuotes(String(job._id), String(customer._id), 'admin');
      expect(quotes).toHaveLength(1);
    });
  });

  describe('one completion → exactly one notification (R7-DUP)', () => {
    it('R7-DUP-1 (the fix): complete + re-upload → exactly ONE "Hoàn thành công việc" row', async () => {
      const { customer, helperUser, job } = await seedInProgressJob();

      // First completion (helper submits evidence) — notifies once.
      const completed = await serviceRealNotify.completeByHelper(
        String(helperUser._id),
        String(job._id),
        { completion_photos: ['https://cdn.example.com/photo1.jpg'] } as never,
      );
      expect(completed.status).toBe(JobStatus.PENDING_REVIEW);
      expect(await countCompletionNotifies(String(customer._id), String(job._id))).toBe(1);

      // Re-upload (R4 button, or the offline queue replaying the completion
      // after a lost response) — must NOT notify a second time.
      const reuploaded = await serviceRealNotify.completeByHelper(
        String(helperUser._id),
        String(job._id),
        {
          completion_photos: [
            'https://cdn.example.com/photo1.jpg',
            'https://cdn.example.com/photo2.jpg',
          ],
        } as never,
      );
      expect(reuploaded.status).toBe(JobStatus.PENDING_REVIEW);
      expect(reuploaded.completion_photos).toHaveLength(2);
      expect(await countCompletionNotifies(String(customer._id), String(job._id))).toBe(1);

      // And the re-upload still fans out to the customer UI over socket.
      expect(gateway.emitToJob).toHaveBeenCalledWith(
        String(job._id),
        'job:completion_uploaded',
        expect.objectContaining({
          completion_photos: [
            'https://cdn.example.com/photo1.jpg',
            'https://cdn.example.com/photo2.jpg',
          ],
        }),
      );
    });

    it('R7-DUP-2 (control): a single first completion notifies exactly once', async () => {
      const { customer, helperUser, job } = await seedInProgressJob();

      await serviceRealNotify.completeByHelper(String(helperUser._id), String(job._id), {
        completion_photos: ['https://cdn.example.com/photo1.jpg'],
      } as never);

      expect(await countCompletionNotifies(String(customer._id), String(job._id))).toBe(1);
      // No other notification rows were created for this job at all.
      expect(
        await NotificationModel.countDocuments({ 'data.job_id': String(job._id) }).exec(),
      ).toBe(1);
    });
  });
});
