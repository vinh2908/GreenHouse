import {
  DEFAULT_HELPER_SCORE_CONFIG,
  HELPER_SCORE_WEIGHTS,
  cancellationPenaltyPoints,
  computeHelperScore,
  countCancellationsInWindow,
  excessCancellations,
  scoreWarningLevel,
} from './helper-score';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

describe('quy tắc phạt hủy đơn (ngưỡng 3 lần / 7 ngày, −5đ mỗi lần vượt)', () => {
  it('hủy đúng 3 lần trong 7 ngày → KHÔNG bị phạt', () => {
    const stamps = [hoursAgo(1), hoursAgo(30), daysAgo(6)];
    const count = countCancellationsInWindow(stamps, NOW, 7);
    expect(count).toBe(3);
    expect(excessCancellations(count)).toBe(0);
    expect(cancellationPenaltyPoints(count)).toBe(0);
    expect(scoreWarningLevel(count)).toBe('approaching'); // lần hủy tiếp theo sẽ bị phạt
  });

  it('lần hủy thứ 4 trong 7 ngày → bắt đầu trừ 5 điểm', () => {
    const stamps = [hoursAgo(1), hoursAgo(5), hoursAgo(30), daysAgo(6)];
    const count = countCancellationsInWindow(stamps, NOW, 7);
    expect(count).toBe(4);
    expect(excessCancellations(count)).toBe(1);
    expect(cancellationPenaltyPoints(count)).toBe(5);
    expect(scoreWarningLevel(count)).toBe('penalized');
  });

  it('mỗi lần vượt thêm trừ tiếp 5 điểm (5 lần → 10đ, 6 lần → 15đ)', () => {
    expect(cancellationPenaltyPoints(5)).toBe(10);
    expect(cancellationPenaltyPoints(6)).toBe(15);
  });

  it('lần hủy đã quá 7 ngày thì rơi khỏi cửa sổ trượt — không tính nữa', () => {
    const stamps = [daysAgo(8), daysAgo(9), hoursAgo(2), hoursAgo(3)];
    const count = countCancellationsInWindow(stamps, NOW, 7);
    expect(count).toBe(2);
    expect(cancellationPenaltyPoints(count)).toBe(0);
  });

  it('mốc hủy đúng biên 7 ngày vẫn được tính (cửa sổ bao hàm)', () => {
    expect(countCancellationsInWindow([daysAgo(7)], NOW, 7)).toBe(1);
    expect(countCancellationsInWindow([daysAgo(7.01)], NOW, 7)).toBe(0);
  });

  it('chưa gần ngưỡng thì không cảnh báo', () => {
    expect(scoreWarningLevel(0)).toBe('none');
    expect(scoreWarningLevel(1)).toBe('none');
    expect(scoreWarningLevel(2)).toBe('approaching');
  });
});

describe('computeHelperScore — MỘT công thức duy nhất (G8/B87: Distance 40 / Skill 30 / Rating 20 / KYC 10 − phạt hủy)', () => {
  const perfect = {
    distanceKm: 0,
    hasService: true,
    rating: 5,
    isVerified: true,
    cancellationsInWindow: 0,
  };

  it('trọng số do chủ chốt: 40/30/20/10', () => {
    expect(HELPER_SCORE_WEIGHTS).toEqual({ distance: 40, skill: 30, rating: 20, kyc: 10 });
  });

  it('hồ sơ hoàn hảo, không hủy quá ngưỡng → 100 điểm', () => {
    const r = computeHelperScore(perfect);
    expect(r.breakdown).toEqual({ distance: 40, skill: 30, rating: 20, kyc: 10 });
    expect(r.total).toBe(100);
    expect(r.penaltyPoints).toBe(0);
  });

  it('thợ A 85 điểm: cách 6km (28đ) + đúng chuyên môn (30đ) + rating 4.25 (17đ) + e-KYC (10đ)', () => {
    const r = computeHelperScore({
      distanceKm: 6,
      hasService: true,
      rating: 4.25,
      isVerified: true,
      cancellationsInWindow: 0,
    });
    expect(r.breakdown).toEqual({ distance: 28, skill: 30, rating: 17, kyc: 10 });
    expect(r.total).toBe(85);
  });

  it('thiếu tọa độ → 0đ khoảng cách; không đúng chuyên môn → 12đ kỹ năng', () => {
    const r = computeHelperScore({
      distanceKm: -1,
      hasService: false,
      rating: 0,
      isVerified: false,
      cancellationsInWindow: 0,
    });
    expect(r.breakdown).toEqual({ distance: 0, skill: 12, rating: 0, kyc: 0 });
    expect(r.total).toBe(12);
  });

  it('hủy 3 lần → vẫn đủ điểm (chưa phạt)', () => {
    const r = computeHelperScore({ ...perfect, cancellationsInWindow: 3 });
    expect(r.penaltyPoints).toBe(0);
    expect(r.total).toBe(100);
  });

  it('hủy lần 4 → tổng mất 5đ, còn 95', () => {
    const r = computeHelperScore({ ...perfect, cancellationsInWindow: 4 });
    expect(r.penaltyPoints).toBe(5);
    expect(r.total).toBe(95);
  });

  it('trừ phạt vào TỔNG, sàn 0 — hủy rất nhiều cũng không âm (30 lần → phạt 135đ → tổng 0)', () => {
    const r = computeHelperScore({ ...perfect, cancellationsInWindow: 30 });
    expect(r.penaltyPoints).toBe(135);
    expect(r.total).toBe(0);
  });

  it('thợ mới chưa có rating → tiêu chí đánh giá 0đ (giống gợi ý, không còn trung tính đầy điểm)', () => {
    const r = computeHelperScore({
      distanceKm: -1,
      hasService: true,
      rating: 0,
      isVerified: true,
      cancellationsInWindow: 0,
    });
    expect(r.breakdown.rating).toBe(0);
    expect(r.total).toBe(40); // 0 + 30 + 0 + 10
  });

  it('rating thấp kéo tiêu chí đánh giá xuống tương ứng', () => {
    const r = computeHelperScore({ ...perfect, rating: 2.5 });
    expect(r.breakdown.rating).toBe(10); // 2.5/5 × 20
    expect(r.total).toBe(90);
  });

  it('cấu hình phạt vẫn đọc từ env (ngưỡng/phạt/cửa sổ)', () => {
    expect(DEFAULT_HELPER_SCORE_CONFIG).toEqual({ windowDays: 7, threshold: 3, pointsPerExcess: 5 });
  });
});
