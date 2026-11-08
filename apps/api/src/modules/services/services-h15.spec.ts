import { BadRequestException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Types } from 'mongoose';

describe('H15: ServicesService min/max validation', () => {
  let service: ServicesService;
  let serviceModel: any;
  let categoryModel: any;

  beforeEach(() => {
    serviceModel = {
      findOne: jest.fn(() => ({ exec: async () => null })),
      findById: jest.fn((id: string) => ({
        exec: async () => ({
          _id: new Types.ObjectId(id),
          name: 'Dọn nhà',
          base_price_min: 100_000,
          base_price_max: 200_000,
          price_range_min: 100_000,
          price_range_max: 200_000,
          estimated_duration_min: 2,
          estimated_duration_max: 4,
        }),
      })),
      create: jest.fn(async (doc: any) => doc),
      findByIdAndUpdate: jest.fn((id: string, update: any) => ({
        exec: async () => ({ _id: id, ...update.$set }),
      })),
    };
    categoryModel = {
      findById: jest.fn(() => ({ exec: async () => ({ _id: new Types.ObjectId() }) })),
    };
    service = new ServicesService(serviceModel, categoryModel);
  });

  it('create: blocks when min > max and max = 0', async () => {
    await expect(
      service.create({
        category_id: String(new Types.ObjectId()),
        name: 'Test',
        slug: 'test',
        description: 'Test',
        base_price_min: 100_000,
        base_price_max: 0,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('update: blocks when updating only 1 field (min) that exceeds existing max in DB', async () => {
    // Existing doc has max = 200_000. Updating min to 300_000 should be rejected.
    await expect(
      service.update(String(new Types.ObjectId()), {
        base_price_min: 300_000,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('update: blocks when setting max = 0 while existing min is 100_000', async () => {
    await expect(
      service.update(String(new Types.ObjectId()), {
        base_price_max: 0,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('update: succeeds when min <= max', async () => {
    const res = await service.update(String(new Types.ObjectId()), {
      base_price_min: 150_000,
      base_price_max: 250_000,
    } as any);
    expect(res.base_price_min).toBe(150_000);
    expect(res.base_price_max).toBe(250_000);
  });
});
