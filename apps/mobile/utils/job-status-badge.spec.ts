// utils/job-status-badge.spec.ts — R18: test cases for jobStatusBadgeLabel.
import { jobStatusBadgeLabel } from './job-status-badge';

let passed = 0;

function check(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `job-status-badge case failed: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  passed += 1;
}

// 1. Helper role: open / receiving_quotes / new
check(jobStatusBadgeLabel('open', 'helper', 'vi'), 'Đơn mới', 'helper/open/vi');
check(jobStatusBadgeLabel('open', 'helper', 'en'), 'New', 'helper/open/en');
check(jobStatusBadgeLabel('receiving_quotes', 'helper', 'vi'), 'Đơn mới', 'helper/receiving_quotes/vi');
check(jobStatusBadgeLabel('receiving_quotes', 'helper', 'en'), 'New', 'helper/receiving_quotes/en');
check(jobStatusBadgeLabel('new', 'helper', 'vi'), 'Đơn mới', 'helper/new/vi');
check(jobStatusBadgeLabel('new', 'helper', 'en'), 'New', 'helper/new/en');

// 2. Helper role: completed
check(jobStatusBadgeLabel('completed', 'helper', 'vi'), 'Đã hoàn thành', 'helper/completed/vi');
check(jobStatusBadgeLabel('completed', 'helper', 'en'), 'Completed', 'helper/completed/en');

// 3. Customer role: open
check(jobStatusBadgeLabel('open', 'customer', 'vi'), 'Đang tìm thợ', 'customer/open/vi');
check(jobStatusBadgeLabel('open', 'customer', 'en'), 'Finding helper', 'customer/open/en');

// 4. Customer role: completed
check(jobStatusBadgeLabel('completed', 'customer', 'vi'), 'Hoàn tất', 'customer/completed/vi');
check(jobStatusBadgeLabel('completed', 'customer', 'en'), 'Completed', 'customer/completed/en');

// 5. Active and cancelled statuses for helper
check(jobStatusBadgeLabel('confirmed', 'helper', 'vi'), 'Đã nhận đơn', 'helper/confirmed/vi');
check(jobStatusBadgeLabel('confirmed', 'helper', 'en'), 'Confirmed', 'helper/confirmed/en');
check(jobStatusBadgeLabel('in_progress', 'helper', 'vi'), 'Đang thực hiện', 'helper/in_progress/vi');
check(jobStatusBadgeLabel('in_progress', 'helper', 'en'), 'In progress', 'helper/in_progress/en');
check(jobStatusBadgeLabel('cancelled', 'helper', 'vi'), 'Đã hủy', 'helper/cancelled/vi');
check(jobStatusBadgeLabel('cancelled', 'helper', 'en'), 'Cancelled', 'helper/cancelled/en');

// 6. Case insensitivity
check(jobStatusBadgeLabel('COMPLETED', 'helper', 'vi'), 'Đã hoàn thành', 'helper/COMPLETED/vi');
check(jobStatusBadgeLabel('Completed', 'helper', 'en'), 'Completed', 'helper/Completed/en');
check(jobStatusBadgeLabel('OPEN', 'helper', 'vi'), 'Đơn mới', 'helper/OPEN/vi');
check(jobStatusBadgeLabel('Open', 'helper', 'en'), 'New', 'helper/Open/en');

console.log(`job-status-badge: ${passed}/22 cases passed`);
