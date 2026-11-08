import * as fs from 'fs';
import * as path from 'path';

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
});
