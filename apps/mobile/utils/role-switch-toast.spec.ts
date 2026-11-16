// utils/role-switch-toast.spec.ts — cases for roleSwitchFailureToast (R11/M3).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   Run from the repo root (--esModuleInterop is required: services/i18n.ts
//   default-imports dayjs; NODE_PATH is required: the emitted i18n.js
//   resolves dayjs from the repo's node_modules):
//   npx tsc apps/mobile/utils/role-switch-toast.ts apps/mobile/utils/role-switch-toast.spec.ts --module commonjs --target es2020 --outDir /tmp/role-switch-check --skipLibCheck --esModuleInterop && NODE_PATH=<repo>/node_modules node /tmp/role-switch-check/utils/role-switch-toast.spec.js
// Exit 0 = all cases pass; any failure throws.
import { roleSwitchFailureToast } from './role-switch-toast';

let passed = 0;

function check(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `role-switch-toast case failed: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  passed += 1;
}

// Tiêu đề theo ngôn ngữ.
check(roleSwitchFailureToast('en', undefined).text1, 'Failed to switch role', 'title/en');
check(roleSwitchFailureToast('vi', undefined).text1, 'Đổi vai trò thất bại', 'title/vi');

// Không có message server: fallback theo ngôn ngữ.
check(roleSwitchFailureToast('en', undefined).text2, 'Please try again later', 'no server msg/en');
check(roleSwitchFailureToast('vi', undefined).text2, 'Vui lòng thử lại sau', 'no server msg/vi');
check(roleSwitchFailureToast('en', '').text2, 'Please try again later', 'empty server msg/en');
check(roleSwitchFailureToast('en', null).text2, 'Please try again later', 'null server msg/en');

// Message server đã map: dịch sang tiếng Anh, giữ nguyên tiếng Việt.
check(
  roleSwitchFailureToast('en', 'Không thể đổi vai trò').text2,
  'Cannot switch role',
  'mapped server msg/en',
);
check(
  roleSwitchFailureToast('vi', 'Không thể đổi vai trò').text2,
  'Không thể đổi vai trò',
  'mapped server msg/vi stays vi',
);

// Message server chưa map: tiếng Anh dùng fallback chung (G6), không rò tiếng Việt.
check(
  roleSwitchFailureToast('en', 'Lỗi gì đó chưa từng thấy').text2,
  'Something went wrong, please try again',
  'unmapped server msg/en falls back to generic',
);
check(
  roleSwitchFailureToast('vi', 'Lỗi gì đó chưa từng thấy').text2,
  'Lỗi gì đó chưa từng thấy',
  'unmapped server msg/vi stays as-is',
);

console.log(`role-switch-toast: ${passed}/10 cases passed`);
