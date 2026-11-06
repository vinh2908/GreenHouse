import { Types } from 'mongoose';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { VerificationStatus } from '@homemate/types';

/** Spec B63: getOptimalHelpers limit 1–20, mặc định 10. */
describe('MatchingController.getOptimalHelpers (B63)', () => {
  const user = { sub: new Types.ObjectId().toHexString(), roles: ['customer'] };
  const jobId = new Types.ObjectId().toHexString();

  function makeController() {
    const service = {
      findOptimalHelpersForJob: jest.fn(async () => []),
    };
    const controller = new MatchingController(service as never);
    return { controller, service };
  }

  it('limit = 0 → 400', async () => {
    const { controller } = makeController();
    await expect(controller.getOptimalHelpers(user, jobId, 0)).rejects.toThrow(
      'limit phải là số nguyên từ 1 đến 20',
    );
  });

  it('limit = 21 → 400', async () => {
    const { controller } = makeController();
    await expect(controller.getOptimalHelpers(user, jobId, 21)).rejects.toThrow(
      'limit phải là số nguyên từ 1 đến 20',
    );
  });

  it('limit = 2.5 → 400', async () => {
    const { controller } = makeController();
    await expect(controller.getOptimalHelpers(user, jobId, 2.5)).rejects.toThrow(
      'limit phải là số nguyên từ 1 đến 20',
    );
  });

  it('không truyền limit → service nhận undefined (mặc định 10 ở service)', async () => {
    const { controller, service } = makeController();
    await controller.getOptimalHelpers(user, jobId);
    expect(service.findOptimalHelpersForJob).toHaveBeenCalledWith(
      jobId,
      user.sub,
      user.roles,
      undefined,
    );
  });

  it('limit = 5 → service nhận 5', async () => {
    const { controller, service } = makeController();
    await controller.getOptimalHelpers(user, jobId, 5);
    expect(service.findOptimalHelpersForJob).toHaveBeenCalledWith(jobId, user.sub, user.roles, 5);
  });
});

describe('MatchingService.findOptimalHelpersForJob (B63)', () => {
  const customerId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  function makeHelpers(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      _id: new Types.ObjectId(),
      user_id: {
        _id: new Types.ObjectId(),
        full_name: `Thợ ${i + 1}`,
        phone: '0900000000',
      },
      rating: 5 - (i % 5) * 0.1,
      verification_status: VerificationStatus.APPROVED,
      service_ids: [],
    }));
  }

  function makeService(helperCount: number) {
    const job: any = {
      _id: jobId,
      customer_id: customerId,
      title: 'Dọn nhà',
      address: { district: 'Hải Châu', city: 'Đà Nẵng' },
      service_id: null,
    };
    const jobModel: any = {
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ exec: async () => job })),
      })),
    };
    const helperModel: any = {
      find: jest.fn(() => ({
        populate: jest.fn(() => ({ exec: async () => makeHelpers(helperCount) })),
      })),
    };
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
      invalidateJob: jest.fn(async () => undefined),
    };
    const service = new MatchingService(
      jobModel,
      helperModel,
      {} as never,
      {} as never,
      cache as never,
    );
    return service;
  }

  it('mặc định trả tối đa 10 thợ khi có 12 thợ', async () => {
    const service = makeService(12);
    const result = await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    expect(result).toHaveLength(10);
  });

  it('limit = 3 → trả 3 thợ', async () => {
    const service = makeService(12);
    const result = await service.findOptimalHelpersForJob(
      String(jobId),
      String(customerId),
      undefined,
      3,
    );
    expect(result).toHaveLength(3);
  });

  it('limit = 25 (vượt) → kẹp về 20', async () => {
    const service = makeService(25);
    const result = await service.findOptimalHelpersForJob(
      String(jobId),
      String(customerId),
      undefined,
      25,
    );
    expect(result).toHaveLength(20);
  });
});
