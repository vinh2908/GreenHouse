import { hungarianMinimize } from './hungarian';

/** Cộng chi phí các cặp theo đúng ma trận gốc để đối chiếu */
function totalOf(matrix: number[][], pairs: { row: number; col: number }[]): number {
  return pairs.reduce((sum, p) => sum + matrix[p.row][p.col], 0);
}

/** Brute-force: thử mọi phép ghép hợp lệ, trả về tổng chi phí nhỏ nhất (chỉ dùng cho test nhỏ) */
function bruteForceMin(matrix: number[][]): number {
  const rows = matrix.length;
  const cols = matrix[0].length;
  let best = Infinity;

  const dfs = (r: number, usedCols: Set<number>, acc: number, matched: number) => {
    if (acc >= best) return;
    if (r === rows) {
      // Chỉ xét phân công ghép được tối đa có thể (mọi hàng nếu rows<=cols; mọi cột nếu ngược lại)
      if (matched === Math.min(rows, cols)) best = acc;
      return;
    }
    // Bỏ qua hàng này (chỉ hợp lệ khi rows > cols — thừa hàng hơn cột)
    if (rows > cols) dfs(r + 1, usedCols, acc, matched);
    for (let c = 0; c < cols; c++) {
      if (usedCols.has(c) || !Number.isFinite(matrix[r][c])) continue;
      usedCols.add(c);
      dfs(r + 1, usedCols, acc + matrix[r][c], matched + 1);
      usedCols.delete(c);
    }
    // Hàng toàn Infinity → không ghép được hàng này (phân công đầy đủ không tồn tại)
    if (rows <= cols && matrix[r].every(v => !Number.isFinite(v))) {
      dfs(r + 1, usedCols, acc, matched);
    }
  };
  dfs(0, new Set(), 0, 0);
  return best;
}

/** PRNG xác định (mulberry32) để test lặp lại được */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('hungarianMinimize (SOS Backup solver)', () => {
  it('ma trận rỗng → không có cặp nào', () => {
    expect(hungarianMinimize([])).toEqual({ pairs: [], totalCost: 0 });
    expect(hungarianMinimize([[]])).toEqual({ pairs: [], totalCost: 0 });
  });

  it('bài toán kinh điển 3x3 cho tổng tối ưu = 5', () => {
    const matrix = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(totalCost).toBe(5);
    expect(totalOf(matrix, pairs)).toBe(5);
    expect(pairs).toHaveLength(3);
    // Mỗi hàng và mỗi cột dùng đúng 1 lần
    expect(new Set(pairs.map(p => p.row)).size).toBe(3);
    expect(new Set(pairs.map(p => p.col)).size).toBe(3);
  });

  it('tham lam theo hàng bị sai — Hungarian tìm được nghiệm toàn cục tốt hơn', () => {
    // Greedy: đơn 0 → thợ 0 (1), đơn 1 → thợ 1 (100) = 101.
    // Tối ưu: đơn 0 → thợ 1 (2), đơn 1 → thợ 0 (2) = 4.
    const matrix = [
      [1, 2],
      [2, 100],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(totalCost).toBe(4);
    expect(pairs).toEqual([
      { row: 0, col: 1, cost: 2 },
      { row: 1, col: 0, cost: 2 },
    ]);
  });

  it('ma trận chữ nhật 2 đơn x 3 thợ', () => {
    const matrix = [
      [1, 4, 5],
      [5, 3, 2],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(totalCost).toBe(3); // (0→0)=1, (1→2)=2
    expect(pairs).toHaveLength(2);
  });

  it('nhiều đơn hơn thợ (3x2): chỉ ghép được 2 cặp tối ưu', () => {
    const matrix = [
      [1, 5],
      [4, 2],
      [3, 3],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(totalCost).toBe(3); // (0→0)=1, (1→1)=2, hàng 2 không ghép
    expect(pairs).toHaveLength(2);
  });

  it('ô Infinity (khác chuyên môn) không bao giờ được chọn', () => {
    const matrix = [
      [5, Infinity],
      [1, 100],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    // Bắt buộc: (0→0)=5 và (1→1)=100 vì các ô còn lại bị cấm
    expect(totalCost).toBe(105);
    expect(pairs.every(p => Number.isFinite(matrix[p.row][p.col]))).toBe(true);
  });

  it('hàng toàn Infinity (đơn không có thợ phù hợp) → hàng đó không được ghép', () => {
    const matrix = [
      [Infinity, Infinity],
      [1, 2],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ row: 1, col: 0, cost: 1 });
    expect(totalCost).toBe(1);
  });

  it('kịch bản SOS: 2 đơn đồng thời — phân công toàn cục tối ưu', () => {
    // Thợ A gần đơn 1 nhưng cũng là người duy nhất đủ gần đơn 2.
    // cost[đơn][thợ]: đơn 1 gần A(2) xa B(9); đơn 2 chỉ B làm tốt(3), A trung bình(4), C tệ.
    const matrix = [
      [2, 9, 40],
      [4, 3, 35],
    ];
    const { pairs, totalCost } = hungarianMinimize(matrix);
    expect(totalCost).toBe(5); // đơn1→A (2), đơn2→B (3)
    expect(totalOf(matrix, pairs)).toBe(totalCost);
  });

  it('khớp brute-force trên nhiều ma trận ngẫu nhiên nhỏ (kể cả có ô cấm)', () => {
    const rand = mulberry32(20261022);
    for (let trial = 0; trial < 300; trial++) {
      const rows = 1 + Math.floor(rand() * 4); // 1..4
      const cols = 1 + Math.floor(rand() * 5); // 1..5
      const matrix: number[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (rand() < 0.18 ? Infinity : Math.floor(rand() * 50))),
      );
      const { pairs, totalCost } = hungarianMinimize(matrix);
      // Không cặp nào dùng ô cấm, không trùng hàng/cột
      expect(pairs.every(p => Number.isFinite(matrix[p.row][p.col]))).toBe(true);
      expect(new Set(pairs.map(p => p.row)).size).toBe(pairs.length);
      expect(new Set(pairs.map(p => p.col)).size).toBe(pairs.length);
      expect(totalOf(matrix, pairs)).toBeCloseTo(totalCost, 8);

      const brute = bruteForceMin(matrix);
      if (Number.isFinite(brute)) {
        // Khi tồn tại phân công đầy đủ hữu hạn, Hungarian phải đạt đúng optimum
        // và ghép đủ min(rows, cols) cặp.
        expect(pairs.length).toBe(Math.min(rows, cols));
        expect(totalCost).toBeCloseTo(brute, 8);
      }
    }
  });

  it('ném lỗi khi chi phí âm hoặc NaN', () => {
    expect(() => hungarianMinimize([[-1]])).toThrow(RangeError);
    expect(() => hungarianMinimize([[Number.NaN]])).toThrow(RangeError);
  });
});
