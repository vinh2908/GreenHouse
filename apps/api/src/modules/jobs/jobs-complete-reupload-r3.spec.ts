/**
 * R3-B5a: completeByHelper must allow an evidence-only re-upload when the
 * job is already PENDING_REVIEW.
 *
 * LIVE 2026-11-13 12:41-12:42: job B (6af59e07bb2b94f98da7e088) is stranded
 * at step 7 pending_review with ZERO completion photos — the helper
 * submitted completion without photos and the app accepted it. The
 * customer can then never accept: approveCompletion's B57 gate throws
 * 'Chưa có ảnh bằng chứng hoàn thành...' on every accept, and re-submitting
 * evidence throws too, because completeByHelper calls
 * validateTransition(job.status, PENDING_REVIEW) and JOB_STATUS_TRANSITIONS
 * has PENDING_REVIEW → [COMPLETED, DISPUTED] only.
 *
 * Fix: an explicit evidence-only branch inside completeByHelper — when the
 * job is already PENDING_REVIEW, update completion_photos/videos/notes from
 * the DTO, save, emit + notify as today, but do NOT change status and do
 * NOT re-run the IN_PROGRESS → PENDING_REVIEW transition. The global state
 * machine is untouched (no PENDING_REVIEW → PENDING_REVIEW edge added).
 *
 * Uses the REAL JobsService on mongodb-memory-server (same pattern as the
 * R2 specs in this directory). Tests R3-B5a-1..2 FAIL on old code (ce3e227)
 * and PASS after the fix; R3-B5a-3..4 guard the behaviour that must not
 * change (invalid status still throws, non-owner still 403).
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
  PaymentStatus,
  VerificationStatus,
  HelperStatus,
  UserStatus,
} from '@homemate/types';

describe('JobsService completeByHelper evidence re-upload (R3-B5a, real documents)', () => {
  let mongod: MongoMemoryServer;
  let JobModel: any;
  let QuoteModel: any;
  let ContractModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let gateway: any;
  let notifications: any;
  let paymentsService: any;
  let loyaltyService: any;

  function buildService(): JobsService {
    const dummy = {} as never;
    return new JobsService(
      JobModel,
      QuoteModel,
      ContractModel,
      ServiceModel,
      HelperModel,
      dummy,
      dummy,
      gateway,
      notifications,
      dummy,
      paymentsService,
      dummy,
      dummy,
      dummy,
      loyaltyService,
      dummy,
    );
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    JobModel = mongoose.models[Job.name] ?? mongoose.model(Job.name, JobSchema);
    QuoteModel = mongoose.models[Quote.name] ?? mongoose.model(Quote.name, QuoteSchema);
    ContractModel = mongoose.models[Contract.name] ?? mongoose.model(Contract.name, ContractSchema);
    ServiceModel = mongoose.models[Service.name] ?? mongoose.model(Service.name, ServiceSchema);
    HelperModel =
      mongoose.models[HelperProfile.name] ??
      mongoose.model(HelperProfile.name, HelperProfileSchema);
    mongoose.models[User.name] ?? mongoose.model(User.name, UserSchema);
    gateway = {
      emitToUser: jest.fn(),
      emitToJob: jest.fn(),
      emitToAdmins: jest.fn(),
      broadcastHelperStatus: jest.fn().mockResolvedValue(undefined),
    };
    notifications = {
      notifyNewQuote: jest.fn().mockResolvedValue(undefined),
      notifyJobCompleted: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({}),
    };
    paymentsService = {
      hasVerifiedWalletPayment: jest.fn().mockResolvedValue(true),
      hasSimulatedOnlinePayment: jest.fn().mockResolvedValue(false),
      hasRecordedCashPayment: jest.fn().mockResolvedValue(false),
      getTotalPaidForJob: jest.fn().mockResolvedValue(0),
      runMoneyTransaction: jest.fn(async (fn: (s: any) => Promise<any>) => fn(undefined)),
      creditHelper: jest.fn().mockResolvedValue({}),
      creditHelperSimulated: jest.fn().mockResolvedValue({}),
      deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
      deductWallet: jest.fn().mockResolvedValue({}),
    };
    loyaltyService = { awardForJob: jest.fn().mockResolvedValue(0) };
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Seeds a job in the EXACT stranded shape of live job B: status
   * pending_review, helper assigned, completion_photos [] (helper submitted
   * completion with no photos), paid online so the A2 guard passes.
   */
  async function seedStranded(opts: { status?: JobStatus } = {}) {
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
      helper_id: helperId,
      service_id: serviceId,
      title: 'Job B probe',
      description: 'probe',
      status: opts.status ?? JobStatus.PENDING_REVIEW,
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
      // Exact stranded shape: no completion evidence at all.
      completion_photos: [],
      completion_videos: [],
      payment_status: PaymentStatus.PAID,
      payment_method: 'wallet',
    });
    return { customerId, helperId, job };
  }

  it('R3-B5a-1: stranded job (pending_review, 0 photos) + helper re-uploads 1 photo → succeeds, status stays pending_review, photo saved', async () => {
    const { helperId, job } = await seedStranded();
    const svc = buildService();

    const res = await svc.completeByHelper(String(helperId), String(job._id), {
      completion_photos: ['https://cdn.example.com/photo1.jpg'],
      completion_notes: 'Đã dọn xong, bổ sung ảnh',
    } as never);

    expect(res.status).toBe(JobStatus.PENDING_REVIEW);
    expect(res.completion_photos).toEqual(['https://cdn.example.com/photo1.jpg']);
    expect(res.completion_notes).toBe('Đã dọn xong, bổ sung ảnh');
    // Persisted, not just returned: re-read from the DB.
    const after = await JobModel.findById(job._id).lean();
    expect(after?.status).toBe(JobStatus.PENDING_REVIEW);
    expect(after?.completion_photos).toEqual(['https://cdn.example.com/photo1.jpg']);
    // Same fan-out as the normal completion path, EXCEPT the notify: R7
    // (live 2026-11-14) — a re-upload is not a new completion, the customer
    // was already notified at the first completion, so re-notifying sends a
    // second identical 'Hoàn thành công việc' notification.
    expect(gateway.emitToJob).toHaveBeenCalledWith(
      String(job._id),
      'job:completion_uploaded',
      expect.objectContaining({
        completion_photos: ['https://cdn.example.com/photo1.jpg'],
      }),
    );
    expect(notifications.notifyJobCompleted).not.toHaveBeenCalled();
  }, 60000);

  it('R3-B5a-2: after re-upload the same job passes approveCompletion (B57 satisfied) → COMPLETED', async () => {
    const { customerId, helperId, job } = await seedStranded();
    const svc = buildService();

    // Stranded shape first: approve must fail on B57 before the re-upload.
    await expect(
      svc.approveCompletion(String(customerId), String(job._id), {
        rating: 5,
        review: 'Tốt',
      } as never),
    ).rejects.toThrow('Chưa có ảnh bằng chứng hoàn thành');

    await svc.completeByHelper(String(helperId), String(job._id), {
      completion_photos: ['https://cdn.example.com/photo1.jpg'],
    } as never);

    const res = await svc.approveCompletion(String(customerId), String(job._id), {
      rating: 5,
      review: 'Tốt',
    } as never);

    expect(res.status).toBe(JobStatus.COMPLETED);
    const after = await JobModel.findById(job._id).lean();
    expect(after?.status).toBe(JobStatus.COMPLETED);
    expect(after?.completion_photos).toEqual(['https://cdn.example.com/photo1.jpg']);
  }, 60000);

  it('R3-B5a-3: completeByHelper from an invalid status (CONFIRMED) still throws', async () => {
    const { helperId, job } = await seedStranded({ status: JobStatus.CONFIRMED });
    const svc = buildService();

    await expect(
      svc.completeByHelper(String(helperId), String(job._id), {
        completion_photos: ['https://cdn.example.com/photo1.jpg'],
      } as never),
    ).rejects.toThrow('Không thể chuyển trạng thái');

    const after = await JobModel.findById(job._id).lean();
    expect(after?.status).toBe(JobStatus.CONFIRMED);
    expect(after?.completion_photos).toEqual([]);
  }, 60000);

  it('R3-B5a-4: non-owner helper re-uploading evidence still 403', async () => {
    const { job } = await seedStranded();
    const svc = buildService();
    const otherHelperId = new Types.ObjectId();

    await expect(
      svc.completeByHelper(String(otherHelperId), String(job._id), {
        completion_photos: ['https://cdn.example.com/photo1.jpg'],
      } as never),
    ).rejects.toMatchObject({ status: 403 });

    const after = await JobModel.findById(job._id).lean();
    expect(after?.status).toBe(JobStatus.PENDING_REVIEW);
    expect(after?.completion_photos).toEqual([]);
  }, 60000);
});
