// utils/booking-email-verified-error.spec.ts — cases for isEmailNotVerifiedError (R11/L10).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   Run from the repo root:
//   npx tsc apps/mobile/utils/booking-email-verified-error.ts apps/mobile/utils/booking-email-verified-error.spec.ts --module commonjs --target es2020 --outDir /tmp/booking-verified-check --skipLibCheck && node /tmp/booking-verified-check/booking-email-verified-error.spec.js
// Exit 0 = all cases pass; any failure throws.
import { isEmailNotVerifiedError } from './booking-email-verified-error';

let passed = 0;

function check(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `booking-email-verified-error case failed: ${label} — expected ${expected}, got ${actual}`,
    );
  }
  passed += 1;
}

function axiosErr(data: unknown) {
  return { response: { data } };
}

// L10: mã lỗi ổn định nhận diện được ngay cả khi message đã đổi câu chữ.
check(
  isEmailNotVerifiedError(
    axiosErr({
      success: false,
      message: 'Your account needs email verification before booking.',
      error: { code: 'EMAIL_NOT_VERIFIED', details: [] },
    }),
  ),
  true,
  'code match even when message reworded',
);
check(
  isEmailNotVerifiedError(
    axiosErr({
      success: false,
      message: 'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo đơn.',
      error: { code: 'EMAIL_NOT_VERIFIED', details: [] },
    }),
  ),
  true,
  'code + old message match',
);

// Fallback: API build trước R11 không có code, vẫn nhận diện qua message cũ.
check(
  isEmailNotVerifiedError(
    axiosErr({
      success: false,
      message: 'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo đơn.',
      error: { code: 'BAD_REQUEST', details: [] },
    }),
  ),
  true,
  'substring fallback for pre-R11 API',
);
check(
  isEmailNotVerifiedError(
    axiosErr({
      success: false,
      message: ['Tài khoản chưa được xác minh qua email.'],
      error: { code: 'BAD_REQUEST', details: [] },
    }),
  ),
  true,
  'array message fallback',
);

// Không phải lỗi xác minh: các lỗi khác không được nhận nhầm.
check(
  isEmailNotVerifiedError(
    axiosErr({
      success: false,
      message: 'Giá mong muốn tối thiểu là 50.000₫',
      error: { code: 'BAD_REQUEST', details: [] },
    }),
  ),
  false,
  'other 400 not matched',
);
check(
  isEmailNotVerifiedError(axiosErr({ success: false, message: 'Unauthorized' })),
  false,
  '401 msg not matched',
);
check(isEmailNotVerifiedError(undefined), false, 'undefined err not matched');
check(isEmailNotVerifiedError(null), false, 'null err not matched');
check(isEmailNotVerifiedError({}), false, 'empty err not matched');

console.log(`booking-email-verified-error: ${passed}/9 cases passed`);
