import { Types } from 'mongoose';
import {
  computeHelperScore,
  countCancellationsInWindow,
  helperScoreInputFromProfile,
} from './helper-score';
import { MatchingService } from '../../matching/matching.service';

/**
 * G8/B87 — chứng minh gợi ý thợ (matching) và xếp hạng admin gọi CÙNG 1 hàm
 * computeHelperScore với CÙNG 1 input thì ra CÙNG 1 số.
 *
 * Lưu ý trung thực về giới hạn: đường admin không có đơn tham chiếu nên
 * distanceKm luôn = −1 (0đ khoảng cách, cùng quy tắc như matching khi thiếu
 * tọa độ). Hai đường cho cùng 1 số tuyệt đối khi đầu vào trùng nhau — vd
 * khi cả 2 bên đều thiếu tọa độ (test 1) hoặc khi đối chiếu qua cùng 1 input
 * (test 2, 3). Thợ ở gần đơn sẽ cao điểm hơn ở gợi ý đúng bằng phần khoảng
 * cách — đó là bản chất của tiêu chí Distance, không phải 2 công thức.
 */
describe('G8/B87 — 1 công thức điểm thợ cho cả gợi ý và xếp hạng admin', () => {
  const dummy = {} as never;
  const matching = new MatchingService(dummy, dummy, dummy, dummy, dummy);

  const serviceId = new Types.ObjectId();
  const helperNoCoords = {
    service_ids: [serviceId],
    rating: 4.25,
    verification_status: 'approved',
    location: undefined,
    cancellation_timestamps: [] as Date[],
  };
  const jobNoCoords = { service_id: serviceId, address: undefined };
  const profileNoCoords = {
    service_ids: [serviceId],
    rating: 4.25,
    verification_status: 'approved',
  };

  it('thợ A không có tọa độ: gợi ý = xếp hạng admin = 57 (0 + 30 + 17 + 10)', () => {
    const utility = matching.computeUtilityScore(helperNoCoords, jobNoCoords);
    expect(utility.distance_km).toBe(-1);

    const adminInput = helperScoreInputFromProfile(profileNoCoords, 0);
    const adminResult = computeHelperScore(adminInput);

    expect(adminInput).toEqual({
      distanceKm: -1,
      hasService: true,
      rating: 4.25,
      isVerified: true,
      cancellationsInWindow: 0,
    });
    expect(utility.score).toBe(57);
    expect(adminResult.total).toBe(57);
    expect(utility.score).toBe(adminResult.total);
  });

  it('thợ A 85 điểm ở gợi ý (cách 6km): cùng input qua hàm chung cũng 85', () => {
    const helper = {
      ...helperNoCoords,
      location: { type: 'Point', coordinates: [106.0, 10.0] },
    };
    const job = {
      service_id: serviceId,
      address: { location: { coordinates: [106.0, 10.054] } },
    };
    const utility = matching.computeUtilityScore(helper, job);
    expect(utility.distance_km).toBe(6);
    expect(utility.score).toBe(85);

    // Cùng 1 input qua hàm chung → cùng 85 (đường admin không có đơn nên
    // không đo được khoảng cách; khi có cùng input thì số trùng nhau).
    const direct = computeHelperScore({
      distanceKm: 6,
      hasService: true,
      rating: 4.25,
      isVerified: true,
      cancellationsInWindow: 0,
    });
    expect(direct.total).toBe(85);
    expect(utility.score).toBe(direct.total);
  });

  it('thợ bị phạt hủy đơn (4 lần/7 ngày): cả 2 đường cùng trừ 5đ → 52', () => {
    const now = new Date();
    const stamps = [1, 2, 3, 4].map(h => new Date(now.getTime() - h * 60 * 60 * 1000));
    const helper = { ...helperNoCoords, cancellation_timestamps: stamps };

    const utility = matching.computeUtilityScore(helper, jobNoCoords);
    expect(utility.score).toBe(52);

    const count = countCancellationsInWindow(stamps, now, 7);
    expect(count).toBe(4);
    const adminResult = computeHelperScore(
      helperScoreInputFromProfile(profileNoCoords, count),
    );
    expect(adminResult.penaltyPoints).toBe(5);
    expect(adminResult.total).toBe(52);
    expect(utility.score).toBe(adminResult.total);
  });
});
