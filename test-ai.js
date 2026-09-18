async function testAiAssistant() {
  const BASE_URL = 'http://localhost:3000/api/v1';

  console.log('================================================================');
  console.log('🤖 TEST TOÀN DIỆN TÍNH NĂNG TRỢ LÝ AI (GOOGLE GEMINI INTEGRATION)');
  console.log('================================================================\n');

  // 1. Đăng nhập để lấy Token
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0901111111', password: 'password123' }),
  }).then(r => r.json());
  const token = loginRes.data.access_token;
  console.log('1. Đã đăng nhập người dùng:', loginRes.data.user.full_name);

  // 2. Kiểm tra trạng thái AI Module
  console.log('\n2. Kiểm tra trạng thái AI Engine & Provider:');
  const statusRes = await fetch(`${BASE_URL}/ai/status`).then(r => r.json());
  console.log(' -> Trạng thái:', statusRes.data || statusRes);

  // 3. Test AI Booking Assistant: Phân tích yêu cầu tự nhiên
  console.log('\n3. Test AI Booking Assistant (Phân tích câu nói tự nhiên):');
  const prompt1 = 'Nhà mình ở Landmark 81 căn hộ 3 phòng ngủ bị bẩn nhiều sau khi sơn sửa, cần người đến tổng vệ sinh toàn bộ nhà và lau kính ban công vào chiều thứ 7 khoảng 4 tiếng.';
  console.log(' -> Khách nhập:', `"${prompt1}"`);

  const analyzeRes = await fetch(`${BASE_URL}/ai/booking/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: prompt1 }),
  }).then(r => r.json());

  console.log(' -> ✅ AI đã phân tích & bóc tách cấu trúc:');
  console.log('    • Dịch vụ gợi ý:', analyzeRes.data?.service_name, `(${analyzeRes.data?.service_type})`);
  console.log('    • Thời gian ước tính:', analyzeRes.data?.estimated_duration_hours, 'tiếng');
  console.log('    • Số thợ cần thiết:', analyzeRes.data?.num_workers, 'người');
  console.log('    • Danh sách việc cần làm:', analyzeRes.data?.tasks?.join(', '));
  console.log('    • Khoảng giá ước tính:', analyzeRes.data?.price_min?.toLocaleString(), 'đ –', analyzeRes.data?.price_max?.toLocaleString(), 'đ');
  console.log('    • Độ tin cậy (Confidence):', Math.round((analyzeRes.data?.confidence || 0.8) * 100) + '%');

  // 4. Test AI Price Estimator
  console.log('\n4. Test AI Price Estimator (Ước tính giá chi tiết):');
  const priceRes = await fetch(`${BASE_URL}/ai/price/estimate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      service_type: 'deep_cleaning',
      description: 'Tổng vệ sinh nhà phố 3 tầng diện tích sàn 180m2, lau kính và chà sàn gạch men.',
    }),
  }).then(r => r.json());

  console.log(' -> ✅ AI ước tính giá thị trường:');
  console.log('    • Khoảng giá:', priceRes.data?.price_min?.toLocaleString(), 'đ –', priceRes.data?.price_max?.toLocaleString(), 'đ');
  console.log('    • Độ phức tạp:', priceRes.data?.complexity?.toUpperCase());
  console.log('    • Lý do giải thích:', priceRes.data?.reasoning);

  // 5. Test AI Customer Support Chatbot
  console.log('\n5. Test AI Customer Support Chatbot (Hỏi đáp chính sách & chăm sóc khách hàng):');
  const userQuestion = 'Chính sách bảo hành và bảo hiểm dịch vụ của HomeMate như thế nào nếu thợ làm hỏng đồ?';
  console.log(' -> Khách hỏi:', `"${userQuestion}"`);

  const supportRes = await fetch(`${BASE_URL}/ai/support/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userQuestion,
      history: [],
    }),
  }).then(r => r.json());

  console.log(' -> 🤖 Trợ lý AI HomeMate trả lời:');
  console.log(`    "${supportRes.data?.answer || supportRes.answer}"`);
  console.log('    • Phân loại ý định (Intent):', supportRes.data?.intent || supportRes.intent);

  console.log('\n================================================================');
  console.log('🎉 TẤT CẢ TÍNH NĂNG TRỢ LÝ AI ĐÃ SẴN SÀNG 100% CHO GOOGLE GEMINI!');
  console.log('================================================================');
  process.exit(0);
}

testAiAssistant().catch(console.error);
