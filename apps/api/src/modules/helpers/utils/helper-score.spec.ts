import {
  DEFAULT_HELPER_SCORE_CONFIG,
  cancellationPenaltyPoints,
  computePerformanceScore,
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

describe('computePerformanceScore — thang 100, 4 tiêu chí', () => {
  const perfect = {
    rating: 5,
    totalReviews: 12,
    completionRate: 100,
    acceptanceRate: 100,
  };

  it('hồ sơ hoàn hảo, không hủy quá ngưỡng → 100 điểm', () => {
    const r = computePerformanceScore({ ...perfect, cancellationsInWindow: 0 });
    expect(r.breakdown).toEqual({
      rating: 40,
      completion: 25,
      responsiveness: 15,
      reliability: 20,
    });
    expect(r.total).toBe(100);
    expect(r.penaltyPoints).toBe(0);
  });

  it('hủy 3 lần → vẫn 100 điểm ở tiêu chí tin cậy (chưa phạt)', () => {
    const r = computePerformanceScore({ ...perfect, cancellationsInWindow: 3 });
    expect(r.breakdown.reliability).toBe(20);
    expect(r.total).toBe(100);
  });

  it('hủy lần 4 → tin cậy mất 5đ, tổng còn 95', () => {
    const r = computePerformanceScore({ ...perfect, cancellationsInWindow: 4 });
    expect(r.penaltyPoints).toBe(5);
    expect(r.breakdown.reliability).toBe(15);
    expect(r.total).toBe(95);
  });

  it('trừ điểm có SÀN 0 ở tiêu chí tin cậy — hủy rất nhiều cũng không âm', () => {
    const r = computePerformanceScore({ ...perfect, cancellationsInWindow: 30 });
    expect(r.breakdown.reliability).toBe(0);
    expect(r.total).toBe(80); // 3 tiêu chí còn lại giữ nguyên
  });

  it('thợ mới chưa có review → tiêu chí đánh giá ở mức trung tính (đầy điểm)', () => {
    const r = computePerformanceScore({
      rating: 0,
      totalReviews: 0,
      completionRate: 100,
      acceptanceRate: 100,
      cancellationsInWindow: 0,
    });
    expect(r.breakdown.rating).toBe(DEFAULT_HELPER_SCORE_CONFIG.weights.rating);
    expect(r.total).toBe(100);
  });

  it('rating thấp kéo tiêu chí đánh giá xuống tương ứng', () => {
    const r = computePerformanceScore({ ...perfect, rating: 2.5, cancellationsInWindow: 0 });
    expect(r.breakdown.rating).toBe(20); // 2.5/5 × 40
    expect(r.total).toBe(80);
  });
});
