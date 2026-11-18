// modules/mobile-r12-duration-clamp.spec.ts — R12-29: a duration under
// 15 min was SILENTLY clamped to 15 min (B7-2c live: 10 min became 15
// with no message). The clamp stays (server enforces 15 min too), but
// the picker must now announce it. Old code clamped with a bare
// Math.max and returned no signal; these cases fail on that behaviour
// (no clamped flag existed) and pass after.
import { clampPickerDuration } from '@/utils/duration-clamp';

describe('R12-29: clampPickerDuration', () => {
  it('the live case: 10 min with a 15-min minimum clamps UP and says so', () => {
    expect(clampPickerDuration(10, 15, 720)).toEqual({
      minutes: 15,
      clampedUp: true,
      clampedDown: false,
    });
  });

  it('in-range values pass through untouched (no hint)', () => {
    expect(clampPickerDuration(60, 15, 720)).toEqual({
      minutes: 60,
      clampedUp: false,
      clampedDown: false,
    });
    expect(clampPickerDuration(15, 15, 720)).toEqual({
      minutes: 15,
      clampedUp: false,
      clampedDown: false,
    });
  });

  it('over-maximum clamps DOWN and says so', () => {
    expect(clampPickerDuration(800, 15, 720)).toEqual({
      minutes: 720,
      clampedUp: false,
      clampedDown: true,
    });
  });

  it('the default 30-min minimum still applies where the caller wants it', () => {
    expect(clampPickerDuration(20, 30, 720)).toEqual({
      minutes: 30,
      clampedUp: true,
      clampedDown: false,
    });
  });
});
