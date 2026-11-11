import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  checkAndFixStuckAssignedJobs,
  runScriptEntryPoint,
} from '../../../../../scripts/check-stuck-assigned-jobs';
import { setHelperBusyWithModels } from './jobs.service';
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

    it('P6: entry point của script (runScriptEntryPoint) tự động nối jobsService và điều phối tới JobsService.setHelperBusy thật', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439044');
      const stuckJob: any = {
        _id: new Types.ObjectId(),
        title: 'Đơn kẹt chạy qua entry point script',
        status: 'confirmed',
        helper_id: helperId,
        events: [],
      };

      const rawJobsCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([stuckJob]),
        }),
        updateOne: jest.fn().mockImplementation(async (filter: any, update: any) => {
          if (filter._id === stuckJob._id) {
            stuckJob.status = update.$set.status;
            stuckJob.helper_id = update.$set.helper_id;
          }
          return { modifiedCount: 1 };
        }),
        countDocuments: jest.fn().mockResolvedValue(0),
      };
      const rawContractsCol = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const rawHelpersCol = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      const mockDb = {
        listCollections: jest.fn().mockReturnValue({
          hasNext: jest.fn().mockResolvedValue(true), // tìm thấy helperprofiles
        }),
        collection: jest.fn().mockImplementation((name: string) => {
          if (name === 'jobs') return rawJobsCol;
          if (name === 'contracts') return rawContractsCol;
          if (name === 'helperprofiles' || name === 'helpers') return rawHelpersCol;
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

      // Chạy qua entry point thật của script
      await runScriptEntryPoint({ disconnectOnFinish: false });

      // Đơn bị unassign về OPEN
      expect(stuckJob.status).toBe('open');
      expect(stuckJob.helper_id).toBeNull();

      // Thợ được giải phóng về ONLINE với toán tử $set nguyên tử trên collection helperprofiles
      expect(rawHelpersCol.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: helperId }),
        { $set: { status: HelperStatus.ONLINE } },
      );
    });
  });
});
