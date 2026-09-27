/**
 * Thuật toán Hungarian (Kuhn-Munkres Algorithm)
 * Dùng để giải bài toán gán việc tối ưu (Assignment Problem) trong O(N^3)
 * Phù hợp ghép N Thợ (Workers) <-> M Công việc (Jobs)
 */

export interface AssignmentResult {
  workerIndex: number;
  jobIndex: number;
  cost: number;
  score: number;
}

export class HungarianAlgorithm {
  /**
   * Giải bài toán tối đa hóa điểm lợi ích (Maximization Problem)
   * Ma trận scoreMatrix[i][j]: Điểm phù hợp của Thợ i với Công việc j (càng cao càng tốt, vd: 0 - 100)
   */
  public static maximize(scoreMatrix: number[][]): AssignmentResult[] {
    if (!scoreMatrix || scoreMatrix.length === 0 || scoreMatrix[0].length === 0) {
      return [];
    }

    const numRows = scoreMatrix.length;
    const numCols = scoreMatrix[0].length;
    const size = Math.max(numRows, numCols);

    // Tìm điểm lớn nhất trong ma trận để chuyển bài toán Max -> Min
    let maxScore = -Infinity;
    for (let i = 0; i < numRows; i++) {
      for (let j = 0; j < numCols; j++) {
        if (scoreMatrix[i][j] > maxScore) {
          maxScore = scoreMatrix[i][j];
        }
      }
    }
    if (maxScore === -Infinity) maxScore = 0;

    // Tạo ma trận vuông chi phí: cost = maxScore - score (với padding nếu N != M)
    const costMatrix: number[][] = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => {
        if (i < numRows && j < numCols) {
          return maxScore - scoreMatrix[i][j];
        }
        return 0; // Dummy worker / Dummy job
      }),
    );

    // Chạy thuật toán tìm Min Cost
    const assignments = this.minimize(costMatrix);

    // Lọc bỏ dummy assignments và trả về kết quả
    const results: AssignmentResult[] = [];
    for (const assign of assignments) {
      if (assign.workerIndex < numRows && assign.jobIndex < numCols) {
        results.push({
          workerIndex: assign.workerIndex,
          jobIndex: assign.jobIndex,
          cost: assign.cost,
          score: scoreMatrix[assign.workerIndex][assign.jobIndex],
        });
      }
    }

    return results;
  }

  /**
   * Giải bài toán tối thiểu hóa chi phí (Minimization Problem)
   */
  public static minimize(
    costMatrix: number[][],
  ): { workerIndex: number; jobIndex: number; cost: number }[] {
    const n = costMatrix.length;
    if (n === 0) return [];

    // Clone ma trận để không sửa đổi mảng gốc
    const matrix: number[][] = costMatrix.map(row => [...row]);

    // 1. Trừ giá trị nhỏ nhất của mỗi hàng
    for (let i = 0; i < n; i++) {
      let minVal = matrix[i][0];
      for (let j = 1; j < n; j++) {
        if (matrix[i][j] < minVal) minVal = matrix[i][j];
      }
      for (let j = 0; j < n; j++) {
        matrix[i][j] -= minVal;
      }
    }

    // 2. Trừ giá trị nhỏ nhất của mỗi cột
    for (let j = 0; j < n; j++) {
      let minVal = matrix[0][j];
      for (let i = 1; i < n; i++) {
        if (matrix[i][j] < minVal) minVal = matrix[i][j];
      }
      for (let i = 0; i < n; i++) {
        matrix[i][j] -= minVal;
      }
    }

    // 3. Khởi tạo mảng gán ghép
    const rowCovered = new Array(n).fill(false);
    const colCovered = new Array(n).fill(false);
    const starredZeroes = Array.from({ length: n }, () => new Array(n).fill(false));
    const primedZeroes = Array.from({ length: n }, () => new Array(n).fill(false));

    // Star các số 0 độc lập ban đầu
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (matrix[i][j] === 0 && !rowCovered[i] && !colCovered[j]) {
          starredZeroes[i][j] = true;
          rowCovered[i] = true;
          colCovered[j] = true;
        }
      }
    }
    rowCovered.fill(false);
    colCovered.fill(false);

    // Vòng lặp chính của thuật toán Kuhn-Munkres
    while (true) {
      // Đếm số cột có Star Zero
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (starredZeroes[i][j]) colCovered[j] = true;
        }
      }

      let coveredColsCount = 0;
      for (let j = 0; j < n; j++) {
        if (colCovered[j]) coveredColsCount++;
      }

      // Nếu số đường phủ = N -> Đã tìm ra kết quả tối ưu hoàn hảo
      if (coveredColsCount >= n) {
        break;
      }

      let done = false;
      while (!done) {
        // Tìm số 0 chưa được phủ
        const zeroCoord = this.findUncoveredZero(matrix, rowCovered, colCovered, n);
        if (zeroCoord === null) {
          // Bước điều chỉnh: tìm giá trị nhỏ nhất chưa được phủ
          const minUncovered = this.findMinUncoveredVal(matrix, rowCovered, colCovered, n);
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              if (rowCovered[i]) matrix[i][j] += minUncovered;
              if (!colCovered[j]) matrix[i][j] -= minUncovered;
            }
          }
        } else {
          const [r, c] = zeroCoord;
          primedZeroes[r][c] = true;

          // Tìm xem hàng r có starred zero không
          let starColInRow = -1;
          for (let j = 0; j < n; j++) {
            if (starredZeroes[r][j]) {
              starColInRow = j;
              break;
            }
          }

          if (starColInRow !== -1) {
            rowCovered[r] = true;
            colCovered[starColInRow] = false;
          } else {
            // Bước Augmenting Path
            this.adjustPath(starredZeroes, primedZeroes, r, c, n);
            rowCovered.fill(false);
            colCovered.fill(false);
            for (let i = 0; i < n; i++) primedZeroes[i].fill(false);
            done = true;
          }
        }
      }
    }

    // Trả về danh sách ghép cặp
    const results: { workerIndex: number; jobIndex: number; cost: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (starredZeroes[i][j]) {
          results.push({
            workerIndex: i,
            jobIndex: j,
            cost: costMatrix[i][j],
          });
        }
      }
    }

    return results;
  }

  private static findUncoveredZero(
    matrix: number[][],
    rowCovered: boolean[],
    colCovered: boolean[],
    n: number,
  ): [number, number] | null {
    for (let i = 0; i < n; i++) {
      if (!rowCovered[i]) {
        for (let j = 0; j < n; j++) {
          if (!colCovered[j] && matrix[i][j] === 0) {
            return [i, j];
          }
        }
      }
    }
    return null;
  }

  private static findMinUncoveredVal(
    matrix: number[][],
    rowCovered: boolean[],
    colCovered: boolean[],
    n: number,
  ): number {
    let minVal = Infinity;
    for (let i = 0; i < n; i++) {
      if (!rowCovered[i]) {
        for (let j = 0; j < n; j++) {
          if (!colCovered[j] && matrix[i][j] < minVal) {
            minVal = matrix[i][j];
          }
        }
      }
    }
    return minVal === Infinity ? 0 : minVal;
  }

  private static adjustPath(
    starredZeroes: boolean[][],
    primedZeroes: boolean[][],
    startRow: number,
    startCol: number,
    n: number,
  ) {
    const path: [number, number][] = [[startRow, startCol]];

    while (true) {
      const last = path[path.length - 1];
      // Tìm starred zero ở cùng cột
      let starRow = -1;
      for (let i = 0; i < n; i++) {
        if (starredZeroes[i][last[1]]) {
          starRow = i;
          break;
        }
      }
      if (starRow === -1) break;
      path.push([starRow, last[1]]);

      // Tìm primed zero ở cùng hàng
      let primeCol = -1;
      for (let j = 0; j < n; j++) {
        if (primedZeroes[starRow][j]) {
          primeCol = j;
          break;
        }
      }
      path.push([starRow, primeCol]);
    }

    // Đảo ngược star <-> unstar trên đường đi
    for (const [r, c] of path) {
      if (starredZeroes[r][c]) {
        starredZeroes[r][c] = false;
      } else {
        starredZeroes[r][c] = true;
      }
    }
  }
}
