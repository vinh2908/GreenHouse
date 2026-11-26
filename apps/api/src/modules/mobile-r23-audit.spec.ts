import * as fs from 'fs';
import * as path from 'path';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import {
  translateServiceName,
  formatNotificationTitle,
  formatNotificationBody,
  HAS_VIETNAMESE_TEXT_RE,
} from '../../../mobile/services/i18n';
import { buildServicePrefill } from '../../../mobile/utils/service-prefill';
import {
  acceptTrackingEvent,
  formatLastSeenAgo,
  GPS_MAX_AGE_MS,
} from '../../../mobile/services/tracking';

const MOBILE_ROOT = path.resolve(__dirname, '../../../mobile');

describe('R23 Mobile Audit — Live Tracking, EN i18n Completeness & Dark Mode Regressions', () => {
  describe('Mục 1: Live Tracking GPS tolerances (10-minute grace window)', () => {
    it('accepts delayed tracking events up to 10 minutes old and rejects > 10 minutes', () => {
      const baseMs = 1_700_000_000_000;
      expect(GPS_MAX_AGE_MS).toBe(10 * 60 * 1000);

      // 180s stale event must be accepted in R23 (was dropped at 120s in R22)
      const res3Min = acceptTrackingEvent(
        {
          job_id: 'job-1',
          helper_id: 'helper-1',
          location: { lat: 16.0544, lng: 108.2022, recorded_at: baseMs - 180_000 },
        },
        'job-1',
        'helper-1',
        null,
        baseMs,
      );
      expect(res3Min).toBe(true);

      // 11 min old event must still be discarded as expired
      const res11Min = acceptTrackingEvent(
        {
          job_id: 'job-1',
          helper_id: 'helper-1',
          location: { lat: 16.0544, lng: 108.2022, recorded_at: baseMs - 11 * 60_000 },
        },
        'job-1',
        'helper-1',
        null,
        baseMs,
      );
      expect(res11Min).toBe(false);
    });

    it('formats last seen age cleanly in both VI and EN', () => {
      expect(formatLastSeenAgo(45_000, 'vi')).toContain('45 giây');
      expect(formatLastSeenAgo(45_000, 'en')).toContain('45s ago');
      expect(formatLastSeenAgo(180_000, 'vi')).toContain('3 phút');
      expect(formatLastSeenAgo(180_000, 'en')).toContain('3 mins ago');
    });
  });

  describe('Mục 2: English i18n zero-Vietnamese guarantees & scanner', () => {
    it('never leaks raw Vietnamese in translateServiceName for EN mode', () => {
      const inputs = [
        { name: 'Vệ sinh rèm cửa cao cấp', slug: 'custom-curtain' },
        { name: 'Tháo lắp tủ gỗ', slug: 'custom-furniture' },
        { name: 'Sửa ống nước & thông bồn cầu', slug: 'plumbing' },
        'Giặt ủi & hấp vest',
      ];
      for (const item of inputs) {
        const res = translateServiceName(item, 'en');
        expect(res.length).toBeGreaterThan(0);
        expect(HAS_VIETNAMESE_TEXT_RE.test(res)).toBe(false);
      }
    });

    it('translates or falls back cleanly for EVERY backend NOTIFICATION_TYPE in EN mode', () => {
      const sampleViTitle = 'Thông báo hệ thống chưa định nghĩa';
      const sampleViBody = 'Đơn hàng của bạn có cập nhật mới từ hệ thống';

      for (const type of Object.values(NOTIFICATION_TYPES)) {
        const enTitle = formatNotificationTitle(sampleViTitle, 'en', type);
        const enBody = formatNotificationBody(sampleViBody, 'en', type);
        expect(enTitle.length).toBeGreaterThan(0);
        expect(enBody.length).toBeGreaterThan(0);
        expect(HAS_VIETNAMESE_TEXT_RE.test(enTitle)).toBe(false);
        expect(HAS_VIETNAMESE_TEXT_RE.test(enBody)).toBe(false);
      }

      // Also unknown types must never leak raw Vietnamese
      expect(HAS_VIETNAMESE_TEXT_RE.test(formatNotificationTitle(sampleViTitle, 'en'))).toBe(false);
      expect(HAS_VIETNAMESE_TEXT_RE.test(formatNotificationBody(sampleViBody, 'en'))).toBe(false);
    });

    it('returns English service prefill when lang === "en" even with Vietnamese apiDescription', () => {
      const enPrefill = buildServicePrefill({
        slug: 'housekeeping_hourly',
        name: 'Giúp việc theo giờ',
        apiDescription: 'Dọn dẹp nhà cửa sạch sẽ theo giờ',
        lang: 'en',
      });
      expect(HAS_VIETNAMESE_TEXT_RE.test(enPrefill.title)).toBe(false);
      expect(HAS_VIETNAMESE_TEXT_RE.test(enPrefill.description)).toBe(false);
    });

    it('scans mobile screens & shared pickers for unguarded hardcoded Vietnamese strings (0 hits)', () => {
      const targetFiles = [
        'app/(customer)/booking.tsx',
        'app/(customer)/services.tsx',
        'app/(customer)/home.tsx',
        'app/(customer)/profile.tsx',
        'app/(helper)/profile.tsx',
        'app/(helper)/dashboard.tsx',
        'app/edit-profile.tsx',
        'app/sos.tsx',
        'components/common/demand-map-view.tsx',
        'components/common/initial-permissions-modal.tsx',
      ];
      const offenses: string[] = [];

      for (const rel of targetFiles) {
        const full = path.join(MOBILE_ROOT, rel);
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i];
          const trimmed = raw.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')) {
            continue;
          }
          const codeOnly = raw.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');
          if (!HAS_VIETNAMESE_TEXT_RE.test(codeOnly)) continue;

          const win = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 3)).join('\n');
          if (
            ["lang === 'en'", "lang !== 'en'", 'isEn', 'label_en', 'en:', 'nameKey', 'titleKey', 'descKey', 'labelKey', 'RegExp'].some(
              tok => win.includes(tok),
            )
          ) {
            continue;
          }
          if (/(MB Bank|ACB|Đà Nẵng|TP\.?HCM|Hà Nội|Việt\s*Nam|Quận|Huyện|Phường|Xã|Thành phố|t\(|measuredBox)/.test(codeOnly) || trimmed.startsWith('đo đúng')) {
            continue;
          }
          offenses.push(`${rel}:${i + 1}: ${trimmed}`);
        }
      }

      expect(offenses).toEqual([]);
    });
  });

  describe('Mục 3: Dark mode palette & hardcoded light-mode color regressions', () => {
    it('defines distinct non-#000000 layers in THEME_COLORS.dark', () => {
      const uiSrc = fs.readFileSync(path.join(MOBILE_ROOT, 'components/ui/index.tsx'), 'utf8');
      expect(uiSrc).not.toContain("background: '#000000'");
      expect(uiSrc).toContain("background: '#0B1120'");
      expect(uiSrc).toContain("surface: '#1E293B'");
      expect(uiSrc).toContain("subtle: '#334155'");
      expect(uiSrc).toContain("border: '#475569'");
      expect(uiSrc).toContain("text: '#F8FAFC'");
    });

    it('contains zero unguarded hardcoded light-mode colors in updated screens & pickers', () => {
      const files = [
        'app/(customer)/home.tsx',
        'app/(customer)/services.tsx',
        'components/common/date-time-bottom-sheet.tsx',
        'components/common/time-dropdown-picker.tsx',
        'app/receipt/[jobId].tsx',
        'components/common/overdue-job-banner.tsx',
      ];
      const hexRe =
        /(backgroundColor|background|borderColor|borderTopColor|borderBottomColor|color)\s*:\s*['"](#(?:FFF(?:FFF)?|F3F4F6|F9FAFB|F8FAFC|F1F5F9|E2E8F0|EAEFEF|E2ECE8|F6F8F7|0F172A|111827))['"]/i;
      const offenses: string[] = [];

      for (const rel of files) {
        const lines = fs.readFileSync(path.join(MOBILE_ROOT, rel), 'utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
          const m = line.match(hexRe);
          if (!m) continue;
          if (m[1] === 'color' && (m[2].toUpperCase() === '#FFF' || m[2].toUpperCase() === '#FFFFFF')) {
            continue;
          }
          if (line.includes('isDark') || line.includes('tc.')) continue;
          offenses.push(`${rel}:${i + 1}: ${trimmed}`);
        }
      }

      expect(offenses).toEqual([]);
    });

    it('supports dark mode in tracking map document while preserving Goong attribution', () => {
      const docSrc = fs.readFileSync(
        path.join(MOBILE_ROOT, 'components/common/tracking-map-document.ts'),
        'utf8',
      );
      expect(docSrc).toContain('isDark');
      expect(docSrc).toContain('goong-attribution');
    });
  });
});
