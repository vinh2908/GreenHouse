/**
 * B7 (live 2026-11-14 09:31, blocks job C): the accept path refuses a quote
 * once the job's start time has passed ("Thời gian bắt đầu công việc đã qua.
 * Vui lòng cập nhật lại thời gian trước khi chọn thợ."), BUT the customer
 * edit modal had NO date/time field — and the server's updateJob ALSO
 * rejects ANY save on such a job (it validates the merged start time even
 * for an address-only edit). Any job whose start passes while quotes are
 * pending could never be accepted.
 *
 * FIX (client-only — the server already accepts + applies + validates
 * schedule fields in UpdateJobDto/updateJob): the edit modal now carries a
 * schedule section built from the APPROVED dropdown pickers
 * (TimeDropdownPicker + DurationDropdownPicker, date via the existing
 * DateTimePickerBottomSheet), prefilled by
 * apps/mobile/utils/job-schedule-edit.ts and sent only when changed.
 *
 * This spec proves the round-trip the modal relies on, against real mongod:
 *   util builds the patch -> updateJob persists the new schedule ->
 *   selectQuote's A1 gate stops throwing and the accept succeeds.
 * The util assertions FAIL on base 85fd7ba (the module does not exist there);
 * B7-0/B7-2 pass on base too — they pin the live bug and the server guards
 * the client mirrors.
 *
 * HARNESS: real mongod from the cached binary (MongoMemoryReplSet's bundled
 * driver fails the handshake against mongod 8.2.6). Port 27121 / dbpath
 * /tmp/mongo-r7-a so it does not clash with other R7 workers.
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
import {
  deriveEditSchedule,
  buildSchedulePatchIfChanged,
  buildSchedulePatch,
  isFutureStart,
  validateEditSchedule,
  durationMinutesOf,
  vnDateKeyOffset,
} from '@/utils/job-schedule-edit';

jest.setTimeout(90000);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MONGOD = `${process.env.HOME}/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6`;
const DBPATH = '/tmp/mongo-r7-a';
const PORT = 27121;

describe('JobsService update schedule rescues a past-start job (B7, real mongod)', () => {
  let conn: mongoose.Connection;
  let JobModel: any;
  let QuoteModel: any;
  let ServiceModel: any;
  let HelperModel: any;
  let UserModel: any;
  let service: JobsService;

  async function seedPastStartJob() {
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
    // Live shape of job C: quotes pending, start already passed (yesterday
    // 10:00), quote window still open (expires_at +72h).
    const job = await JobModel.create({
      customer_id: customer._id,
      service_id: svc._id,
      title: 'TEST B7 past start',
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
    return { customer, helperUser, job };
  }

  // Coordinator fixup (R7 merge): R7 item 2 now REJECTS new quotes on
  // past-start unassigned jobs at the submitQuote guard, so a pending quote
  // on such a job can only exist if it was submitted while the start was
  // still future (the real job-C shape) — seed it directly instead of
  // going through the endpoint.
  async function seedPendingQuote(job: any, helperUser: any) {
    return QuoteModel.create({
      job_id: job._id,
      helper_id: helperUser._id,
      status: QuoteStatus.PENDING,
      labor_cost: 70000,
      materials_cost: 0,
      total_price: 70000,
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
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
        '/tmp/mongo-r7-a-mongod.log',
        '--fork',
      ],
      { stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      child.on('exit', c => (c === 0 ? resolve() : reject(new Error(`mongod fork exit ${c}`))));
    });
    conn = mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/b7`);
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
    await ServiceModel.deleteMany({});
    await HelperModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  it('B7-0 (repro): past start + pending quote -> accept throws the live error', async () => {
    const { customer, helperUser, job } = await seedPastStartJob();
    const quote = await seedPendingQuote(job, helperUser);
    expect(quote.status).toBe(QuoteStatus.PENDING);

    await expect(
      service.selectQuote(String(customer._id), String(job._id), {
        quote_id: String(quote._id),
      }),
    ).rejects.toThrow('Thời gian bắt đầu công việc đã qua');
  });

  it('B7-1: util patch + updateJob reschedules -> the SAME quote can then be accepted', async () => {
    const { customer, helperUser, job } = await seedPastStartJob();
    const quote = await seedPendingQuote(job, helperUser);

    // The modal prefills the CURRENT schedule — even though it is past —
    // and the pickers flag it; the user moves it to tomorrow 10:00.
    const original = deriveEditSchedule(job as any);
    expect(isFutureStart(original.date, original.timeStart)).toBe(false);
    expect(validateEditSchedule(original)).toBe('past');
    // Unchanged schedule sends NOTHING (no silent schedule invention).
    expect(buildSchedulePatchIfChanged(original, original)).toBeNull();

    const edited = {
      date: vnDateKeyOffset(Date.now(), 1),
      timeStart: '10:00',
      durationMinutes: 120,
    };
    expect(validateEditSchedule(edited)).toBeNull();
    const patch = buildSchedulePatchIfChanged(original, edited);
    expect(patch).toEqual({
      preferred_date: edited.date,
      preferred_time_start: '10:00',
      preferred_time_end: '12:00',
    });

    const updated = await service.updateJob(String(customer._id), String(job._id), patch as never);
    expect(updated.preferred_time_start).toBe('10:00');
    expect(updated.preferred_time_end).toBe('12:00');
    const stored = await JobModel.findById(job._id).lean();
    expect(new Date(stored.preferred_date).toISOString().slice(0, 10)).toBe(edited.date);

    // The accept that threw in B7-0 now succeeds end to end.
    const { job: acceptedJob, contract } = await service.selectQuote(
      String(customer._id),
      String(job._id),
      { quote_id: String(quote._id) },
    );
    expect(acceptedJob.status).toBe(JobStatus.CONFIRMED);
    expect(String(contract.job_id)).toBe(String(job._id));
    expect(contract.total_price).toBe(70000);
  });

  it('B7-2 (server guards the client mirrors): past / out-of-hours reschedule is rejected', async () => {
    const { customer, job } = await seedPastStartJob();

    // Even an address-only save fails while the start is past — this is why
    // the modal MUST carry the schedule editor, not just the address fields.
    await expect(
      service.updateJob(String(customer._id), String(job._id), {
        title: 'Đổi tiêu đề thôi',
      } as never),
    ).rejects.toThrow('Thời điểm bắt đầu không thể ở quá khứ');

    // Past date via the patch itself.
    await expect(
      service.updateJob(String(customer._id), String(job._id), {
        preferred_date: vnDateKeyOffset(Date.now(), -1),
        preferred_time_start: '10:00',
        preferred_time_end: '12:00',
      } as never),
    ).rejects.toThrow('Thời điểm bắt đầu không thể ở quá khứ');

    // Outside 07:00–22:00.
    await expect(
      service.updateJob(String(customer._id), String(job._id), {
        preferred_date: vnDateKeyOffset(Date.now(), 1),
        preferred_time_start: '06:00',
        preferred_time_end: '08:00',
      } as never),
    ).rejects.toThrow('07:00–22:00');
  });

  describe('B7-3: job-schedule-edit util (pure, no DB)', () => {
    const nowMs = Date.now();

    it('derives the current schedule (past values kept for prefill)', () => {
      const s = deriveEditSchedule({
        preferred_date: new Date(nowMs - 24 * 60 * 60 * 1000),
        preferred_time_start: '10:00',
        preferred_time_end: '12:00',
        estimated_duration: 2,
      });
      expect(s.timeStart).toBe('10:00');
      expect(s.durationMinutes).toBe(120);
      expect(isFutureStart(s.date, s.timeStart, nowMs)).toBe(false);
    });

    it('defaults to tomorrow 09:00 / 60 min when the job has no schedule', () => {
      const s = deriveEditSchedule({});
      expect(s.date).toBe(vnDateKeyOffset(nowMs, 1));
      expect(s.timeStart).toBe('09:00');
      expect(s.durationMinutes).toBe(60);
    });

    it('duration comes from the time span, else estimated_duration, clamped to [15, 720]', () => {
      expect(
        durationMinutesOf({ preferred_time_start: '10:00', preferred_time_end: '10:10' }),
      ).toBe(15);
      expect(durationMinutesOf({ estimated_duration: 0.25 })).toBe(15);
      expect(durationMinutesOf({ estimated_duration: 13 })).toBe(720);
      expect(durationMinutesOf({ estimated_duration: 2 })).toBe(120);
    });

    it('validation codes mirror the server rules', () => {
      const tomorrow = vnDateKeyOffset(nowMs, 1);
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '06:00', durationMinutes: 60 }, nowMs),
      ).toBe('outside_hours');
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '22:30', durationMinutes: 60 }, nowMs),
      ).toBe('outside_hours');
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '10:00', durationMinutes: 10 }, nowMs),
      ).toBe('too_short');
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '10:00', durationMinutes: 721 }, nowMs),
      ).toBe('too_long');
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '22:00', durationMinutes: 180 }, nowMs),
      ).toBe('crosses_midnight');
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '22:00', durationMinutes: 60 }, nowMs),
      ).toBeNull(); // 22:00 + 60m = 23:00, same day — valid
      expect(
        validateEditSchedule({ date: tomorrow, timeStart: '10:00', durationMinutes: 120 }, nowMs),
      ).toBeNull();
    });

    it('buildSchedulePatch returns null when the end would cross midnight', () => {
      expect(
        buildSchedulePatch({ date: '2026-11-15', timeStart: '22:00', durationMinutes: 180 }),
      ).toBeNull();
      expect(
        buildSchedulePatch({ date: '2026-11-15', timeStart: '22:00', durationMinutes: 60 }),
      ).toEqual({
        preferred_date: '2026-11-15',
        preferred_time_start: '22:00',
        preferred_time_end: '23:00',
      });
      expect(
        buildSchedulePatch({ date: '2026-11-15', timeStart: '10:00', durationMinutes: 90 }),
      ).toEqual({
        preferred_date: '2026-11-15',
        preferred_time_start: '10:00',
        preferred_time_end: '11:30',
      });
    });
  });
});
