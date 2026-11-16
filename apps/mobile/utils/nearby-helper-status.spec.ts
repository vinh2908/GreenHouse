// utils/nearby-helper-status.spec.ts — cases for nearbyHelperStatusLabel (R11/M2).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   Run from the repo root:
//   npx tsc apps/mobile/utils/nearby-helper-status.ts apps/mobile/utils/nearby-helper-status.spec.ts --module commonjs --target es2020 --outDir /tmp/nearby-status-check --skipLibCheck && node /tmp/nearby-status-check/nearby-helper-status.spec.js
// Exit 0 = all cases pass; any failure throws.
import { nearbyHelperStatusLabel } from './nearby-helper-status';

let passed = 0;

function check(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `nearby-helper-status case failed: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  passed += 1;
}

// Mã trạng thái thô → nhãn theo ngôn ngữ.
check(nearbyHelperStatusLabel('online', 'en'), 'Available', 'online/en');
check(nearbyHelperStatusLabel('online', 'vi'), 'Đang rảnh', 'online/vi');
check(nearbyHelperStatusLabel('busy', 'en'), 'Busy', 'busy/en — M2');
check(nearbyHelperStatusLabel('busy', 'vi'), 'Đang bận', 'busy/vi');
check(nearbyHelperStatusLabel('offline', 'en'), 'Offline', 'offline/en — M2');
check(nearbyHelperStatusLabel('offline', 'vi'), 'Ngoại tuyến', 'offline/vi');

// Nhãn tiếng Việt cũ (dữ liệu đã cache) vẫn được map ở chế độ tiếng Anh.
check(nearbyHelperStatusLabel('Đang bận', 'en'), 'Busy', 'legacy Đang bận/en');
check(nearbyHelperStatusLabel('Ngoại tuyến', 'en'), 'Offline', 'legacy Ngoại tuyến/en');
check(nearbyHelperStatusLabel('Đang rảnh', 'en'), 'Available', 'legacy Đang rảnh/en');
check(nearbyHelperStatusLabel('Sẵn sàng', 'en'), 'Available', 'legacy Sẵn sàng/en');

// Passthrough: rỗng và mã lạ giữ nguyên.
check(nearbyHelperStatusLabel('', 'en'), '', 'empty stays empty');
check(nearbyHelperStatusLabel('unknown', 'en'), 'unknown', 'unknown code passes through');

console.log(`nearby-helper-status: ${passed}/12 cases passed`);
