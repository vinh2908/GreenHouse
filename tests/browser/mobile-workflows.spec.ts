import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync('reports/qa-2026-10-20/ui-fixtures.json', 'utf8'));
const site = 'http://127.0.0.1:8085';
const api = 'http://127.0.0.1:3100/api/v1';
const address = {
  full_address: 'QA address',
  district: 'Quan 7',
  city: 'TP HCM',
  location: { type: 'Point', coordinates: [106.701, 10.731] },
};
async function login(page: Page, helper = false) {
  const response = await page.request.post(`${api}/auth/login`, {
    data: { phone: helper ? '0907000001' : '0907000000', password: 'QaOnly123!' },
  });
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  await page.addInitScript(data => {
    if (sessionStorage.getItem('qa-login')) return;
    localStorage.setItem('homemate_access_token', data.access_token);
    localStorage.setItem('homemate_refresh_token', data.refresh_token);
    localStorage.setItem('homemate_user', JSON.stringify(data.user));
    sessionStorage.setItem('qa-login', 'yes');
  }, data);
  return { Authorization: `Bearer ${data.access_token}` };
}
async function newJob(page: Page, headers: any, title: string) {
  const response = await page.request.post(`${api}/jobs`, {
    headers,
    data: { title, description: 'QA isolated workflow', service_id: fixtures.serviceId, address },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data._id as string;
}
async function status(page: Page, headers: any, id: string) {
  return (await (await page.request.get(`${api}/jobs/${id}`, { headers })).json()).data.status;
}

test('customer: unavailable services show retry without selectable demo data', async ({ page }) => {
  await login(page);
  await page.route('**/api/v1/services', r =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"QA unavailable"}',
    }),
  );
  await page.goto(`${site}/booking`);
  await expect(page.getByRole('button', { name: 'Tải lại dịch vụ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp theo', exact: true })).toBeDisabled();
  await page.unroute('**/api/v1/services');
  await page.getByRole('button', { name: 'Tải lại dịch vụ' }).click();
  await expect(page.getByText('Giúp việc theo giờ', { exact: true })).toBeVisible();
});

test('customer: booking validates address, preserves input on server error, and succeeds on retry', async ({
  page,
}) => {
  const headers = await login(page);
  await page.route('https://rsapi.goong.io/**', r => {
    const url = r.request().url();
    if (url.includes('/Place/AutoComplete')) {
      return r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'OK',
          predictions: [
            {
              description: '123 QA Street, Quan 7, TP HCM',
              place_id: 'qa_place_123',
              structured_formatting: {
                main_text: '123 QA Street',
                secondary_text: 'Quan 7, TP HCM',
              },
            },
          ],
        }),
      });
    }
    if (url.includes('/Place/Detail')) {
      return r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'OK',
          result: {
            name: '123 QA Street',
            formatted_address: '123 QA Street, Quan 7, TP HCM',
            geometry: { location: { lat: 10.731, lng: 106.701 } },
            address_components: [
              { long_name: '123', short_name: '123', types: ['street_number'] },
              { long_name: 'QA Street', short_name: 'QA Street', types: ['route'] },
              { long_name: 'Quan 7', short_name: 'Quan 7', types: ['administrative_area_level_2'] },
              { long_name: 'TP HCM', short_name: 'TP HCM', types: ['administrative_area_level_1'] },
            ],
          },
        }),
      });
    }
    return r.continue();
  });
  await page.goto(`${site}/booking`);
  await page.getByText('Giúp việc theo giờ', { exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  await expect(
    page.getByText('Vui lòng nhập địa chỉ chi tiết và quận/huyện', { exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder('Gõ tên đường, tòa nhà, chung cư...').fill('QA Place');
  await page
    .getByText(/123 QA Street/)
    .first()
    .click();
  await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  const title = `QA booking UI ${Date.now()}`;
  await page.getByPlaceholder('VD: Dọn dẹp căn hộ 2 phòng ngủ, giặt rèm cửa...').fill(title);
  await page
    .getByPlaceholder('Mô tả chi tiết: diện tích, tình trạng thiết bị, yêu cầu riêng...')
    .fill('QA booking description preserved');
  await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  let fail = true;
  await page.route('**/api/v1/jobs', r => {
    if (r.request().method() === 'POST' && fail) {
      fail = false;
      return r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"QA retry expected"}',
      });
    }
    return r.continue();
  });
  await page.getByRole('button', { name: 'Đăng yêu cầu ngay' }).click();
  await expect(page.getByText('QA retry expected', { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng yêu cầu ngay' }).click();
  await expect(page).toHaveURL(/jobs/);
  const jobs = (await (await page.request.get(`${api}/jobs/my`, { headers })).json()).data;
  expect(jobs.filter((j: any) => j.title === title)).toHaveLength(1);
});

test('customer: cancel dialog can be dismissed and confirmed', async ({ page }) => {
  const headers = await login(page);
  const id = await newJob(page, headers, 'QA cancel UI');
  await page.goto(`${site}/job-detail/${id}`);
  page.once('dialog', d => d.dismiss());
  await page.getByText('Hủy yêu cầu', { exact: true }).click();
  expect(await status(page, headers, id)).toBe('open');
  page.once('dialog', d => d.accept());
  await page.getByText('Hủy yêu cầu', { exact: true }).click();
  await expect.poll(() => status(page, headers, id)).toBe('cancelled');
});

test('helper: new job popup opens the exact job', async ({ page, browser }) => {
  await login(page, true);
  await page.goto(`${site}/(helper)/dashboard`);
  await expect(page.getByText('QA helper', { exact: true })).toBeVisible();
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const headers = await login(customer);
  const id = await newJob(customer, headers, 'QA new job popup');
  await expect(page.getByText('Có đơn mới gần bạn 🎉', { exact: true })).toBeVisible();
  await page.getByText('Có đơn mới gần bạn 🎉', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`helper-job-detail/${id}`));
  await customerContext.close();
});

test('customer/helper: full workflow quote, accept, travel, work, approve, and chat', async ({
  page,
  browser,
}) => {
  const customerHeaders = await login(page);
  const id = await newJob(page, customerHeaders, 'QA full UI workflow');
  const helperContext = await browser.newContext({
    geolocation: { latitude: 10.731, longitude: 106.701 },
    permissions: ['geolocation'],
  });
  const helper = await helperContext.newPage();
  helper.on('dialog', d => d.accept());
  await login(helper, true);
  await helper.goto(`${site}/helper-job-detail/${id}`);
  await helper.getByRole('button', { name: 'Gửi báo giá cho khách' }).click();
  await helper.getByPlaceholder('VD: 300000').fill('200000');
  await helper.getByRole('button', { name: 'Xác nhận gửi báo giá' }).click();
  await page.goto(`${site}/job-detail/${id}`);
  await page.getByRole('button', { name: 'Chấp nhận thợ này' }).click();
  await page.getByRole('button', { name: 'Xác nhận chọn' }).click();
  await expect.poll(() => status(page, customerHeaders, id)).toBe('confirmed');
  await helper.reload();
  await helper.getByRole('button', { name: /Bắt đầu di chuyển đến khách/ }).click();
  await expect.poll(() => status(page, customerHeaders, id)).toBe('helper_on_the_way');
  await helper.getByRole('button', { name: /Tôi đã đến nơi/ }).click();
  await helper.getByRole('button', { name: /Bắt đầu làm việc/ }).click();
  await helper.getByRole('button', { name: /Hoàn thành công việc/ }).click();
  await helper.getByRole('button', { name: 'Gửi kết quả & Báo hoàn thành' }).click();
  await expect.poll(() => status(page, customerHeaders, id)).toBe('pending_review');
  await page.reload();
  await page.getByRole('button', { name: /Nghiệm thu/ }).click();
  await page.getByRole('button', { name: 'Xác nhận nghiệm thu & Gửi đánh giá' }).click();
  await expect.poll(() => status(page, customerHeaders, id)).toBe('completed');
  await page.goto(`${site}/chat/${id}`);
  await helper.goto(`${site}/chat/${id}`);
  await page.getByPlaceholder('Nhập tin nhắn trao đổi...').fill('QA chat delivered once');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  await expect(helper.getByText('QA chat delivered once', { exact: true })).toHaveCount(1);
  await helperContext.close();
});
