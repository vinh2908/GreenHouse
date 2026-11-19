// utils/monthly-contract-city.spec.ts — cases for resolveMonthlyContractCity (R11/H1).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   Run from the repo root:
//   npx tsc apps/mobile/utils/monthly-contract-city.ts apps/mobile/utils/monthly-contract-city.spec.ts --module commonjs --target es2020 --outDir /tmp/monthly-city-check --skipLibCheck && node /tmp/monthly-city-check/monthly-contract-city.spec.js
// Exit 0 = all cases pass; any failure throws.
import { resolveMonthlyContractCity } from './monthly-contract-city';

let passed = 0;

function check(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `monthly-contract-city case failed: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  passed += 1;
}

// Địa chỉ đã lưu được chọn: dùng city của địa chỉ đó, bất kể ô nhập tay.
check(
  resolveMonthlyContractCity('Đà Nẵng', ''),
  'Đà Nẵng',
  'saved address wins over empty typed city',
);
check(
  resolveMonthlyContractCity('Đà Nẵng', 'Hồ Chí Minh'),
  'Đà Nẵng',
  'saved address wins over typed city',
);
check(
  resolveMonthlyContractCity('Hà Nội', 'Đà Nẵng'),
  'Hà Nội',
  'saved address wins, different city',
);

// Nhập tay: trim, giữ nguyên thành phố người dùng nhập.
check(resolveMonthlyContractCity(undefined, 'Đà Nẵng'), 'Đà Nẵng', 'typed city kept');
check(resolveMonthlyContractCity(undefined, '  Đà Nẵng  '), 'Đà Nẵng', 'typed city trimmed');
check(
  resolveMonthlyContractCity(null, 'Cần Thơ'),
  'Cần Thơ',
  'null saved address falls back to typed city',
);

// H1: nhập tay để trống thì KHÔNG được tự điền 'Hồ Chí Minh'.
check(
  resolveMonthlyContractCity(undefined, ''),
  '',
  'empty typed city stays empty (no HCMC default)',
);
check(resolveMonthlyContractCity(undefined, '   '), '', 'whitespace-only typed city stays empty');
check(resolveMonthlyContractCity(null, ''), '', 'null saved + empty typed stays empty');

// Review R11: địa chỉ đã lưu có city trống/chỉ khoảng trắng thì rơi về ô nhập tay.
check(
  resolveMonthlyContractCity('', 'Đà Nẵng'),
  'Đà Nẵng',
  'blank saved city falls back to typed city',
);
check(
  resolveMonthlyContractCity('   ', 'Đà Nẵng'),
  'Đà Nẵng',
  'whitespace saved city falls back to typed city',
);
check(resolveMonthlyContractCity('  Đà Nẵng  ', ''), 'Đà Nẵng', 'saved city is trimmed');

console.log(`monthly-contract-city: ${passed}/12 cases passed`);
