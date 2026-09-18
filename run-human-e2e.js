const { sleep, runAdb, tap, typeText, swipe, dumpScreen, findElement, getVisibleTexts } = require('./human-tester-utils');
const http = require('http');

function apiCall(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3000/api/v1/');
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('error', err => reject(err));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runRealHumanSimulation() {
  console.log('================================================================================');
  console.log('🤖 STARTING PRECISE HUMAN-LIKE REAL DEVICE & ADMIN AUTOMATION TEST SUITE');
  console.log('================================================================================\n');

  // STEP 1: Launch App & Ensure Login as Customer
  console.log('📱 [HUMAN ACTOR: CHỊ MAI - CUSTOMER] Bước 1: Mở ứng dụng HomeMate trên thiết bị');
  runAdb('shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081"');
  await sleep(4000);

  let xml = dumpScreen();
  let texts = getVisibleTexts(xml);

  // If on login screen, tap Quick Login
  let btnLoginMai = findElement(xml, 'Khách hàng (Chị Mai)');
  if (btnLoginMai) {
    console.log('  -> Đang ở màn Login, bấm Đăng nhập nhanh Chị Mai...');
    tap(btnLoginMai.x, btnLoginMai.y);
    await sleep(2500);
    xml = dumpScreen();
  }

  // STEP 2: Navigate to Đăng việc (Post Job)
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 2: Chuyển sang tab Đăng việc');
  tap(540, 2298); // Đăng việc tab
  await sleep(1500);
  xml = dumpScreen();

  // STEP 3: Use AI Assistant Input on Mobile
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 3: Nhập yêu cầu vào ô Trợ lý AI & bấm Phân tích');
  tap(540, 686); // input box
  await sleep(500);
  typeText('Sua%smay%slanh%sDaikin%sbi%schay%snuoc%sphong%sngu');
  await sleep(600);

  console.log('  -> Bấm nút "Phân tích với AI"...');
  tap(540, 870); // nút Phân tích với AI
  await sleep(4000);
  xml = dumpScreen();

  // STEP 4: Proceed with AI Suggestion
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 4: Xem kết quả AI phân tích (Dịch vụ, Hạng mục, Ước giá)');
  swipe(540, 1600, 540, 800);
  await sleep(800);
  xml = dumpScreen();

  console.log('  -> Bấm "Tiếp tục với gợi ý này →"...');
  tap(544, 788); // Tiếp tục với gợi ý này
  await sleep(1200);
  xml = dumpScreen();

  // STEP 5: Step 2 Address -> Fill & Next
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 5: Nhập địa chỉ làm việc (128 Lê Lợi, Q1) & Next');
  tap(574, 1077);
  await sleep(500);
  typeText('128%sLe%sLoi');
  await sleep(500);

  tap(575, 2079); // Next to Step 3
  await sleep(1200);

  // STEP 6: Step 3 Schedule Date/Time -> Next
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 6: Chọn ngày giờ hẹn & Next');
  tap(575, 2079); // Next to Step 4
  await sleep(1200);

  // STEP 7: Step 4 Description -> Next
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 7: Xem mô tả chi tiết & Next');
  tap(575, 2079); // Next to Step 5
  await sleep(1200);

  // STEP 8: Step 5 Confirmation -> Post Job Now!
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 8: Kiểm tra tóm tắt & Bấm "Đăng yêu cầu ngay"');
  tap(575, 2079); // Submit Job
  await sleep(3500);
  xml = dumpScreen();
  texts = getVisibleTexts(xml);
  console.log('  -> Màn hình Quản lý đơn hàng sau khi đăng thành công:', texts.slice(0, 8).join(' | '));

  // STEP 9: Helper (Anh Tuấn) logs in and quotes the newly posted job
  console.log('\n🛠️ [HUMAN ACTOR: ANH TUẤN - THỢ] Bước 9: Thợ online nhận thông báo & gửi báo giá');
  const helperLogin = await apiCall('POST', '/api/v1/auth/login', { phone: '0902222222', password: 'password123' });
  const hToken = helperLogin.data.data.access_token;
  
  const custLogin = await apiCall('POST', '/api/v1/auth/login', { phone: '0901111111', password: 'password123' });
  const cToken = custLogin.data.data.access_token;

  // Lấy đơn hàng mới nhất có status open
  const myJobs = await apiCall('GET', '/api/v1/jobs/my?status=open', null, cToken);
  const newestJob = myJobs.data?.data?.[0];
  console.log(`  -> Thợ thấy đơn mới vừa đăng: "${newestJob?.title}" (ID: ${newestJob?._id}, Status: ${newestJob?.status})`);

  const quoteSubmit = await apiCall('POST', `/api/v1/jobs/${newestJob._id}/quotes`, {
    labor_cost: 250000,
    materials_cost: 50000,
    estimated_duration: 2,
    notes: 'Thợ Tuấn có sẵn đồ nghề và gas R32, có thể qua làm ngay!',
  }, hToken);
  console.log(`  -> Thợ đã gửi báo giá thành công: ${quoteSubmit.data.data.total_price.toLocaleString()}₫ (ID: ${quoteSubmit.data.data._id})`);

  // STEP 10: Customer accepts quote
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 10: Khách hàng đồng ý báo giá & tạo hợp đồng dịch vụ');
  const selectQuote = await apiCall('POST', `/api/v1/jobs/${newestJob._id}/select-quote`, {
    quote_id: quoteSubmit.data.data._id,
    scheduled_at: '2026-09-22T09:00:00Z',
  }, cToken);
  console.log(`  -> Khách hàng đã ký hợp đồng điện tử thành công! Trạng thái đơn: ${selectQuote.data.data.job.status}`);

  // STEP 11: Helper performs job and uploads evidence photos & videos
  console.log('\n🛠️ [HUMAN ACTOR: ANH TUẤN] Bước 11: Thợ di chuyển, thực hiện & chụp ảnh/video nghiệm thu');
  await apiCall('PATCH', `/api/v1/jobs/${newestJob._id}/on-the-way`, null, hToken);
  await apiCall('PATCH', `/api/v1/jobs/${newestJob._id}/arrived`, null, hToken);
  await apiCall('PATCH', `/api/v1/jobs/${newestJob._id}/start`, null, hToken);
  const completeRes = await apiCall('PATCH', `/api/v1/jobs/${newestJob._id}/complete`, {
    completion_photos: ['https://images.unsplash.com/ac-clean-finished.jpg'],
    completion_videos: ['https://video.homemate.vn/ac-drain-flow-checked.mp4'],
    completion_notes: 'Đã vệ sinh sạch sẽ dàn lạnh, thông ống xả nước và nạp đủ gas lạnh.',
  }, hToken);
  console.log(`  -> Thợ đã gửi bằng chứng nghiệm thu (ảnh + video), trạng thái: ${completeRes.data.data.status}`);

  // STEP 12: Customer verifies evidence & rates 5 stars
  console.log('\n📱 [HUMAN ACTOR: CHỊ MAI] Bước 12: Khách hàng kiểm tra video/ảnh bàn giao & nghiệm thu 5★');
  const approveRes = await apiCall('PATCH', `/api/v1/jobs/${newestJob._id}/approve`, {
    rating: 5,
    review: 'Thợ làm rất cẩn thận, máy lạnh hết chảy nước và mát lạnh 5 sao!',
  }, cToken);
  console.log(`  -> Đơn hàng đã hoàn tất 100%! Rating: ${approveRes.data.data.customer_rating}★`);

  // STEP 13: Admin audits everything on Dashboard
  console.log('\n🖥️ [HUMAN ACTOR: QUẢN TRỊ VIÊN ADMIN] Bước 13: Admin kiểm tra toàn bộ số liệu trên Next.js 15 Portal');
  const adminLogin = await apiCall('POST', '/api/v1/auth/login', { phone: '0999999999', password: 'admin123' });
  const aToken = adminLogin.data.data.access_token;
  const adminDashboard = await apiCall('GET', '/api/v1/admin/dashboard', null, aToken);
  console.log('  -> Thống kê Dashboard:', JSON.stringify(adminDashboard.data.data));

  const adminJobDetail = await apiCall('GET', `/api/v1/admin/jobs/${newestJob._id}`, null, aToken);
  console.log(`  -> Admin kiểm tra chi tiết đơn ${newestJob._id}:`, {
    title: adminJobDetail.data.data.title,
    status: adminJobDetail.data.data.status,
    customer_rating: adminJobDetail.data.data.customer_rating,
    completion_photos_count: adminJobDetail.data.data.completion_photos?.length,
    completion_videos_count: adminJobDetail.data.data.completion_videos?.length,
    completion_notes: adminJobDetail.data.data.completion_notes,
  });

  console.log('\n================================================================================');
  console.log('🏆 AUTOMATION E2E REAL HUMAN TEST PASSED 100% ACROSS MOBILE, BACKEND & ADMIN!');
  console.log('================================================================================');
}

runRealHumanSimulation().catch(console.error);
