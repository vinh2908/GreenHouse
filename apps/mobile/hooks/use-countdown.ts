// hooks/use-countdown.ts — Tiện ích đếm ngược dùng chung (SOS Backup popup…)
import { useEffect, useState } from 'react';

/** Trả về Date.now() được cập nhật mỗi giây (dừng tick khi component unmount) */
export function useNowTick(active = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

/** Định dạng mili-giây còn lại thành "mm:ss" (âm → "00:00") */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
