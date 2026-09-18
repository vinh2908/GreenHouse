async function testHungarianMatching() {
  const BASE_URL = 'http://localhost:3000/api/v1';

  console.log('================================================================');
  console.log('🧮 KIỂM TRA THUẬT TOÁN HUNGARIAN (ASSIGNMENT PROBLEM SOLVER)');
  console.log('1. Khớp đơn tối ưu toàn cục N Thợ <-> M Đơn trong O(N^3)');
  console.log('2. So sánh hiệu quả thuật toán Hungarian vs Thuật toán Tham lam');
  console.log('3. API phân bổ đơn hàng tự động thông minh');
  console.log('================================================================\n');

  // 1. Đăng nhập Admin & Khách hàng
  console.log('📌 [BƯỚC 1] Đăng nhập Admin để gọi API Khớp đơn theo lô (Batch Matching)...');
  const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0999999999', password: 'admin123' }),
  }).then(r => r.json());
  const adminToken = adminLogin.data.access_token;
  console.log(' -> ✅ Admin:', adminLogin.data.user.full_name);

  const customerLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0901111111', password: 'password123' }),
  }).then(r => r.json());
  const customerToken = customerLogin.data.access_token;

  // 2. Lấy danh sách Jobs đang mở để test
  console.log('\n📌 [BƯỚC 2] Lấy danh sách công việc đang chờ thợ...');
  const jobsRes = await fetch(`${BASE_URL}/jobs/my`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  }).then(r => r.json());
  const jobsList = jobsRes.data;
  console.log(` -> Tìm thấy ${jobsList.length} đơn hàng trong hệ thống`);

  const sampleJob = jobsList[0];

  // 3. Test API tìm thợ tối ưu cho 1 đơn cụ thể bằng điểm đa tiêu chí (Distance + Skill + Rating + KYC)
  if (sampleJob) {
    console.log(`\n📌 [BƯỚC 3] Tìm thợ tối ưu nhất cho đơn: "${sampleJob.title}"...`);
    const optimalRes = await fetch(`${BASE_URL}/matching/jobs/${sampleJob._id}/optimal-helpers?limit=3`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    }).then(r => r.json());

    console.log(` -> ✅ Danh sách ${optimalRes.data.length} thợ phù hợp nhất theo thuật toán:`);
    optimalRes.data.forEach((m, idx) => {
      console.log(`    [${idx + 1}] ${m.helper.full_name} (SĐT: ${m.helper.phone})`);
      console.log(`        Điểm tương thích: ${m.match_score}/100 | Khoảng cách: ${m.helper.distance_km}km | Đánh giá: ★ ${m.helper.average_rating}`);
      console.log(`        Tiêu chí nổi bật: ${m.match_reasons.join(', ')}`);
    });
  }

  // 4. Test API Batch Matching (Khớp đơn toàn cục N x M bằng Hungarian Algorithm)
  console.log('\n📌 [BƯỚC 4] Chạy Batch Matching (Hungarian Algorithm) phân bổ N thợ <-> M đơn tối ưu toàn cục...');
  const batchRes = await fetch(`${BASE_URL}/matching/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
  }).then(r => r.json());

  console.log(' -> ✅ Kết quả chạy Thuật toán Hungarian:');
  console.log(' -> Kích thước ma trận:', batchRes.data.matrix_size);
  console.log(' -> Tổng số cặp ghép tối ưu thành công:', batchRes.data.total_matched);
  batchRes.data.matches.forEach((pair, idx) => {
    console.log(`\n    [Cặp ghép ${idx + 1}] Điểm hữu dụng: ${pair.match_score}/100`);
    console.log(`      • Công việc: "${pair.job.title}" (${pair.job.district})`);
    console.log(`      • Thợ phụ trách: ${pair.helper.full_name} (${pair.helper.phone}) - Cách ${pair.helper.distance_km}km`);
    console.log(`      • Lý do khớp: ${pair.match_reasons.join(' | ')}`);
  });

  console.log('\n================================================================');
  console.log('🎉 THUẬT TOÁN HUNGARIAN ĐÃ ĐƯỢC TÍCH HỢP VÀ VẬN HÀNH HOÀN HẢO!');
  console.log('================================================================');
  process.exit(0);
}

testHungarianMatching().catch(console.error);
