import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { CreateRecurringPlanDto } from './dto/recurring.dto';
import { JobAddressDto, JobAddressLocationDto } from '../jobs/dto/job.dto';

/**
 * Spec F2: trần duration_hours của gói định kỳ phải là 12 giờ (khớp trần
 * createJob/G12), không phải 24 — plan 13–24h tạo được qua API rồi 400
 * mọi kỳ khi sinh đơn. Chỉ kiểm tra DTO (ValidationPipe global chặn 400
 * ngay lúc tạo qua API); service createPlan không tự kiểm tra trần này.
 */
describe('CreateRecurringPlanDto duration_hours (F2)', () => {
  function validDto(duration_hours?: number) {
    const location = new JobAddressLocationDto();
    location.type = 'Point';
    location.coordinates = [108.2, 16.05];
    const address = new JobAddressDto();
    address.full_address = '123 Lê Lợi';
    address.location = location;
    const dto = new CreateRecurringPlanDto();
    dto.service_id = new Types.ObjectId().toHexString();
    dto.title = 'Dọn nhà định kỳ';
    dto.description = 'Dọn hàng tuần';
    dto.address = address;
    dto.frequency = 'weekly';
    dto.weekdays = [1];
    dto.time_start = '09:00';
    dto.start_date = '2026-11-10';
    if (duration_hours !== undefined) dto.duration_hours = duration_hours;
    return dto;
  }

  it('duration_hours 13 → lỗi max; 24 → lỗi max (trần cũ không còn)', async () => {
    for (const bad of [13, 24]) {
      const errors = await validate(validDto(bad));
      expect(errors.some(e => e.property === 'duration_hours' && e.constraints?.max)).toBe(true);
    }
  });

  it('duration_hours 12 → hợp lệ; 0.5 → hợp lệ; không nhập → hợp lệ', async () => {
    for (const ok of [12, 0.5, undefined]) {
      expect(await validate(validDto(ok))).toHaveLength(0);
    }
  });

  it('duration_hours 12.5 → lỗi max; 0.2 → lỗi min', async () => {
    const over = await validate(validDto(12.5));
    expect(over.some(e => e.property === 'duration_hours' && e.constraints?.max)).toBe(true);
    const under = await validate(validDto(0.2));
    expect(under.some(e => e.property === 'duration_hours' && e.constraints?.min)).toBe(true);
  });
});
