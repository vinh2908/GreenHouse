import { Types } from 'mongoose';
import { MonthlyContractsService } from './monthly-contracts.service';

/** Spec B50: chốt lương đếm số buổi đã checked_in thực tế. */
describe('MonthlyContractsService.computeSummary (B50)', () => {
  function makeService(records: { date: string; status: string }[]) {
    const attendanceModel: any = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(records) }),
    };
    const service = new MonthlyContractsService(
      {} as never,
      attendanceModel,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emitToUser: jest.fn() } as never,
    );
    return service;
  }

  function contract() {
    return {
      _id: new Types.ObjectId(),
      monthly_salary: 6_000_000,
      platform_fee_percent: 15,
      start_date: new Date('2026-10-01'),
      end_date: undefined,
      schedule: { days_of_week: [1, 2, 3, 4, 5] },
    } as never;
  }

  it('20 buổi checked_in / 22 buổi theo lịch → lương = round(6.000.000 × 20/22)', async () => {
    const service = makeService([]);
    const c = contract();
    const scheduled = service.scheduledDatesOfMonth(c, '2026-10');
    expect(scheduled.length).toBeGreaterThan(20);
    const checkedIn = scheduled.slice(0, 20).map(date => ({ date, status: 'checked_in' }));
    const serviceWithRecords = makeService(checkedIn);

    const summary = await serviceWithRecords.computeSummary(c, '2026-10');

    expect(summary.scheduled_days).toBe(scheduled.length);
    expect(summary.confirmed_days).toBe(20);
    expect(summary.gross_amount).toBe(Math.round((6_000_000 * 20) / scheduled.length));
  });

  it('buổi checked_in chưa xác nhận vẫn tính; buổi không có record trong quá khứ tính vắng', async () => {
    const service = makeService([]);
    const c = contract();
    const scheduled = service.scheduledDatesOfMonth(c, '2026-10');
    const records = [
      { date: scheduled[0], status: 'checked_in' },
      { date: scheduled[1], status: 'confirmed' },
      { date: scheduled[2], status: 'leave' },
    ];
    const serviceWithRecords = makeService(records);

    const summary = await serviceWithRecords.computeSummary(c, '2026-10');

    expect(summary.confirmed_days).toBe(2);
    expect(summary.leave_days).toBe(1);
    // Các buổi còn lại trong quá khứ không có record → vắng
    expect(summary.absent_days).toBe(scheduled.length - 3);
  });
});
