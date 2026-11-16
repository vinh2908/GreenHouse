// utils/job-can-edit.spec.ts — cases for canEditJob (R11/L9).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   Run from the repo root:
//   npx tsc apps/mobile/utils/job-can-edit.ts apps/mobile/utils/job-can-edit.spec.ts --module commonjs --target es2020 --outDir /tmp/job-can-edit-check --skipLibCheck && node /tmp/job-can-edit-check/job-can-edit.spec.js
// Exit 0 = all cases pass; any failure throws.
import { canEditJob } from './job-can-edit';

let passed = 0;

function check(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(`job-can-edit case failed: ${label} — expected ${expected}, got ${actual}`);
  }
  passed += 1;
}

// Trạng thái sửa được: đơn chưa chốt.
check(canEditJob('open'), true, 'open editable');
check(canEditJob('pending'), true, 'pending editable');
check(canEditJob('receiving_quotes'), true, 'receiving_quotes editable');
check(canEditJob('quote_selected'), true, 'quote_selected editable');
check(canEditJob('confirmed'), true, 'confirmed editable');
check(canEditJob('helper_on_the_way'), true, 'helper_on_the_way editable');
check(canEditJob('in_progress'), true, 'in_progress editable');

// Trạng thái không sửa được — khớp server updateJob.
check(canEditJob('completed'), false, 'completed not editable');
check(canEditJob('cancelled'), false, 'cancelled not editable');
check(canEditJob('disputed'), false, 'disputed not editable');
check(canEditJob('refunded'), false, 'refunded not editable');
check(canEditJob('pending_review'), false, 'pending_review NOT editable — L9');

// Không có đơn / không có trạng thái thì không sửa được.
check(canEditJob(undefined), false, 'undefined not editable');
check(canEditJob(null), false, 'null not editable');
check(canEditJob(''), false, 'empty not editable');

console.log(`job-can-edit: ${passed}/15 cases passed`);
