import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { HelpersService } from './helpers.service';
import { HelperProfile, HelperProfileSchema } from './schemas/helper-profile.schema';

/**
 * Spec B1 (live 2026-11-12): lịch làm việc của thợ KHÔNG persist.
 * Thợ bấm "Lưu lịch làm việc" thấy toast "Đã lưu" rồi màn hình revert về
 * mặc định (OFF, đủ 7 ngày) sau reload — và trang profile vẫn hiện
 * "Linh hoạt (Đang tắt lịch)".
 *
 * Kịch bản live: bật lịch, chỉ chọn thứ 6 (day 5), 07:00–19:00.
 * Round-trip bắt buộc: PATCH xong GET lại phải trả đúng giá trị đã lưu.
 */
describe('HelpersService - B1 availability persists across save + reload', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let helperModel: any;
  let service: HelpersService;
  const userId = new Types.ObjectId().toHexString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongod.getUri()).asPromise();
    helperModel = connection.model(HelperProfile.name, HelperProfileSchema);
    const gateway: any = { broadcastHelperStatus: jest.fn() };
    const matchingService: any = { notifyNewSuitableHelper: jest.fn() };
    service = new HelpersService(helperModel, gateway, matchingService);
  }, 120000);

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await helperModel.deleteMany({});
  });

  it('GET mặc định khi chưa lưu gì: OFF, đủ 7 ngày, 07:00–19:00', async () => {
    const result = await service.getAvailability(userId);
    expect(result).toEqual({
      enabled: false,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      start_time: '07:00',
      end_time: '19:00',
      blocked_dates: [],
    });
  });

  it('PATCH (ON, chỉ thứ 6, 07:00–19:00) rồi GET lại phải trả đúng giá trị đã lưu', async () => {
    await service.updateAvailability(userId, {
      enabled: true,
      days_of_week: [5],
      start_time: '07:00',
      end_time: '19:00',
      blocked_dates: [],
    } as never);

    // Mô phỏng reload: đọc lại từ DB qua GET như app làm sau invalidate/refetch.
    const reloaded = await service.getAvailability(userId);
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.days_of_week).toEqual([5]);
    expect(reloaded.start_time).toBe('07:00');
    expect(reloaded.end_time).toBe('19:00');
    expect(reloaded.blocked_dates).toEqual([]);
  });

  it('giá trị đã lưu phải có thật trong MongoDB (không chỉ nằm ở object trả về của PATCH)', async () => {
    await service.updateAvailability(userId, {
      enabled: true,
      days_of_week: [5],
      start_time: '07:00',
      end_time: '19:00',
      blocked_dates: ['2026-11-20'],
    } as never);

    const raw = await helperModel
      .findOne({ user_id: new Types.ObjectId(userId) })
      .lean()
      .exec();
    expect(raw).toBeDefined();
    expect(raw.availability.enabled).toBe(true);
    expect(raw.availability.days_of_week).toEqual([5]);
    expect(raw.availability.start_time).toBe('07:00');
    expect(raw.availability.end_time).toBe('19:00');
    expect(raw.availability.blocked_dates).toEqual(['2026-11-20']);
  });

  it('PATCH với start_time >= end_time vẫn bị từ chối 400', async () => {
    await expect(
      service.updateAvailability(userId, {
        enabled: true,
        days_of_week: [5],
        start_time: '19:00',
        end_time: '07:00',
        blocked_dates: [],
      } as never),
    ).rejects.toThrow('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
  });
});
