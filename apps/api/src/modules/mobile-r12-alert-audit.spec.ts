// modules/mobile-r12-alert-audit.spec.ts — R12-16: every Alert.alert call
// in the mobile app must go through the web-safe in-app Alert
// (components/common/app-alert.tsx, a Modal host mounted in _layout.tsx).
// React Native's Alert.alert never appears on web, so any screen that
// gates a mutation behind it (top-up confirm, withdraw confirm, SOS
// dispatch) is dead on web: the confirm never shows and the POST never
// runs. This spec scans the source and fails if ANY call site imports
// Alert from 'react-native'.
import * as fs from 'fs';
import * as path from 'path';

describe('R12-16: Alert.alert audit — no react-native Alert anywhere', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const mobileDir = path.join(rootDir, 'apps/mobile');

  function collectFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectFiles(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  function filesWithAlert(): { file: string; content: string; sites: number }[] {
    const found: { file: string; content: string; sites: number }[] = [];
    for (const dir of [path.join(mobileDir, 'app'), path.join(mobileDir, 'components')]) {
      for (const file of collectFiles(dir)) {
        const content = fs.readFileSync(file, 'utf8');
        const sites = (content.match(/Alert\.alert\s*\(/g) || []).length;
        if (sites > 0) found.push({ file, content, sites });
      }
    }
    return found;
  }

  it('every Alert.alert call site imports Alert from the in-app app-alert', () => {
    const files = filesWithAlert();
    expect(files.length).toBeGreaterThan(0);
    const totalSites = files.reduce((sum, f) => sum + f.sites, 0);
    // 33 sites at R12 time (29 counted in the task brief + components);
    // the invariant is per-file, the count just guards silent drift.
    expect(totalSites).toBeGreaterThanOrEqual(29);
    for (const { file, content } of files) {
      const rel = path.relative(mobileDir, file);
      expect(content).toMatch(/from\s*'@\/components\/common\/app-alert'/);
      expect(content).not.toMatch(/import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/s);
      // Belt and braces: no RN Alert import line at all in these files.
      expect(content).not.toMatch(/^\s*Alert,\s*$/m);
      void rel;
    }
  });

  it('the previously broken files (top-up / withdraw / SOS) are web-safe', () => {
    const mustBeSafe = ['app/bank-account.tsx', 'app/(helper)/earnings.tsx', 'app/sos.tsx'];
    for (const rel of mustBeSafe) {
      const content = fs.readFileSync(path.join(mobileDir, rel), 'utf8');
      expect(content).toContain(`from '@/components/common/app-alert'`);
      expect(content).not.toMatch(/import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/s);
    }
  });

  it('the in-app Alert host is mounted in the root layout', () => {
    const layout = fs.readFileSync(path.join(mobileDir, 'app/_layout.tsx'), 'utf8');
    expect(layout).toContain('AppAlertHost');
    expect(layout).toContain('<AppAlertHost />');
  });
});
