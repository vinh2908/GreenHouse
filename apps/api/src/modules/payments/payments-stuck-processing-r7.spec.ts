/**
 * R7 watchdog (i): PROCESSING payments older than 15 min are ALREADY
 * reclaimable — verify the existing clearStuckProcessingPayments, do not
 * duplicate it. Drives the real method against a real mongod: a job stuck
 * in PROCESSING for > 15 min returns to UNPAID; a fresh PROCESSING job and
 * a PAID job are untouched.
 *
 * FAILS on base 85fd7ba only in the sense that the reclaim did not exist
 * there — this spec documents the backstop that the R7 watchdog relies on
 * (R5 F19). It passes on branch; on base the method exists too (added R5),
 * so this is a verification spec, not a fail-on-old-code spec.
 *
 * HARNESS: real mongod from the cached binary. Port 27126 / dbpath
 * /tmp/mongo-r7-a-6 (separate port so suites can run in parallel).
 */
import mongoose, { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { JobStatus, PaymentStatus, UserStatus, UserRole } from '@homemate/types';
import {
  startStandaloneMongo,
  stopStandaloneMongo,
  StandaloneMongoTestInstance,
} from '../../../test/standalone-mongo-helper';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('Stuck PROCESSING reclaim (R7 watchdog (i), real mongod)', () => {
  let instance: StandaloneMongoTestInstance;
  let conn: mongoose.Connection;
  let JobModel: any;
  let service: PaymentsService;

  beforeAll(async () => {
    instance = await startStandaloneMongo();
    conn = instance.conn;

    JobModel = conn.model(Job.name, JobSchema);
    conn.model(Service.name, ServiceSchema);
    conn.model(User.name, UserSchema);
    const mockModel = {} as never;
    service = new PaymentsService(
      mockModel,
      mockModel,
      mockModel,
      mockModel,
      {} as never,
      {} as never,
      {} as never,
      JobModel,
    );
  });

  it('reclaims PROCESSING > 15 min to UNPAID; leaves fresh PROCESSING and PAID alone', async () => {
    const customer = await conn.model(User.name).create({
      phone: '0900000001',
      full_name: 'Khách Test',
      password_hash: 'x',
      roles: [UserRole.CUSTOMER],
      active_role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      is_verified: true,
    });
    const svc = await conn.model(Service.name).create({
      category_id: new Types.ObjectId(),
      name: 'Giúp việc theo giờ',
      slug: 'giup-viec-theo-gio',
      description: 'Dọn nhà theo giờ',
      platform_fee_percent: 15,
    });
    const base = {
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST P reclaim',
      description: 'Dọn nhà',
      address: {
        full_address: '123 Lê Lợi, Đà Nẵng',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.21, 16.06] },
      },
      status: JobStatus.PENDING_REVIEW,
      preferred_date: new Date(),
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    };
    const stuck = await JobModel.create({ ...base, payment_status: PaymentStatus.PROCESSING });
    const fresh = await JobModel.create({ ...base, payment_status: PaymentStatus.PROCESSING });
    const paid = await JobModel.create({ ...base, payment_status: PaymentStatus.PAID });
    // Raw driver update: bypass Mongoose timestamp middleware so the
    // stuck job really looks 20 min old (both timestamp spellings).
    const old = new Date(Date.now() - 20 * 60 * 1000);
    await JobModel.collection.updateOne(
      { _id: stuck._id },
      { $set: { updated_at: old, updatedAt: old } },
    );
    const freshTs = new Date(Date.now() - 2 * 60 * 1000);
    await JobModel.collection.updateOne(
      { _id: fresh._id },
      { $set: { updated_at: freshTs, updatedAt: freshTs } },
    );

    const reclaimed = await service.clearStuckProcessingPayments();
    expect(reclaimed).toBe(1);

    const stuckAfter = await JobModel.findById(stuck._id).lean();
    expect(stuckAfter.payment_status).toBe(PaymentStatus.UNPAID);
    const freshAfter = await JobModel.findById(fresh._id).lean();
    expect(freshAfter.payment_status).toBe(PaymentStatus.PROCESSING);
    const paidAfter = await JobModel.findById(paid._id).lean();
    expect(paidAfter.payment_status).toBe(PaymentStatus.PAID);

    // Second run: nothing left to reclaim.
    expect(await service.clearStuckProcessingPayments()).toBe(0);
  });

  afterAll(async () => {
    await stopStandaloneMongo(instance);
  });
});
