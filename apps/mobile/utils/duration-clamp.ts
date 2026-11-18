/**
 * R12-29: clamp helper for DurationDropdownPicker.
 *
 * The picker used to clamp a below-minimum duration silently (10 min
 * became 15 min with no message — B7-2c live). The clamp itself stays
 * (the 15-min minimum is enforced by the server too), but the caller
 * must now be told a clamp happened so it can show the
 * "Thời lượng tối thiểu là 15 phút" hint instead of changing the value
 * behind the user's back.
 */

export interface ClampedDuration {
  minutes: number;
  /** True when the value was raised up to the minimum. */
  clampedUp: boolean;
  /** True when the value was lowered down to the maximum. */
  clampedDown: boolean;
}

export function clampPickerDuration(
  valueMinutes: number,
  minMinutes: number,
  maxMinutes: number,
): ClampedDuration {
  const value = Math.round(valueMinutes);
  if (!Number.isFinite(value)) return { minutes: minMinutes, clampedUp: true, clampedDown: false };
  if (value < minMinutes) return { minutes: minMinutes, clampedUp: true, clampedDown: false };
  if (value > maxMinutes) return { minutes: maxMinutes, clampedUp: false, clampedDown: true };
  return { minutes: value, clampedUp: false, clampedDown: false };
}
