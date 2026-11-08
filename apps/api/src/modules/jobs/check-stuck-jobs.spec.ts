import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { checkAndFixStuckAssignedJobs } from '../../../../../scripts/check-stuck-assigned-jobs';
import { setHelperBusyWithModels } from './jobs.service';
import { HelperStatus } from '@homemate/types';

describe('O2 & O6: checkAndFixStuckAssignedJobs and setHelperBusyWithModels', () => {
  describe('O2: setHelperBusyWithModels hỗ trợ cả native collection (bắt buộc $set) và Mongoose model', () => {
    it('thả thợ về ONLINE trên raw MongoDB driver collection không bị lỗi MongoInvalidArgumentError', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439011');
      let helperStatus = HelperStatus.BUSY;

      // Mock native collection của MongoDB driver: ném lỗi nếu update không có atomic operator ($set, ...)
      const rawHelpersCol = {
        updateOne: jest.fn().mockImplementation(async (filter: any, update: any) => {
          const keys = Object.keys(update);
          const hasAtomicOp = keys.some(k => k.startsWith('$'));
          if (!hasAtomicOp) {
            throw new Error('MongoInvalidArgumentError: Update document requires atomic operators');
          }
          if (update.$set?.status) {
            helperStatus = update.$set.status;
          }
          return { acknowledged: true, modifiedCount: 1 };
        }),
      };

      const rawJobsCol = {
        countDocuments: jest.fn().mockResolvedValue(0), // không còn đơn hoạt động nào khác
      };

      // Gọi setHelperBusyWithModels với busy = false
      await expect(
        setHelperBusyWithModels(rawHelpersCol, rawJobsCol, helperId, false),
      ).resolves.not.toThrow();

      expect(rawHelpersCol.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: helperId, status: HelperStatus.BUSY }),
        { $set: { status: HelperStatus.ONLINE } },
      );
      expect(helperStatus).toBe(HelperStatus.ONLINE);
    });

    it('đặt thợ thành BUSY trên raw MongoDB driver collection dùng $set đúng chuẩn', async () => {
      const helperId = new Types.ObjectId('507f1f77bcf86cd799439011');
      const rawHelpersCol = {
        updateOne: jest.fn().mockImplementation(async (filter: any, update: any) => {
          const keys = Object.keys(update);
          const hasAtomicOp = keys.some(k => k.startsWith('$'));
          if (!hasAtomicOp) {
            throw new Error('MongoInvalidArgumentError: Update document requires atomic operators');
          }
          return { acknowledged: true, modifiedCount: 1 };
        }),
      };
      const rawJobsCol = { countDocuments: jest.fn().mockResolvedValue(0) };

      await expect(
        setHelperBusyWithModels(rawHelpersCol, rawJobsCol, helperId, true),
      ).resolves.not.toThrow();

      expect(rawHelpersCol.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: helperId, status: { $ne: HelperStatus.BUSY } }),
        { $set: { status: HelperStatus.BUSY } },
      );
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

    it('chạy fallback path với raw driver collection: unassign tất cả các đơn kẹt và thả thợ mà không crash', async () => {
      const helper1 = new Types.ObjectId('507f1f77bcf86cd799439011');
      const helper2 = new Types.ObjectId('507f1f77bcf86cd799439022');
      const stuckJob1: any = {
        _id: new Types.ObjectId(),
        title: 'Đơn kẹt 1',
        status: 'confirmed',
        helper_id: helper1,
        events: [],
      };
      const stuckJob2: any = {
        _id: new Types.ObjectId(),
        title: 'Đơn kẹt 2',
        status: 'quote_selected',
        helper_id: helper2,
        events: [],
      };

      const rawJobsCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([stuckJob1, stuckJob2]),
        }),
        updateOne: jest.fn().mockImplementation(async (filter: any, update: any) => {
          const target = [stuckJob1, stuckJob2].find(j => String(j._id) === String(filter._id));
          if (target && update.$set) {
            Object.assign(target, update.$set);
          }
          return { modifiedCount: 1 };
        }),
        countDocuments: jest.fn().mockResolvedValue(0),
      };

      const rawContractsCol = {
        findOne: jest.fn().mockResolvedValue(null), // Cả 2 đơn đều không có hợp đồng (đơn kẹt)
      };

      const rawHelpersCol = {
        updateOne: jest.fn().mockImplementation(async (filter: any, update: any) => {
          const keys = Object.keys(update);
          if (!keys.some(k => k.startsWith('$'))) {
            throw new Error('MongoInvalidArgumentError: Update document requires atomic operators');
          }
          return { modifiedCount: 1 };
        }),
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

      // Chạy script với disconnectOnFinish: false để không gọi mongoose.disconnect trong unit test
      await expect(
        checkAndFixStuckAssignedJobs({ disconnectOnFinish: false }),
      ).resolves.not.toThrow();

      // Cả 2 đơn đều được đưa về OPEN và gỡ helper_id
      expect(stuckJob1.status).toBe('open');
      expect(stuckJob1.helper_id).toBeNull();
      expect(stuckJob2.status).toBe('open');
      expect(stuckJob2.helper_id).toBeNull();

      // Helpers được gọi updateOne giải phóng trạng thái với toán tử $set
      expect(rawHelpersCol.updateOne).toHaveBeenCalledTimes(2);
      expect(rawHelpersCol.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: helper1 }),
        { $set: { status: HelperStatus.ONLINE } },
      );
      expect(rawHelpersCol.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: helper2 }),
        { $set: { status: HelperStatus.ONLINE } },
      );
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
  });
});
