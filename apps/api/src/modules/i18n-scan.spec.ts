import * as fs from 'fs';
import * as path from 'path';
import { formatDate, formatDateTime, formatMonthSlash } from '../../../../apps/mobile/utils/date-format';
import { formatCurrency } from '../../../../apps/mobile/services/i18n';

describe('G7: Quét toàn bộ key t() sử dụng trong mobile codebase', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const i18nPath = path.join(rootDir, 'apps/mobile/services/i18n.ts');
  const mobileDir = path.join(rootDir, 'apps/mobile');

  function getStringsKeys(): Set<string> {
    const content = fs.readFileSync(i18nPath, 'utf8');
    const stringsBlockMatch = content.match(/export const STRINGS\s*=\s*\{([\s\S]*?)\n\};/);
    if (!stringsBlockMatch) {
      throw new Error('Could not find STRINGS in apps/mobile/services/i18n.ts');
    }
    const keys = new Set<string>();
    const keyRegex = /^\s*([a-zA-Z0-9_]+)\s*:\s*\{/gm;
    let m: RegExpExecArray | null;
    while ((m = keyRegex.exec(stringsBlockMatch[1])) !== null) {
      keys.add(m[1]);
    }
    return keys;
  }

  function getMobileFiles(): string[] {
    const files: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.expo', 'dist', '.next'].includes(entry.name)) {
            walk(full);
          }
        } else if (/\.(tsx|ts)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    walk(mobileDir);
    return files;
  }

  it('tất cả các key t("...") dùng trong mobile code PHẢI có mặt trong STRINGS', () => {
    const stringsKeys = getStringsKeys();
    expect(stringsKeys.size).toBeGreaterThan(100);

    const files = getMobileFiles();
    expect(files.length).toBeGreaterThan(10);

    const missingKeys = new Map<string, string[]>();
    const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = tCallRegex.exec(content)) !== null) {
        const key = match[1];
        if (!stringsKeys.has(key)) {
          if (!missingKeys.has(key)) missingKeys.set(key, []);
          missingKeys.get(key)!.push(path.relative(rootDir, file));
        }
      }
    }

    if (missingKeys.size > 0) {
      const details = Array.from(missingKeys.entries())
        .map(([k, flist]) => `  - Key "${k}" (dùng tại: ${flist.join(', ')})`)
        .join('\n');
      throw new Error(`Phát hiện ${missingKeys.size} key t() thiếu trong STRINGS:\n${details}`);
    }

    expect(missingKeys.size).toBe(0);
  });

  it('test quét phát hiện và FAIL khi có key thiếu không nằm trong STRINGS', () => {
    const stringsKeys = getStringsKeys();
    const fakeKey = 'non_existent_fake_key_test_12345';
    expect(stringsKeys.has(fakeKey)).toBe(false);

    // Mô phỏng đoạn code có chứa fakeKey
    const mockCode = `const label = t('${fakeKey}');`;
    const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    const match = tCallRegex.exec(mockCode);
    expect(match).not.toBeNull();
    const extractedKey = match![1];
    expect(stringsKeys.has(extractedKey)).toBe(false);
  });

  describe('K1/N4: format ngày/giờ/tháng và tiền tệ theo ngôn ngữ en vs vi qua code thật', () => {
    it('format ngày, giờ, tháng và tiền tệ ở chế độ tiếng Anh cho ra kết quả chuẩn Anh và phân biệt với tiếng Việt', () => {
      // 1. Format tiền bằng formatCurrency thật
      const amount = 1_500_000;
      expect(formatCurrency(amount, 'en')).toBe('1,500,000');
      expect(formatCurrency(amount, 'vi')).toBe('1.500.000');

      // 2. Format ngày giờ bằng formatDateTime thật
      const testDate = '2026-11-08T15:30:00+07:00';
      expect(formatDateTime(testDate, 'en')).toBe('15:30 11/08/2026');
      expect(formatDateTime(testDate, 'vi')).toBe('15:30 08/11/2026');

      // 3. Format ngày bằng formatDate thật
      expect(formatDate(testDate, 'en')).toBe('11/08/2026');
      expect(formatDate(testDate, 'vi')).toBe('08/11/2026');

      // 4. Format tháng bằng formatMonthSlash thật
      expect(formatMonthSlash(testDate, 'en')).toBe('Nov 2026');
      expect(formatMonthSlash(testDate, 'vi')).toBe('11/2026');
    });
  });
});
