import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MonthlyContractsService } from './monthly-contracts.service';

/** Spec B49: tạo hợp đồng tháng kiểm tra ngày bắt đầu, trùng lịch, giới hạn lương. */
describe('MonthlyContractsService.createContract (B49)', () => {
  const customerId = new Types.ObjectId().toHexString();
  const helperId = new Types.ObjectId().toHexString();

  function dateStr(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function makeService(
    runningContracts: { start_date: Date; end_date?: Date; status: string }[] = [],
  ) {
    const helperModel: any = {
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: helperId }) }),
    };
    const created: any[] = [];
    const contractModel: any = {
      find: jest.fn((filter: Record<string, unknown>) => ({
        select: jest.fn().mockReturnValue({
          // Mô phỏng query thật: chỉ trả hợp đồng có status trong $in
          exec: jest
            .fn()
            .mockResolvedValue(
              runningContracts.filter(c =>
                (
                  (filter?.['status'] as Record<string, unknown>)?.['$in'] as string[] | undefined
                )?.includes(c.status),
              ),
            ),
        }),
      })),
      create: jest.fn(async (doc: any) => {
        const c = {
          ...doc,
          _id: new Types.ObjectId(),
          populate: jest.fn(async function (this: any) {
            return this;
          }),
        };
        created.push(c);
        return c;
      }),
    };
    const service = new MonthlyContractsService(
      contractModel,
      {} as never,
      {} as never,
      {} as never,
      helperModel,
      {} as never,
      { create: jest.fn(async () => ({})) } as never,
      {} as never,
      { emitToUser: jest.fn() } as never,
    );
    return { service, created };
  }

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      helper_id: helperId,
      service_id: new Types.ObjectId().toHexString(),
      title: 'Giúp việc theo tháng',
      monthly_salary: 6_000_000,
      address: { full_address: '123 Lê Lợi', location: { coordinates: [108.2, 16.05] } },
      schedule: { days_of_week: [1, 2, 3, 4, 5], time_start: '08:00', time_end: '17:00' },
      start_date: dateStr(1),
      end_date: dateStr(30),
      ...overrides,
    } as never;
  }

  it('tạo hợp đồng bắt đầu hôm qua → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createContract(customerId, dto({ start_date: dateStr(-1) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo hợp đồng lương 50.000.000₫ → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createContract(customerId, dto({ monthly_salary: 50_000_000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo hợp đồng trùng lịch với hợp đồng đang chạy của cùng thợ → 409', async () => {
    const { service } = makeService([
      { start_date: new Date(dateStr(0)), end_date: new Date(dateStr(60)), status: 'active' },
    ]);
    await expect(service.createContract(customerId, dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('hợp đồng cũ đã kết thúc (ended) không chặn hợp đồng mới trùng ngày', async () => {
    const { service, created } = makeService([
      { start_date: new Date(dateStr(0)), end_date: new Date(dateStr(60)), status: 'ended' },
    ]);
    const c = await service.createContract(customerId, dto());
    expect(c).toBeDefined();
    expect(created.length).toBe(1);
  });

  it('tạo hợp đồng hợp lệ (bắt đầu ngày mai, lương 6.000.000₫) → thành công', async () => {
    const { service, created } = makeService();
    const c = await service.createContract(customerId, dto());
    expect(c).toBeDefined();
    expect(created.length).toBe(1);
  });
});
