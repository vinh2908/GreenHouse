/**
 * B7 (live 2026-11-14 09:31): pure schedule-edit helpers for the customer job
 * edit modal ("Cập nhật thông tin & vị trí").
 *
 * The dead-end: the accept path refuses a quote when the job's start time has
 * passed ("Thời gian bắt đầu công việc đã qua..."), but the edit modal had NO
 * date/time field, so a job whose start passed while quotes were pending could
 * never be accepted — and the server's updateJob ALSO rejects ANY save on such
 * a job (it validates the merged start time even when the caller only edits
 * the address). The modal must therefore let the customer move the schedule
 * to the future before any save can succeed.
 *
 * Pure TS, zero imports (no RN, no dayjs, no alias) so the API jest harness
 * can import it via `@/utils/job-schedule-edit` and prove the round-trip:
 * util builds the patch -> PATCH /jobs/:id persists it -> selectQuote's A1
 * gate stops throwing. All wall-clock math is Asia/Ho_Chi_Minh (+07:00),
 * mirroring the server (jobs.service.ts selectQuote A1 / updateJob F4).
 */

export const SCHEDULE_EDIT_MIN_DURATION_MINUTES = 15;
export const SCHEDULE_EDIT_MAX_DURATION_MINUTES = 12 * 60; // 12h
export const SCHEDULE_EDIT_WORK_START_MINUTES = 7 * 60; // 07:00
export const SCHEDULE_EDIT_WORK_END_MINUTES = 22 * 60; // 22:00, latest start
export const SCHEDULE_EDIT_DEFAULT_TIME_START = '09:00';
export const SCHEDULE_EDIT_DEFAULT_DURATION_MINUTES = 60;

export interface JobScheduleLike {
  preferred_date?: string | Date | null;
  preferred_time_start?: string | null;
  preferred_time_end?: string | null;
  estimated_duration?: number | null; // hours
}

export interface EditSchedule {
  /** 'YYYY-MM-DD' (VN date). */
  date: string;
  /** 'HH:mm'. */
  timeStart: string;
  /** Minutes, clamped to [15, 720]. */
  durationMinutes: number;
}

export type ScheduleValidationError =
  | 'invalid_date'
  | 'invalid_time'
  | 'outside_hours'
  | 'past'
  | 'too_short'
  | 'too_long'
  | 'crosses_midnight';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^(\d{1,2}):(\d{2})$/;

/** 'YYYY-MM-DD' in VN (+07:00) for an instant — same trick the server uses. */
export function vnDateKeyFor(nowMs: number): string {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** VN date key `offsetDays` ahead of `nowMs` (offsetDays = 1 → tomorrow). */
export function vnDateKeyOffset(nowMs: number, offsetDays: number): string {
  return vnDateKeyFor(nowMs + offsetDays * 24 * 60 * 60 * 1000);
}

/**
 * Normalise a job's preferred_date to a 'YYYY-MM-DD' key. A Date built from
 * a 'YYYY-MM-DD' string is UTC midnight (= 07:00 VN the same day), so the
 * UTC slice is the VN date — same convention as jobScheduledAt in
 * app/job-detail/[id].tsx. Returns '' when there is no usable date.
 */
export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (DATE_KEY_RE.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  return '';
}

export function parseHHMM(
  value: string | null | undefined,
): { hours: number; minutes: number; totalMinutes: number } | null {
  if (!value) return null;
  const m = HH_MM_RE.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * End time = start + duration. Same arithmetic as calcEndTime in
 * components/common/time-dropdown-picker.tsx (kept local: that module pulls
 * in React Native and cannot be imported by the API jest harness).
 */
export function calcScheduleEnd(
  timeStart: string,
  durationMinutes: number,
): { timeEnd: string; crossesMidnight: boolean } | null {
  const parsed = parseHHMM(timeStart);
  if (!parsed || !durationMinutes || durationMinutes <= 0) return null;
  const total = parsed.totalMinutes + durationMinutes;
  const crossesMidnight = total >= 24 * 60;
  return { timeEnd: formatHHMM(total % (24 * 60)), crossesMidnight };
}

/**
 * Effective duration in minutes for a job: the start→end span when both
 * parse and end is after start, else estimated_duration (hours), else the
 * 60-minute default. Clamped to [15, 720] — the server's updateJob window.
 */
export function durationMinutesOf(job: JobScheduleLike): number {
  const start = parseHHMM(job.preferred_time_start);
  const end = parseHHMM(job.preferred_time_end);
  if (start && end && end.totalMinutes > start.totalMinutes) {
    return clampDuration(end.totalMinutes - start.totalMinutes);
  }
  if (typeof job.estimated_duration === 'number' && job.estimated_duration > 0) {
    return clampDuration(Math.round(job.estimated_duration * 60));
  }
  return SCHEDULE_EDIT_DEFAULT_DURATION_MINUTES;
}

export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return SCHEDULE_EDIT_DEFAULT_DURATION_MINUTES;
  return Math.max(
    SCHEDULE_EDIT_MIN_DURATION_MINUTES,
    Math.min(SCHEDULE_EDIT_MAX_DURATION_MINUTES, Math.round(minutes)),
  );
}

/**
 * Prefill for the edit modal: the job's current schedule when present
 * (even when it is already in the past — the pickers flag it and the user
 * must move it forward), otherwise tomorrow 09:00 / 60 min.
 */
export function deriveEditSchedule(job: JobScheduleLike, nowMs = Date.now()): EditSchedule {
  const date = dateKeyOf(job.preferred_date);
  const start = parseHHMM(job.preferred_time_start);
  return {
    date: date || vnDateKeyOffset(nowMs, 1),
    timeStart: start ? formatHHMM(start.totalMinutes) : SCHEDULE_EDIT_DEFAULT_TIME_START,
    durationMinutes: durationMinutesOf(job),
  };
}

/** Absolute instant (ms) of a VN wall-clock date + 'HH:mm', or null. */
export function startInstantMs(date: string, timeStart: string): number | null {
  if (!DATE_KEY_RE.test(date)) return null;
  const parsed = parseHHMM(timeStart);
  if (!parsed) return null;
  const instant = new Date(
    `${date}T${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}:00+07:00`,
  ).getTime();
  return Number.isNaN(instant) ? null : instant;
}

/**
 * Mirror of the server's updateJob F4 rule: the merged start must be
 * strictly in the future. (selectQuote's A1 gate is looser — now minus a
 * 2-minute buffer — so a start passing this check also passes accept.)
 */
export function isFutureStart(date: string, timeStart: string, nowMs = Date.now()): boolean {
  const instant = startInstantMs(date, timeStart);
  return instant !== null && instant > nowMs;
}

export function isScheduleChanged(a: EditSchedule, b: EditSchedule): boolean {
  return (
    a.date !== b.date || a.timeStart !== b.timeStart || a.durationMinutes !== b.durationMinutes
  );
}

/**
 * Client-side validation for the edit modal, in the same order the server
 * enforces it (updateJob F4: working hours, past start, 15m–12h span).
 * Returns the first failing rule, or null when the schedule is saveable.
 * The caller maps the code to a localised toast; the server re-validates
 * and its message is shown if the client check is ever bypassed.
 */
export function validateEditSchedule(
  edited: EditSchedule,
  nowMs = Date.now(),
): ScheduleValidationError | null {
  if (!DATE_KEY_RE.test(edited.date)) return 'invalid_date';
  const parsed = parseHHMM(edited.timeStart);
  if (!parsed) return 'invalid_time';
  if (
    parsed.totalMinutes < SCHEDULE_EDIT_WORK_START_MINUTES ||
    parsed.totalMinutes > SCHEDULE_EDIT_WORK_END_MINUTES
  ) {
    return 'outside_hours';
  }
  if (!isFutureStart(edited.date, edited.timeStart, nowMs)) return 'past';
  if (edited.durationMinutes < SCHEDULE_EDIT_MIN_DURATION_MINUTES) return 'too_short';
  if (edited.durationMinutes > SCHEDULE_EDIT_MAX_DURATION_MINUTES) return 'too_long';
  const end = calcScheduleEnd(edited.timeStart, edited.durationMinutes);
  if (!end) return 'invalid_time';
  if (end.crossesMidnight) return 'crosses_midnight';
  return null;
}

/**
 * PATCH /jobs/:id schedule fields for an edited schedule. Returns null when
 * nothing changed (caller must not send schedule fields then — sending the
 * derived defaults would silently invent a schedule on a job that had none).
 * Assumes validateEditSchedule(edited) === null.
 */
export function buildSchedulePatch(
  edited: EditSchedule,
): { preferred_date: string; preferred_time_start: string; preferred_time_end: string } | null {
  const end = calcScheduleEnd(edited.timeStart, edited.durationMinutes);
  if (!end || end.crossesMidnight) return null;
  return {
    preferred_date: edited.date,
    preferred_time_start: edited.timeStart,
    preferred_time_end: end.timeEnd,
  };
}

/** Schedule patch for an edit, or null when the schedule is unchanged. */
export function buildSchedulePatchIfChanged(
  original: EditSchedule,
  edited: EditSchedule,
): { preferred_date: string; preferred_time_start: string; preferred_time_end: string } | null {
  if (!isScheduleChanged(original, edited)) return null;
  return buildSchedulePatch(edited);
}
