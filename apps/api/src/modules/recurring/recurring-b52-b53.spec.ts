import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecurringService } from './recurring.service';

/** Spec B52/B53: gói định kỳ tôn trọng end_date, ngày 31, tạm dừng, bỏ qua lượt tới. */
describe('RecurringService (B52/B53)', () => {
  const customerId = new Types.ObjectId().toHexString();

  function makeService() {
    const plans: Record<string, any>[] = [];
    const planModel: any = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findById: jest.fn((id: string) => ({
        exec: jest.fn().mockResolvedValue(plans.find(p => String(p._id) === String(id)) ?? null),
      })),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn(async (doc: any) => {
        const plan = {
          ...doc,
          _id: new Types.ObjectId(),
          save: jest.fn(async function (this: any) {
            return this;
          }),
        };
        plans.push(plan);
        return plan;
      }),
    };
    const service = new RecurringService(
      planModel,
      { exists: jest.fn(), find: jest.fn(), findOne: jest.fn() } as never,
      {} as never,
      { isVerifiedHelper: jest.fn(async () => true) } as never,
      { isFavorite: jest.fn(async () => true) } as never,
      { create: jest.fn(async () => ({})) } as never,
    );
    // Sinh đơn lần đầu không thuộc phạm vi test validation này
    (service as any).generateJobsForPlan = jest.fn(async () => 0);
    return { service, planModel, plans };
  }

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      service_id: new Types.ObjectId().toHexString(),
      title: 'Dọn nhà định kỳ',
      description: 'Dọn hàng tháng',
      photos: [],
      address: {
        full_address: '123 Lê Lợi',
        ward: 'Hải Châu',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.2, 16.05] },
      },
      frequency: 'monthly',
      weekdays: [],
      month_days: [31],
      time_start: '09:00',
      time_end: '11:00',
      duration_hours: 2,
      start_date: '2026-11-01',
      end_date: '2026-12-31',
      ...overrides,
    } as never;
  }

  describe('B52: createPlan tôn trọng end_date', () => {
    it('end_date trước start_date → 400 với lý do rõ ràng', async () => {
      const { service } = makeService();
      await expect(
        service.createPlan(customerId, dto({ start_date: '2026-12-01', end_date: '2026-11-01' })),
      ).rejects.toThrow('Ngày kết thúc');
    });

    it('end_date bằng start_date → 400', async () => {
      const { service } = makeService();
      await expect(
        service.createPlan(customerId, dto({ start_date: '2026-11-15', end_date: '2026-11-15' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('end_date hợp lệ (sau start_date) → tạo gói thành công', async () => {
      const { service, plans } = makeService();
      const plan = await service.createPlan(customerId, dto());
      expect(plan).toBeDefined();
      expect(plans.length).toBe(1);
    });

    it('tháng thiếu ngày 31 → dời sang ngày cuối tháng (tháng 2 → 28/02)', () => {
      const { service } = makeService();
      const plan: any = {
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-12-31'),
        frequency: 'monthly',
        month_days: [31],
      };
      const dates = (service as any).occurrenceDates(
        plan,
        new Date('2026-02-01'),
        new Date('2026-02-28'),
      );
      expect(dates).toEqual(['2026-02-28']);
    });

    it('không sinh đơn sau end_date', () => {
      const { service } = makeService();
      const plan: any = {
        start_date: new Date('2026-11-01'),
        end_date: new Date('2026-12-31'),
        frequency: 'monthly',
        month_days: [15],
      };
      const dates = (service as any).occurrenceDates(
        plan,
        new Date('2026-12-01'),
        new Date('2027-02-28'),
      );
      expect(dates).toEqual(['2026-12-15']);
    });
  });

  describe('B52: tạm dừng / kích hoạt lại', () => {
    it('pause → không sinh đơn; resume → sinh đơn trở lại', async () => {
      const { service, plans } = makeService();
      const plan = await service.createPlan(customerId, dto());
      const generateSpy = (service as any).generateJobsForPlan as jest.Mock;
      generateSpy.mockClear();

      const paused = await service.pausePlan(customerId, String(plan._id));
      expect(paused.status).toBe('paused');

      const resumed = await service.resumePlan(customerId, String(plan._id));
      expect(resumed.status).toBe('active');
      expect(generateSpy).toHaveBeenCalledTimes(1);
      void plans;
    });
  });
});
