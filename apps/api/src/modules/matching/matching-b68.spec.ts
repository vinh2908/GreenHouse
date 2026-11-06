import { Types } from 'mongoose';
import { MatchingService } from './matching.service';
import { VerificationStatus } from '@homemate/types';

/**
 * Spec B68: gợi ý thợ lọc trước (đúng service, trong 20km) rồi mới tính điểm.
 * Công thức tính điểm (A67) không đổi.
 */
describe('MatchingService.findOptimalHelpersForJob (B68)', () => {
  const customerId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const serviceId = new Types.ObjectId();
  const otherServiceId = new Types.ObjectId();

  // Đà Nẵng: job ở (16.07, 108.22); helper gần ở (16.08, 108.22) ~1.1km;
  // helper xa ở (16.30, 108.22) ~25.6km.
  function helper(id: string, serviceIds: Types.ObjectId[], coords?: [number, number]) {
    return {
      _id: new Types.ObjectId(),
      user_id: { _id: new Types.ObjectId(), full_name: `Thợ ${id}`, phone: '0900' },
      rating: 5,
      verification_status: VerificationStatus.APPROVED,
      service_ids: serviceIds,
      location: coords ? { coordinates: coords } : undefined,
    };
  }

  function makeService(helpers: any[], jobServiceId: Types.ObjectId | null) {
    const job: any = {
      _id: jobId,
      customer_id: customerId,
      title: 'Dọn nhà',
      address: {
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { coordinates: [108.22, 16.07] },
      },
      service_id: jobServiceId,
    };
    const jobModel: any = {
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ exec: async () => job })),
      })),
    };
    // Mock tôn trọng filter service_ids như Mongo (chứng minh query có lọc)
    const helperModel: any = {
      find: jest.fn((filter: any) => ({
        populate: jest.fn(() => ({
          exec: async () =>
            filter?.service_ids
              ? helpers.filter(h =>
                  h.service_ids.some((s: any) => String(s) === String(filter.service_ids)),
                )
              : helpers,
        })),
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
    return { service, helperModel };
  }

  it('chỉ thợ đúng service + trong 20km (hoặc chưa có tọa độ) được gợi ý', async () => {
    const helpers = [
      helper('A-gan-dung-service', [serviceId], [108.22, 16.08]), // ~1.1km → giữ
      helper('B-xa-dung-service', [serviceId], [108.22, 16.3]), // ~25.6km → loại
      helper('C-gan-sai-service', [otherServiceId], [108.22, 16.08]), // sai service → loại
      helper('D-khong-toa-do', [serviceId]), // chưa có tọa độ → giữ
    ];
    const { service, helperModel } = makeService(helpers, serviceId);
    const result = await service.findOptimalHelpersForJob(String(jobId), String(customerId));

    const names = result.map(r => r.helper.full_name);
    expect(names).toContain('Thợ A-gan-dung-service');
    expect(names).toContain('Thợ D-khong-toa-do');
    expect(names).not.toContain('Thợ B-xa-dung-service');
    expect(names).not.toContain('Thợ C-gan-sai-service');
    // Query đã lọc service ở tầng DB
    expect(helperModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ service_ids: serviceId }),
    );
  });

  it('đơn không gắn service → không lọc service, chỉ lọc khoảng cách', async () => {
    const helpers = [
      helper('A-gan', [otherServiceId], [108.22, 16.08]),
      helper('B-xa', [otherServiceId], [108.22, 16.3]),
    ];
    const { service, helperModel } = makeService(helpers, null);
    const result = await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    const names = result.map(r => r.helper.full_name);
    expect(names).toContain('Thợ A-gan');
    expect(names).not.toContain('Thợ B-xa');
    expect(helperModel.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ service_ids: expect.anything() }),
    );
  });
});
