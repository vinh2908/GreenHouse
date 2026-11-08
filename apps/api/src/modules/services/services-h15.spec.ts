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

  it('K13(f): create: thành công khi chỉ truyền min mà không truyền max', async () => {
    const res = await service.create({
      category_id: String(new Types.ObjectId()),
      name: 'Test Only Min',
      slug: 'test-only-min',
      description: 'Test',
      base_price_min: 120_000,
    } as any);
    expect(res.base_price_min).toBe(120_000);
    expect(res.base_price_max).toBe(120_000);
  });
});

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

describe('K7: DTO cross-field min/max validation for CreateServiceDto and UpdateServiceDto', () => {
  it('gửi min/max sai qua DTO (min > max) → bị chặn bởi class-validator', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      category_id: '507f1f77bcf86cd799439011',
      name: 'Sửa điện',
      slug: 'sua-dien',
      description: 'Mô tả',
      base_price_min: 200_000,
      base_price_max: 100_000,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const errorProperties = errors.map(e => e.property);
    expect(
      errorProperties.includes('base_price_min') || errorProperties.includes('base_price_max'),
    ).toBe(true);
  });

  it('gửi max = 0 với min > 0 qua DTO → bị chặn', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      category_id: '507f1f77bcf86cd799439011',
      name: 'Sửa điện',
      slug: 'sua-dien',
      description: 'Mô tả',
      base_price_min: 150_000,
      base_price_max: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const errorProperties = errors.map(e => e.property);
    expect(
      errorProperties.includes('base_price_min') || errorProperties.includes('base_price_max'),
    ).toBe(true);
  });

  it('gửi duration_min > duration_max qua DTO → bị chặn', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      category_id: '507f1f77bcf86cd799439011',
      name: 'Sửa điện',
      slug: 'sua-dien',
      description: 'Mô tả',
      estimated_duration_min: 5,
      estimated_duration_max: 2,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const errorProperties = errors.map(e => e.property);
    expect(
      errorProperties.includes('estimated_duration_min') ||
        errorProperties.includes('estimated_duration_max'),
    ).toBe(true);
  });

  it('gửi min <= max đúng qua DTO → qua (0 validation errors cho min/max)', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      category_id: '507f1f77bcf86cd799439011',
      name: 'Sửa điện',
      slug: 'sua-dien',
      description: 'Mô tả',
      base_price_min: 100_000,
      base_price_max: 200_000,
      estimated_duration_min: 1,
      estimated_duration_max: 4,
    });
    const errors = await validate(dto);
    const minMaxErrors = errors.filter(e =>
      ['base_price_min', 'base_price_max', 'estimated_duration_min', 'estimated_duration_max'].includes(
        e.property,
      ),
    );
    expect(minMaxErrors.length).toBe(0);
  });

  it('UpdateServiceDto: gửi min > max trong update → bị chặn', async () => {
    const dto = plainToInstance(UpdateServiceDto, {
      base_price_min: 300_000,
      base_price_max: 150_000,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('UpdateServiceDto: gửi chỉ 1 trường hợp lệ → qua', async () => {
    const dto = plainToInstance(UpdateServiceDto, {
      base_price_min: 150_000,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
