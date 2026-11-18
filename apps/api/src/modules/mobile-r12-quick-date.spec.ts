// modules/mobile-r12-quick-date.spec.ts — R12-27: the home quick-form
// preview showed 17/11 for an 18/11 job. The formatter was verified
// innocent (a bare key formats correctly under every device timezone),
// so the defect was stale chip-relative state: quickDate is computed once
// at mount and "tomorrow" kept pointing at the day the app was opened.
// These specs pin (a) the chip resolver the focus effect uses to
// re-resolve the active chip, and (b) the key formatter the preview now
// uses, which renders a bare 'YYYY-MM-DD' key by direct parsing so no
// timezone conversion can ever shift it a day earlier.
import { resolveDateChip, vnDateKeyAt } from '@/utils/quick-date';
import { formatDateKeyWithWeekday } from '@/utils/date-format';

// 2026-11-17T10:00:00+07:00 — a Tuesday morning in Vietnam.
const TUE_17_NOV_10H = Date.parse('2026-11-17T10:00:00+07:00');
// 2026-11-22T10:00:00+07:00 — a Sunday morning.
const SUN_22_NOV_10H = Date.parse('2026-11-22T10:00:00+07:00');
// 2026-11-21T10:00:00+07:00 — a Saturday morning.
const SAT_21_NOV_10H = Date.parse('2026-11-21T10:00:00+07:00');

describe('R12-27: resolveDateChip', () => {
  it('tomorrow from Tue 17/11 is 18/11 (the reported case)', () => {
    expect(resolveDateChip('tomorrow', TUE_17_NOV_10H)).toBe('2026-11-18');
    expect(resolveDateChip('today', TUE_17_NOV_10H)).toBe('2026-11-17');
  });

  it('sat/sun chips from Tue 17/11', () => {
    expect(resolveDateChip('sat', TUE_17_NOV_10H)).toBe('2026-11-21');
    expect(resolveDateChip('sun', TUE_17_NOV_10H)).toBe('2026-11-22');
  });

  it('on Sunday, sat moves to NEXT Saturday (dayjs day(6) is yesterday)', () => {
    expect(resolveDateChip('sat', SUN_22_NOV_10H)).toBe('2026-11-28');
    expect(resolveDateChip('sun', SUN_22_NOV_10H)).toBe('2026-11-22');
    expect(resolveDateChip('tomorrow', SUN_22_NOV_10H)).toBe('2026-11-23');
  });

  it('on Saturday, sat is today and sun is tomorrow', () => {
    expect(resolveDateChip('sat', SAT_21_NOV_10H)).toBe('2026-11-21');
    expect(resolveDateChip('sun', SAT_21_NOV_10H)).toBe('2026-11-22');
  });

  it('vnDateKeyAt never depends on the device timezone', () => {
    // Same instant, rendered in VN regardless of the host TZ (jest runs
    // in UTC here): 2026-11-17T17:00Z == 2026-11-18T00:00+07.
    expect(vnDateKeyAt(Date.parse('2026-11-17T17:00:00Z'))).toBe('2026-11-18');
    expect(vnDateKeyAt(Date.parse('2026-11-17T16:59:59Z'))).toBe('2026-11-17');
  });
});

describe('R12-27: formatDateKeyWithWeekday', () => {
  it('the reported preview: 18/11 renders as 18/11, never 17/11', () => {
    expect(formatDateKeyWithWeekday('2026-11-18', 'vi')).toBe('Thứ tư, 18/11/2026');
    expect(formatDateKeyWithWeekday('2026-11-18', 'en')).toBe('Wednesday, 11/18/2026');
    expect(formatDateKeyWithWeekday('2026-11-17', 'vi')).toBe('Thứ ba, 17/11/2026');
  });

  it('matches the old formatter for keys (same output, no TZ involved)', () => {
    expect(formatDateKeyWithWeekday('2026-11-21', 'vi')).toBe('Thứ bảy, 21/11/2026');
    expect(formatDateKeyWithWeekday('2026-11-22', 'vi')).toBe('Chủ nhật, 22/11/2026');
  });
});
