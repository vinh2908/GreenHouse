# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-workflows.spec.ts >> customer/helper: full workflow quote, accept, travel, work, approve, and chat
- Location: tests\browser\mobile-workflows.spec.ts:93:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByText('QA chat delivered once', { exact: true })
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByText('QA chat delivered once', { exact: true }) with timeout 5000ms
  - waiting for getByText('QA chat delivered once', { exact: true })
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=f2e9]:
  - generic [ref=f2e11]:
    - generic [ref=f2e12] [cursor=pointer]
    - generic [ref=f2e15]: QH
    - generic [ref=f2e17]:
      - generic [ref=f2e18]: QA helper
      - generic [ref=f2e23]: ● Đang hoạt động
  - generic [ref=f2e24]:
    - generic [ref=f2e28]:
      - generic [ref=f2e29]: QA chat delivered once
      - generic [ref=f2e31]: 09:04
    - generic [ref=f2e32]:
      - textbox "Nhập tin nhắn trao đổi..." [ref=f2e33]
      - button "Gửi tin nhắn" [disabled]
```

# Test source

```ts
  24  | }
  25  | async function status(page: Page, headers: any, id: string) { return (await (await page.request.get(`${api}/jobs/${id}`, { headers })).json()).data.status; }
  26  | 
  27  | test('customer: unavailable services show retry without selectable demo data', async ({ page }) => {
  28  |   await login(page);
  29  |   await page.route('**/api/v1/services', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"QA unavailable"}' }));
  30  |   await page.goto(`${site}/booking`);
  31  |   await expect(page.getByRole('button', { name: 'Tải lại dịch vụ' })).toBeVisible();
  32  |   await expect(page.getByRole('button', { name: 'Tiếp theo', exact: true })).toBeDisabled();
  33  |   await page.unroute('**/api/v1/services');
  34  |   await page.getByRole('button', { name: 'Tải lại dịch vụ' }).click();
  35  |   await expect(page.getByText('Giúp việc theo giờ', { exact: true })).toBeVisible();
  36  | });
  37  | 
  38  | test('customer: booking validates address, preserves input on server error, and succeeds on retry', async ({ page }) => {
  39  |   const headers = await login(page);
  40  |   await page.route('https://photon.komoot.io/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{ geometry: { coordinates: [106.701, 10.731] }, properties: { osm_id: 1, name: 'QA Place', street: 'QA Street', housenumber: '123', district: 'Quan 7', city: 'TP HCM', country: 'Vietnam' } }] }) }));
  41  |   await page.goto(`${site}/booking`);
  42  |   await page.getByText('Giúp việc theo giờ', { exact: true }).click();
  43  |   await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  44  |   await expect(page.getByText('Vui lòng nhập địa chỉ chi tiết và quận/huyện', { exact: true })).toBeVisible();
  45  |   await page.getByPlaceholder('Gõ tên đường, tòa nhà, chung cư...').fill('QA Place');
  46  |   await page.getByText(/123 QA Street/).first().click();
  47  |   await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  48  |   await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  49  |   const title = `QA booking UI ${Date.now()}`;
  50  |   await page.getByPlaceholder('VD: Dọn dẹp căn hộ 2 phòng ngủ, giặt rèm cửa...').fill(title);
  51  |   await page.getByPlaceholder('Mô tả chi tiết: diện tích, tình trạng thiết bị, yêu cầu riêng...').fill('QA booking description preserved');
  52  |   await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  53  |   let fail = true;
  54  |   await page.route('**/api/v1/jobs', r => {
  55  |     if (r.request().method() === 'POST' && fail) { fail = false; return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"QA retry expected"}' }); }
  56  |     return r.continue();
  57  |   });
  58  |   await page.getByRole('button', { name: 'Đăng yêu cầu ngay' }).click();
  59  |   await expect(page.getByText('QA retry expected', { exact: true })).toBeVisible();
  60  |   await expect(page.getByText(title, { exact: true })).toBeVisible();
  61  |   await page.getByRole('button', { name: 'Đăng yêu cầu ngay' }).click();
  62  |   await expect(page).toHaveURL(/jobs/);
  63  |   const jobs = (await (await page.request.get(`${api}/jobs/my`, { headers })).json()).data;
  64  |   expect(jobs.filter((j: any) => j.title === title)).toHaveLength(1);
  65  | });
  66  | 
  67  | test('customer: cancel dialog can be dismissed and confirmed', async ({ page }) => {
  68  |   const headers = await login(page);
  69  |   const id = await newJob(page, headers, 'QA cancel UI');
  70  |   await page.goto(`${site}/job-detail/${id}`);
  71  |   page.once('dialog', d => d.dismiss());
  72  |   await page.getByText('Hủy yêu cầu', { exact: true }).click();
  73  |   expect(await status(page, headers, id)).toBe('open');
  74  |   page.once('dialog', d => d.accept());
  75  |   await page.getByText('Hủy yêu cầu', { exact: true }).click();
  76  |   await expect.poll(() => status(page, headers, id)).toBe('cancelled');
  77  | });
  78  | 
  79  | test('helper: new job popup opens the exact job', async ({ page, browser }) => {
  80  |   await login(page, true);
  81  |   await page.goto(`${site}/(helper)/dashboard`);
  82  |   await expect(page.getByText('QA helper', { exact: true })).toBeVisible();
  83  |   const customerContext = await browser.newContext();
  84  |   const customer = await customerContext.newPage();
  85  |   const headers = await login(customer);
  86  |   const id = await newJob(customer, headers, 'QA new job popup');
  87  |   await expect(page.getByText('Có đơn mới gần bạn 🎉', { exact: true })).toBeVisible();
  88  |   await page.getByText('Có đơn mới gần bạn 🎉', { exact: true }).click();
  89  |   await expect(page).toHaveURL(new RegExp(`helper-job-detail/${id}`));
  90  |   await customerContext.close();
  91  | });
  92  | 
  93  | test('customer/helper: full workflow quote, accept, travel, work, approve, and chat', async ({ page, browser }) => {
  94  |   const customerHeaders = await login(page);
  95  |   const id = await newJob(page, customerHeaders, 'QA full UI workflow');
  96  |   const helperContext = await browser.newContext({ geolocation: { latitude: 10.731, longitude: 106.701 }, permissions: ['geolocation'] });
  97  |   const helper = await helperContext.newPage();
  98  |   helper.on('dialog', d => d.accept());
  99  |   await login(helper, true);
  100 |   await helper.goto(`${site}/helper-job-detail/${id}`);
  101 |   await helper.getByRole('button', { name: 'Gửi báo giá cho khách' }).click();
  102 |   await helper.getByPlaceholder('VD: 300000').fill('200000');
  103 |   await helper.getByRole('button', { name: 'Xác nhận gửi báo giá' }).click();
  104 |   await page.goto(`${site}/job-detail/${id}`);
  105 |   await page.getByRole('button', { name: 'Chấp nhận thợ này' }).click();
  106 |   await page.getByRole('button', { name: 'Xác nhận chọn' }).click();
  107 |   await expect.poll(() => status(page, customerHeaders, id)).toBe('confirmed');
  108 |   await helper.reload();
  109 |   await helper.getByRole('button', { name: /Bắt đầu di chuyển đến khách/ }).click();
  110 |   await expect.poll(() => status(page, customerHeaders, id)).toBe('helper_on_the_way');
  111 |   await helper.getByRole('button', { name: /Tôi đã đến nơi/ }).click();
  112 |   await helper.getByRole('button', { name: /Bắt đầu làm việc/ }).click();
  113 |   await helper.getByRole('button', { name: /Hoàn thành công việc/ }).click();
  114 |   await helper.getByRole('button', { name: 'Gửi kết quả & Báo hoàn thành' }).click();
  115 |   await expect.poll(() => status(page, customerHeaders, id)).toBe('pending_review');
  116 |   await page.reload();
  117 |   await page.getByRole('button', { name: /Nghiệm thu/ }).click();
  118 |   await page.getByRole('button', { name: 'Xác nhận nghiệm thu & Gửi đánh giá' }).click();
  119 |   await expect.poll(() => status(page, customerHeaders, id)).toBe('completed');
  120 |   await page.goto(`${site}/chat/${id}`);
  121 |   await helper.goto(`${site}/chat/${id}`);
  122 |   await page.getByPlaceholder('Nhập tin nhắn trao đổi...').fill('QA chat delivered once');
  123 |   await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
> 124 |   await expect(helper.getByText('QA chat delivered once', { exact: true })).toHaveCount(1);
      |                                                                             ^ Error: expect(locator).toHaveCount(expected) failed
  125 |   await helperContext.close();
  126 | });
  127 | 
```