import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mobile = 'http://127.0.0.1:8085';
const admin = 'http://127.0.0.1:3101';
const api = 'http://127.0.0.1:3100/api/v1';
const fixtures = JSON.parse(readFileSync('reports/qa-2026-10-20/ui-fixtures.json', 'utf8'));
const phones = { customer: '0907000000', helper: '0907000001', admin: '0907000002' };
async function authenticate(page: Page, role: keyof typeof phones, isAdmin = false) {
  const response = await page.request.post(`${api}/auth/login`, {
    data: { phone: phones[role], password: 'QaOnly123!' },
  });
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  await page.addInitScript(
    ({ data, isAdmin }) => {
      if (sessionStorage.getItem('qa-auth-seeded')) return;
      if (isAdmin) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem(
          'homemate-admin-auth',
          JSON.stringify({
            state: {
              user: data.user,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              isAuthenticated: true,
            },
            version: 0,
          }),
        );
      } else {
        localStorage.setItem('homemate_access_token', data.access_token);
        localStorage.setItem('homemate_refresh_token', data.refresh_token);
        localStorage.setItem('homemate_user', JSON.stringify(data.user));
      }
      sessionStorage.setItem('qa-auth-seeded', 'true');
    },
    { data, isAdmin },
  );
  return data;
}

test('customer: login using visible form, then logout cancel and confirm', async ({ page }) => {
  await page.goto(`${mobile}/login`);
  await page.getByPlaceholder('Nhập SĐT hoặc email của bạn').fill(phones.customer);
  await page.getByPlaceholder('Nhập mật khẩu').fill('QaOnly123!');
  await page.getByText('Đăng nhập', { exact: true }).last().click();
  await expect(page).toHaveURL(/home/, { timeout: 20000 });
  await page.goto(`${mobile}/(customer)/profile`);
  await expect(page.getByText('QA customer', { exact: true })).toBeVisible();
  page.once('dialog', d => d.dismiss());
  await page.getByText('Đăng xuất', { exact: true }).click();
  await expect(page.getByText('QA customer', { exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByText('Đăng xuất', { exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(() => localStorage.getItem('homemate_access_token'))).toBeNull();
});

test('customer: feedback menu opens functional form and persists feedback', async ({ page }) => {
  await authenticate(page, 'customer');
  await page.goto(`${mobile}/(customer)/profile`);
  await page.getByText('Góp ý ứng dụng Green House', { exact: true }).click();
  await expect(page).toHaveURL(/feedback/);
  const field = page.getByPlaceholder('Mô tả ít nhất 10 ký tự');
  await field.fill('QA browser: feedback persisted successfully');
  await page.getByText('Gửi góp ý', { exact: true }).click();
  await expect(page.getByText('Đã gửi góp ý. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await expect(
    page.getByText('QA browser: feedback persisted successfully', { exact: true }),
  ).toBeVisible();
});

test('customer: failed role switch stays on profile and explains error', async ({ page }) => {
  await authenticate(page, 'customer');
  await page.route('**/users/me/role', r =>
    r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'QA injected failure' }),
    }),
  );
  await page.goto(`${mobile}/(customer)/profile`);
  await page.getByText(/Chuyển sang.*Thợ/i).click();
  await expect(page.getByText('Chưa chuyển được chế độ', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/profile/);
});

test('customer: accept helper updates job and helper popup opens details', async ({
  page,
  browser,
}) => {
  const auth = await authenticate(page, 'customer');
  const helperContext = await browser.newContext();
  const helperPage = await helperContext.newPage();
  await authenticate(helperPage, 'helper');
  await helperPage.goto(`${mobile}/(helper)/dashboard`);
  await expect(helperPage.getByText('QA helper', { exact: true })).toBeVisible();
  await page.goto(`${mobile}/job-detail/${fixtures.jobId}`);
  await page.getByText('Chấp nhận thợ này', { exact: true }).click();
  await expect(page.getByText('Chọn thợ này nhé?', { exact: true })).toBeVisible();
  await page.getByText('Xác nhận chọn', { exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`${api}/jobs/${fixtures.jobId}`, {
              headers: { Authorization: `Bearer ${auth.access_token}` },
            })
          ).json()
        ).data.status,
    )
    .toBe('confirmed');
  await expect(page.getByText('Chấp nhận thợ này', { exact: true })).toHaveCount(0);
  await expect(helperPage.getByText('Tin vui về đơn hàng 🎉', { exact: true })).toBeVisible();
  await helperPage.getByText('Tin vui về đơn hàng 🎉', { exact: true }).click();
  await expect(helperPage).toHaveURL(new RegExp(`helper-job-detail/${fixtures.jobId}`));
  await helperContext.close();
});

test('helper: reviews menu opens own profile', async ({ page }) => {
  await authenticate(page, 'helper');
  await page.goto(`${mobile}/(helper)/profile`);
  await page.getByText('Đánh giá & Phản hồi từ khách hàng', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`helper-profile/${fixtures.helperId}`));
});

const customerRoutes = [
  '/(customer)/home',
  '/(customer)/booking',
  '/(customer)/jobs',
  '/(customer)/messages',
  '/(customer)/profile',
  '/edit-profile',
  '/bank-account',
  '/notifications',
  '/help-center',
  '/policy-insurance',
  '/feedback',
  `/helper-profile/${fixtures.helperId}`,
  `/job-detail/${fixtures.jobId}`,
  `/chat/${fixtures.jobId}`,
];
const helperRoutes = [
  '/(helper)/dashboard',
  '/(helper)/jobs',
  '/(helper)/profile',
  '/(helper)/earnings',
  '/kyc',
  '/bank-account',
  `/helper-job-detail/${fixtures.jobId}`,
];
for (const [role, routes] of [
  ['customer', customerRoutes],
  ['helper', helperRoutes],
] as const) {
  for (const route of routes)
    test(`${role}: route renders ${route}`, async ({ page }) => {
      const errors: string[] = [];
      const serverErrors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => {
        if (r.url().startsWith(api) && r.status() >= 500)
          serverErrors.push(`${r.status()} ${r.url()}`);
      });
      await authenticate(page, role);
      await page.goto(mobile + route);
      await expect(page.locator('body')).not.toContainText('Unmatched Route');
      await expect
        .poll(async () => (await page.locator('body').innerText()).length)
        .toBeGreaterThan(30);
      await page.waitForTimeout(1200);
      expect(errors).toEqual([]);
      expect(serverErrors).toEqual([]);
      await expect(page).not.toHaveURL(/login/);
    });
}

test('helper: bank account edits persist after reload', async ({ page }) => {
  const auth = await authenticate(page, 'helper');
  await page.goto(`${mobile}/bank-account`);
  await page.getByPlaceholder('VD: Vietcombank, MB Bank...').fill('QA Test Bank');
  await page.getByPlaceholder('Nhập số tài khoản ngân hàng').fill('9876543210');
  await page.getByPlaceholder('VD: NGUYEN VAN A').fill('QA HELPER');
  await page.getByRole('button', { name: 'Cập nhật tài khoản ngân hàng', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`${api}/helpers/me/profile`, {
              headers: { Authorization: `Bearer ${auth.access_token}` },
            })
          ).json()
        ).data.bank_account.account_number,
    )
    .toBe('9876543210');
  await page.reload();
  await expect(page.getByPlaceholder('Nhập số tài khoản ngân hàng')).toHaveValue('9876543210');
});

test('customer: forgot password form validates and rejects an invalid OTP', async ({ page }) => {
  await page.goto(`${mobile}/forgot-password`);
  await expect(page.getByRole('button', { name: 'Gửi mã xác minh', exact: true })).toBeDisabled();
  await page.getByLabel('Số điện thoại', { exact: true }).fill(phones.customer);
  await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
  await page.getByLabel('Mã xác minh', { exact: true }).fill('000000');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('QaNewPassword123!');
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('QaNewPassword123!');
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/OTP|xác minh|không hợp lệ/i);
});

test('admin: customer account rejected, admin login and logout work', async ({ page }) => {
  await page.goto(`${admin}/login`);
  await page.getByLabel('Số điện thoại').fill(phones.customer);
  await page.getByLabel('Mật khẩu').fill('QaOnly123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Tài khoản không có quyền admin')).toBeVisible();
  await page.getByLabel('Số điện thoại').fill(phones.admin);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('QA admin', { exact: true })).toBeVisible();
  await page.getByTitle('Đăng xuất').click();
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
});

for (const route of [
  '/',
  '/users',
  `/users/${fixtures.customerId}`,
  '/helpers',
  '/helpers/kyc',
  '/jobs',
  `/jobs/${fixtures.jobId}`,
  '/services',
  '/payments',
  '/reviews',
  '/analytics',
  '/notifications',
  '/feedback',
]) {
  test(`admin: route renders ${route}`, async ({ page }) => {
    const errors: string[] = [];
    const serverErrors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.url().startsWith(api) && r.status() >= 500)
        serverErrors.push(`${r.status()} ${r.url()}`);
    });
    await authenticate(page, 'admin', true);
    await page.goto(admin + route);
    await expect(page.getByText('QA admin', { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('This page could not be found');
    expect(errors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });
}
