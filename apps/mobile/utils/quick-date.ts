/**
 * R12-27: pure resolvers for the home quick-form date chips.
 *
 * The live bug: the quick-form preview showed the WRONG date for a
 * next-day job (an 18/11 job previewed as 17/11) while the detail page
 * was correct. The formatter was verified innocent — formatDateWithWeekday
 * returns the right date for a bare 'YYYY-MM-DD' key under every device
 * timezone (Node check, TZ=UTC / +07 / US / +14) — so the stale value
 * came from the STATE: quickDate is initialised once with vnDateKey(1)
 * when the (long-lived) home tab mounts, and the "tomorrow" chip kept
 * pointing at the day the app was opened even after midnight rolled over.
 * Chip-relative dates must therefore be re-resolved whenever the home
 * screen regains focus; an absolute calendar pick (chip null) is never
 * touched.
 *
 * Pure TS, zero imports (same pattern as utils/job-schedule-edit.ts): all
 * math is Asia/Ho_Chi_Minh (+07:00) via the UTC-getters trick, mirroring
 * vnDateKeyFor. Chip semantics match handleSelectQuickDateChip in
 * app/(customer)/home.tsx exactly:
 * - 'today' → VN today; 'tomorrow' → VN today + 1.
 * - 'sat' → the coming Saturday (today when today is Saturday; the
 *   Saturday of next week when today is Sunday — dayjs day(6) on a Sunday
 *   is yesterday, so the chip moves a week forward).
 * - 'sun' → the coming Sunday (today when today is Sunday).
 */

export type QuickDateChip = 'today' | 'tomorrow' | 'sat' | 'sun';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' (VN) of `nowMs` plus `offsetDays` days. */
export function vnDateKeyAt(nowMs: number, offsetDays = 0): string {
  // Shift the instant +07:00, then read it back with UTC getters so the
  // result never depends on the device timezone.
  const shifted = new Date(nowMs + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

export function resolveDateChip(chip: QuickDateChip, nowMs = Date.now()): string {
  const shifted = new Date(nowMs + 7 * 60 * 60 * 1000);
  const dow = shifted.getUTCDay(); // 0 = Sunday … 6 = Saturday (VN wall clock)
  switch (chip) {
    case 'today':
      return vnDateKeyAt(nowMs, 0);
    case 'tomorrow':
      return vnDateKeyAt(nowMs, 1);
    case 'sat': {
      // Days until the coming Saturday: Sat=6. On Sunday the Saturday of
      // this week is yesterday, so (6-0)%7 would be 6 → next Saturday.
      const daysUntil = (6 - dow + 7) % 7;
      return vnDateKeyAt(nowMs, daysUntil);
    }
    case 'sun': {
      // Days until the coming Sunday: Sun=0; today when today is Sunday.
      const daysUntil = (7 - dow) % 7;
      return vnDateKeyAt(nowMs, daysUntil);
    }
  }
}
