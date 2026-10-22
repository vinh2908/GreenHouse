/**
 * Thuật toán Hungarian (Kuhn–Munkres) — bản cài đặt riêng cho SOS Backup.
 *
 * Giải bài toán phân công tối thiểu hoá tổng chi phí (Assignment Problem)
 * bằng phương pháp thế vị (potentials), độ phức tạp O(n^3).
 * Khác với bản ở modules/matching (chuyên tối đa hoá điểm trên ma trận vuông),
 * bản này:
 *  - Hỗ trợ ma trận chữ nhật bất kỳ (số thợ ≠ số đơn SOS).
 *  - Hỗ trợ chi phí Infinity = cặp bị CẤM (vd: thợ không đúng chuyên môn).
 *    Cặp bị cấm không bao giờ xuất hiện trong kết quả — hàng nào bắt buộc phải
 *    ghép vào ô cấm (vì không còn lựa chọn hữu hạn) sẽ bị coi là chưa ghép.
 *  - Chi phí phải >= 0 và hữu hạn hoặc Infinity (không nhận NaN / số âm).
 *
 * Dùng cho SOS Backup: hàng = các đơn SOS đang chờ, cột = thợ ứng viên,
 * ô = chi phí ghép (khoảng cách + rating + kinh nghiệm + tải việc).
 */

export interface HungarianPair {
  /** Chỉ số hàng (đơn SOS) trong ma trận gốc */
  row: number;
  /** Chỉ số cột (thợ ứng viên) trong ma trận gốc */
  col: number;
  /** Chi phí gốc của cặp ghép (luôn hữu hạn) */
  cost: number;
}

export interface HungarianResult {
  pairs: HungarianPair[];
  /** Tổng chi phí của các cặp đã ghép (chỉ tính cặp hữu hạn) */
  totalCost: number;
}

/**
 * Tìm phân công có tổng chi phí nhỏ nhất.
 * Số cặp trả về = min(số hàng, số cột), trừ các hàng/cột chỉ có ô bị cấm.
 */
export function hungarianMinimize(costMatrix: number[][]): HungarianResult {
  if (!costMatrix || costMatrix.length === 0 || !costMatrix[0] || costMatrix[0].length === 0) {
    return { pairs: [], totalCost: 0 };
  }

  const rows = costMatrix.length;
  const cols = costMatrix[0].length;

  for (let i = 0; i < rows; i++) {
    if (!costMatrix[i] || costMatrix[i].length !== cols) {
      throw new RangeError('Ma trận chi phí phải là hình chữ nhật (mọi hàng cùng số cột)');
    }
    for (let j = 0; j < cols; j++) {
      const value = costMatrix[i][j];
      if (Number.isNaN(value) || value < 0) {
        throw new RangeError('Chi phí phải >= 0, hữu hạn hoặc Infinity');
      }
    }
  }

  // Thuật toán thế vị yêu cầu số hàng <= số cột: chuyển vị nếu cần rồi ánh xạ ngược.
  const transposed = rows > cols;
  const n = transposed ? cols : rows; // số hàng của ma trận làm việc
  const m = transposed ? rows : cols; // số cột của ma trận làm việc
  const at = (i: number, j: number): number => (transposed ? costMatrix[j][i] : costMatrix[i][j]);

  // Ô cấm (Infinity) được thay bằng BIG: lớn hơn tổng mọi chi phí hữu hạn,
  // nên bất kỳ phân công toàn-hữu-hạn nào cũng rẻ hơn phân công chứa ô cấm.
  let finiteSum = 0;
  let maxFinite = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const value = at(i, j);
      if (Number.isFinite(value)) {
        finiteSum += value;
        if (value > maxFinite) maxFinite = value;
      }
    }
  }
  const BIG = finiteSum + maxFinite + 1;

  // Ma trận 1-indexed cho thuật toán
  const a: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const value = at(i - 1, j - 1);
      a[i][j] = Number.isFinite(value) ? value : BIG;
    }
  }

  // u, v: thế vị hàng/cột; p[j] = hàng đang ghép với cột j (0 = chưa ghép)
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0][j] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const pairs: HungarianPair[] = [];
  let totalCost = 0;
  for (let j = 1; j <= m; j++) {
    if (p[j] === 0) continue;
    const i = p[j];
    const original = at(i - 1, j - 1);
    if (!Number.isFinite(original)) continue; // bị ép vào ô cấm → coi như chưa ghép
    pairs.push({
      row: transposed ? j - 1 : i - 1,
      col: transposed ? i - 1 : j - 1,
      cost: original,
    });
    totalCost += original;
  }
  pairs.sort((x, y) => x.row - y.row);

  return { pairs, totalCost };
}
