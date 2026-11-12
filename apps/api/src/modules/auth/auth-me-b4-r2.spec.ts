import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Spec B4-R2: GET /auth/me phải trả về user đầy đủ, có _id.
 *
 * NGUYÊN NHÂN GỐC live 2026-11-12 (đơn B 6af59e07bb2b94f98da7e088): thẻ tiến
 * độ ("Cập nhật tiến độ làm việc" + "Bắt đầu di chuyển đến khách") KHÔNG hiện
 * cho thợ được giao Nguyễn Văn Vinh dù bundle web đã có code B4 (R1) và job
 * payload đúng (helper_id khớp, status confirmed).
 *
 * Chuỗi lỗi thật:
 *   1. GET /auth/me trả thẳng object JwtStrategy.validate() —
 *      { sub, phone, roles, active_role } — KHÔNG có `_id`.
 *   2. loadStoredAuth (apps/mobile/stores/auth.store.ts) gọi /auth/me mỗi lần
 *      mở lại app và GHI ĐÈ user đã lưu bằng object đó.
 *   3. Từ đó currentUser._id === undefined → isMyActiveJob(job, undefined,
 *      quotes) luôn false (guard !currentUserId) → thẻ tiến độ, thẻ thông
 *      tin khách và thẻ hợp đồng đều ẩn. Cả hai đường vào cổng B4 đều chết
 *      vì cùng cần currentUser._id: match job.helper_id và báo giá accepted
 *      của chính thợ — nên poll 15s + refetchOnMount của R1 không thể cứu.
 *   4. Triệu chứng khớp live: sau login mới thì hiện (login trả user có _id),
 *      sau reload thì mất ("lúc hiện lúc ẩn" ở R1; helper check 19:43/19:46
 *      sau nhiều lần tải lại đều không thấy thẻ).
 *
 * Các lead khác đã kiểm tra và LOẠI TRỪ (xem REVIEW R2):
 *   - withTeamDisplay / enrichJobWithDistance không chạm helper_id.
 *   - getJobQuotes helper đã lọc PENDING+ACCEPTED theo đúng caller (R1).
 *   - isNetworkError = !err.response nên 401/403 KHÔNG bị coi là lỗi mạng,
 *     không phục vụ snapshot cũ vô thời hạn.
 *
 * Revert check: controller cũ `return user` (object validate) nên test (a)
 * fail vì result._id === undefined; service cũ không có getMe nên test (b)
 * fail vì getMe is not a function.
 */
describe('B4-R2: GET /auth/me returns the full user (with _id)', () => {
  const helperId = '507f1f77bcf86cd799439013';
  const fullUser: any = {
    _id: helperId,
    phone: '0365290805',
    full_name: 'Nguyễn Văn Vinh',
    roles: ['customer', 'helper'],
    active_role: 'helper',
    status: 'active',
    is_verified: true,
  };
  // Đúng shape JwtStrategy.validate() trả về trước đây — KHÔNG có _id.
  const jwtValidateShape = {
    sub: helperId,
    phone: '0365290805',
    roles: ['customer', 'helper'],
    active_role: 'helper',
  };

  it('(a) controller trả về user có _id bằng id của chính thợ, không phải shape JWT', async () => {
    const authServiceStub: any = {
      getMe: jest.fn().mockResolvedValue(fullUser),
    };
    const controller = new AuthController(authServiceStub);

    const result: any = await controller.me(jwtValidateShape as any);

    expect(authServiceStub.getMe).toHaveBeenCalledWith(helperId);
    expect(result._id).toBe(helperId);
    expect(String(result._id)).toBe(String(jwtValidateShape.sub));
    expect(result.phone).toBe('0365290805');
    expect(result.full_name).toBe('Nguyễn Văn Vinh');
    expect(result.roles).toContain('helper');
  });

  it('(b) service lấy user đầy đủ từ DB theo sub (kể cả khi shape JWT không có _id)', async () => {
    const usersServiceStub = {
      findById: jest.fn().mockResolvedValue(fullUser),
    };
    const dummy = {} as never;
    const service: any = new AuthService(usersServiceStub as never, dummy, dummy, dummy, dummy);

    const result: any = await service.getMe(jwtValidateShape.sub);

    expect(usersServiceStub.findById).toHaveBeenCalledWith(helperId);
    expect(result._id).toBe(helperId);
    expect(result.phone).toBe('0365290805');
  });

  it('(c) cổng isMyActiveJob mở lại được với user mà /auth/me mới trả về', async () => {
    // Mô phỏng đúng cổng màn helper-job-detail: match job.helper_id với
    // currentUser._id. Với user cũ (shape JWT) cổng này luôn false.
    const { isMyActiveJob } = await import('../../../../../apps/mobile/utils/job-assignment');
    const job: any = {
      helper_id: { _id: helperId, full_name: 'Nguyễn Văn Vinh' },
      status: 'confirmed',
    };

    expect(isMyActiveJob(job, (fullUser as any)._id, [])).toBe(true);
    expect(isMyActiveJob(job, (jwtValidateShape as any)._id, [])).toBe(false);
  });
});
