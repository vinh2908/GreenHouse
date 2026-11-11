import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  checkAndFixStuckAssignedJobs,
  runScriptEntryPoint,
} from '../../../../../scripts/check-stuck-assigned-jobs';
import { JobsService, setHelperBusyWithModels } from './jobs.service';
import { Job, JobSchema } from './schemas/job.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { HelperStatus } from '@homemate/types';

describe('O2, P4 & O6: checkAndFixStuckAssignedJobs and setHelperBusyWithModels', () => {
  describe('O2 & P4: setHelperBusyWithModels chạy trên raw MongoDB driver collection THẬT (MongoMemoryServer)', () => {
    let mongod: MongoMemoryServer;
    let client: MongoClient;
    let rawHelpersCol: any;
    let rawJobsCol: any;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      client = new MongoClient(mongod.getUri());
      await client.connect();
      const db = client.db('test_o2_p4_driver');
      rawHelpersCol = db.collection('helpers');
      rawJobsCol = db.collection('jobs');
    }, 60000);

    afterAll(async () => {
      if (client) await client.close();
      if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
      await rawHelpersCol.deleteMany({});
      await rawJobsCol.deleteMany({});
    });

    it('P4: trên driver MongoDB thật, update thiếu $set ném MongoInvalidArgumentError, còn code mới { $set: ... } chạy thành công và thả thợ về ONLINE', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439011');
      await rawHelpersCol.insertOne({ user_id: helperId, status: HelperStatus.BUSY });

      // 1. Chứng minh driver thật NÉM LỖI nếu không có $set (code cũ bị lỗi)
      await expect(
        rawHelpersCol.updateOne({ user_id: helperId }, { status: HelperStatus.ONLINE } as any),
      ).rejects.toThrow(/Update document requires atomic operators/i);

      // 2. Chạy hàm setHelperBusyWithModels với fix { $set: { status: HelperStatus.ONLINE } }
      await expect(
        setHelperBusyWithModels(rawHelpersCol, rawJobsCol, helperId, false),
      ).resolves.not.toThrow();

      // 3. Document thật trong MongoDB đã được cập nhật thành ONLINE
      const updated = await rawHelpersCol.findOne({ user_id: helperId });
      expect(updated).toBeDefined();
      expect(updated.status).toBe(HelperStatus.ONLINE);
    });

    it('P4: đặt thợ thành BUSY trên raw MongoDB driver collection thật dùng $set đúng chuẩn', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439011');
      await rawHelpersCol.insertOne({ user_id: helperId, status: HelperStatus.ONLINE });

      // 1. Update thiếu $set ném lỗi trên driver thật
      await expect(
        rawHelpersCol.updateOne({ user_id: helperId }, { status: HelperStatus.BUSY } as any),
      ).rejects.toThrow(/Update document requires atomic operators/i);

      // 2. Chạy hàm setHelperBusyWithModels với fix { $set: { status: HelperStatus.BUSY } }
      await expect(
        setHelperBusyWithModels(rawHelpersCol, rawJobsCol, helperId, true),
      ).resolves.not.toThrow();

      // 3. Document thật trong MongoDB đã được cập nhật thành BUSY
      const updated = await rawHelpersCol.findOne({ user_id: helperId });
      expect(updated).toBeDefined();
      expect(updated.status).toBe(HelperStatus.BUSY);
    });
  });

  describe('O6: checkAndFixStuckAssignedJobs script-level execution', () => {
    let originalConnection: any;

    beforeEach(() => {
      originalConnection = mongoose.connection;
    });

    afterEach(() => {
      Object.defineProperty(mongoose, 'connection', {
        value: originalConnection,
        configurable: true,
      });
    });

    describe('O6 (Q7(e)): fallback path chạy trên raw driver collection THẬT (MongoMemoryServer)', () => {
      let mongod: MongoMemoryServer;
      let client: MongoClient;
      let db: any;
      let rawHelpersCol: any;
      let rawJobsCol: any;

      beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        client = new MongoClient(mongod.getUri());
        await client.connect();
        db = client.db('test_o6_driver');
        rawHelpersCol = db.collection('helpers');
        rawJobsCol = db.collection('jobs');
      }, 60000);

      afterAll(async () => {
        if (client) await client.close();
        if (mongod) await mongod.stop();
      });

      beforeEach(async () => {
        await rawHelpersCol.deleteMany({});
        await rawJobsCol.deleteMany({});
        await db.collection('contracts').deleteMany({});
        // Nối mongoose.connection.db tới DB thật để script chạy đúng đường production
        // (script đọc mongoose.connection.db, không nhận db qua options).
        Object.defineProperty(mongoose, 'connection', {
          value: { readyState: 1, db },
          configurable: true,
        });
      });

      it('chạy fallback path với raw driver collection thật: unassign tất cả các đơn kẹt và thả thợ mà không crash', async () => {
        const helper1 = new Types.ObjectId('507f1f77bcf86cd799439011');
        const helper2 = new Types.ObjectId('507f1f77bcf86cd799439022');
        await rawHelpersCol.insertMany([
          { user_id: helper1, status: HelperStatus.BUSY },
          { user_id: helper2, status: HelperStatus.BUSY },
        ]);
        const jobId1 = new Types.ObjectId();
        const jobId2 = new Types.ObjectId();
        await rawJobsCol.insertMany([
          {
            _id: jobId1,
            title: 'Đơn kẹt 1',
            status: 'confirmed',
            helper_id: helper1,
            events: [],
          },
          {
            _id: jobId2,
            title: 'Đơn kẹt 2',
            status: 'quote_selected',
            helper_id: helper2,
            events: [],
          },
        ]);

        // Chạy script với disconnectOnFinish: false để không gọi mongoose.disconnect trong unit test
        await expect(
          checkAndFixStuckAssignedJobs({ disconnectOnFinish: false }),
        ).resolves.not.toThrow();

        // Cả 2 đơn đều được đưa về OPEN và gỡ helper_id — đọc lại từ collection THẬT
        const fixedJob1 = await rawJobsCol.findOne({ _id: jobId1 });
        const fixedJob2 = await rawJobsCol.findOne({ _id: jobId2 });
        expect(fixedJob1.status).toBe('open');
        expect(fixedJob1.helper_id).toBeNull();
        expect(fixedJob2.status).toBe('open');
        expect(fixedJob2.helper_id).toBeNull();
        // Script ghi lại event unassign bằng $push trên collection thật
        expect(fixedJob1.events).toHaveLength(1);
        expect(fixedJob1.events[0].status).toBe('open');
        expect(fixedJob2.events).toHaveLength(1);

        // Helpers được giải phóng về ONLINE trên collection thật
        // (qua $set của setHelperBusyWithModels — code cũ thiếu $set sẽ ném lỗi trên driver thật)
        const freedHelper1 = await rawHelpersCol.findOne({ user_id: helper1 });
        const freedHelper2 = await rawHelpersCol.findOne({ user_id: helper2 });
        expect(freedHelper1.status).toBe(HelperStatus.ONLINE);
        expect(freedHelper2.status).toBe(HelperStatus.ONLINE);
      });
    });

    it('khi truyền jobsService: giải phóng thợ qua JobsService.setHelperBusy thật', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439033');
      const stuckJob: any = {
        _id: new Types.ObjectId(),
        title: 'Đơn kẹt đơn lẻ',
        status: 'confirmed',
        helper_id: helperId,
        events: [],
      };

      const rawJobsCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([stuckJob]),
        }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
      const rawContractsCol = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const rawHelpersCol = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      const mockDb = {
        collection: jest.fn().mockImplementation((name: string) => {
          if (name === 'jobs') return rawJobsCol;
          if (name === 'contracts') return rawContractsCol;
          if (name === 'helpers') return rawHelpersCol;
          return {};
        }),
      };

      Object.defineProperty(mongoose, 'connection', {
        value: {
          readyState: 1,
          db: mockDb,
        },
        configurable: true,
      });

      const mockJobsService = {
        setHelperBusy: jest.fn().mockResolvedValue(true),
      };

      await checkAndFixStuckAssignedJobs({
        jobsService: mockJobsService,
        disconnectOnFinish: false,
      });

      expect(mockJobsService.setHelperBusy).toHaveBeenCalledWith(helperId, false);
      expect(rawHelpersCol.updateOne).not.toHaveBeenCalled();
    });

    // P6 (cũ, đã xóa ở Q5): test này chạy entry point với mongoose mock và
    // KHÔNG truyền jobsService, dựa vào object literal nội bộ của entry point
    // để gọi setHelperBusyWithModels. Q5 đã xóa object literal đó — entry point
    // giờ lấy JobsService thật từ Nest DI (mặc định) hoặc từ seam
    // jobsService/createJobsService. Đường entry-point + service thật được
    // kiểm chứng ở describe 'Q5' cuối file (test Q5-B dùng createJobsService).
  });
});

// ─── Q5: entry point nối JobsService THẬT ─────────────────────────────────────
// JobsService thật (class thật + model Mongoose thật trên MongoMemoryServer +
// gateway stub có spy broadcast) thay vì object literal / mock object.
// Chứng minh: spy trên setHelperBusy THẬT được gọi, helper về ONLINE trong DB
// thật, job kẹt về open, và broadcastHelperStatus được gọi.
describe('Q5: checkAndFixStuckAssignedJobs + entry point dùng JobsService THẬT', () => {
  let mongod: MongoMemoryServer;
  let db: any;
  let realService: JobsService;
  let setHelperBusySpy: jest.SpyInstance;
  let broadcastSpy: jest.Mock;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    db = mongoose.connection.db;

    const JobModel = (mongoose.models[Job.name] as any) ?? mongoose.model(Job.name, JobSchema);
    const HelperProfileModel =
      (mongoose.models[HelperProfile.name] as any) ??
      mongoose.model(HelperProfile.name, HelperProfileSchema);

    broadcastSpy = jest.fn().mockResolvedValue(undefined);
    const gatewayStub = { broadcastHelperStatus: broadcastSpy };
    const dummy = {} as never;
    realService = new JobsService(
      JobModel,
      dummy,
      dummy,
      dummy,
      HelperProfileModel,
      dummy,
      dummy,
      gatewayStub as any,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
    );
    setHelperBusySpy = jest.spyOn(realService, 'setHelperBusy');
  }, 60000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await db.collection('jobs').deleteMany({});
    await db.collection('contracts').deleteMany({});
    await db.collection('helperprofiles').deleteMany({});
    jest.clearAllMocks();
  });

  async function seedStuckJob() {
    const helperId = new Types.ObjectId('507f1f77bcf86cd799439055');
    const jobId = new Types.ObjectId();
    await db.collection('helperprofiles').insertOne({
      user_id: helperId,
      status: HelperStatus.BUSY,
      verification_status: 'approved',
    });
    await db.collection('jobs').insertOne({
      _id: jobId,
      title: 'Đơn kẹt Q5',
      status: 'confirmed',
      helper_id: helperId,
      customer_id: new Types.ObjectId(),
      events: [],
    });
    return { helperId, jobId };
  }

  it('Q5-A: chạy với JobsService THẬT — spy setHelperBusy thật được gọi, thợ về ONLINE trong DB thật, broadcast được gọi', async () => {
    const { helperId, jobId } = await seedStuckJob();

    await checkAndFixStuckAssignedJobs({
      jobsService: realService,
      disconnectOnFinish: false,
    });

    // setHelperBusy THẬT (không phải mock object) được gọi đúng tham số
    expect(setHelperBusySpy).toHaveBeenCalledTimes(1);
    expect(setHelperBusySpy).toHaveBeenCalledWith(helperId, false);

    // Đơn kẹt về OPEN + gỡ helper trong DB thật
    const job = await db.collection('jobs').findOne({ _id: jobId });
    expect(job.status).toBe('open');
    expect(job.helper_id).toBeNull();

    // Thợ về ONLINE trong DB thật (model Mongoose thật, $set nguyên tử)
    const helper = await db.collection('helperprofiles').findOne({ user_id: helperId });
    expect(helper.status).toBe(HelperStatus.ONLINE);

    // Broadcast helper:status_changed được gọi qua gateway thật của service
    expect(broadcastSpy).toHaveBeenCalledWith(String(helperId), HelperStatus.ONLINE);
  }, 30000);

  it('Q5-B (P6 mới): entry point (runScriptEntryPoint) nối service qua createJobsService và điều phối tới setHelperBusy THẬT', async () => {
    const { helperId, jobId } = await seedStuckJob();
    const factorySpy = jest.fn(async () => realService);

    await runScriptEntryPoint({
      createJobsService: factorySpy,
      disconnectOnFinish: false,
    });

    // Entry point đã gọi factory để lấy service (đường nối ở entry point)
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(setHelperBusySpy).toHaveBeenCalledTimes(1);
    expect(setHelperBusySpy).toHaveBeenCalledWith(helperId, false);

    const job = await db.collection('jobs').findOne({ _id: jobId });
    expect(job.status).toBe('open');
    expect(job.helper_id).toBeNull();

    const helper = await db.collection('helperprofiles').findOne({ user_id: helperId });
    expect(helper.status).toBe(HelperStatus.ONLINE);
    expect(broadcastSpy).toHaveBeenCalledWith(String(helperId), HelperStatus.ONLINE);
  }, 30000);
});
