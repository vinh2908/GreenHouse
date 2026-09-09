import mongoose from 'mongoose';

async function testFullFlow() {
  const BASE_URL = 'http://localhost:3000/api/v1';

  console.log('====================================================');
  console.log('🚀 BẮT ĐẦU KIỂM TRA TOÀN BỘ LUỒNG (END-TO-END FLOW)');
  console.log('====================================================\n');

  // Helper fetch
  const post = async (endpoint: string, body: any, token?: string) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(json)}`);
    return json.data;
  };

  const get = async (endpoint: string, token?: string) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(json)}`);
    return json.data;
  };

  const patch = async (endpoint: string, body?: any, token?: string) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(json)}`);
    return json.data;
  };

  // ─── BƯỚC 1: Đăng nhập Khách hàng & Thợ ───────────────────────────────────────
  console.log('📌 [BƯỚC 1] Đăng nhập tài khoản...');
  const customerLogin = await post('/auth/login', { phone: '0901111111', password: 'password123' }).catch(async () => {
    // Nếu pass cũ chưa match thì đăng ký mới hoặc pass 123456
    return post('/auth/login', { phone: '0901111111', password: 'password123' });
  });
  const customerToken = customerLogin.access_token;
  console.log(' -> ✅ Khách hàng đăng nhập thành công:', customerLogin.user.full_name);

  const helperLogin = await post('/auth/login', { phone: '0902222222', password: 'password123' });
  const helperToken = helperLogin.access_token;
  console.log(' -> ✅ Thợ đăng nhập thành công:', helperLogin.user.full_name);

  // ─── BƯỚC 2: Lấy danh sách dịch vụ & Khách tạo đơn ─────────────────────────
  console.log('\n📌 [BƯỚC 2] Khách hàng chọn dịch vụ & đăng việc...');
  const servicesRes = await get('/services', customerToken);
  const servicesList = Array.isArray(servicesRes) ? servicesRes : servicesRes.services || [];
  const electricService = servicesList.find((s: any) => s.slug === 'electrician') || servicesList[0];
  console.log(` -> Dịch vụ đã chọn: ${electricService.name} (ID: ${electricService._id})`);

  const newJob = await post('/jobs', {
    service_id: electricService._id,
    title: 'Sửa chập điện ổ cắm phòng khách & thay aptomat tổng',
    description: 'Ổ cắm phòng khách bị tóe lửa khét, aptomat tự nhảy liên tục. Cần thợ có chuyên môn đến xử lý gấp trong chiều nay.',
    address: {
      full_address: '128 Đường Lê Lợi, Phường Bến Thành',
      ward: 'Phường Bến Thành',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.6983, 10.7725] },
    },
    preferred_date: new Date().toISOString().split('T')[0],
    preferred_time_start: '14:30',
    is_flexible_time: false,
  }, customerToken);
  console.log(` -> ✅ Đăng việc thành công! Job ID: ${newJob._id}`);
  console.log(` -> Trạng thái Job: [${newJob.status.toUpperCase()}]`);

  // ─── BƯỚC 3: Thợ quét danh sách đơn hàng ────────────────────────────────────
  console.log('\n📌 [BƯỚC 3] Thợ xem danh sách đơn hàng quanh khu vực...');
  const availableJobs = await get('/jobs/available', helperToken);
  console.log(` -> Số đơn hàng tìm thấy xung quanh: ${availableJobs.total} đơn`);
  const foundJob = availableJobs.jobs.find((j: any) => j._id === newJob._id);
  console.log(` -> Đã tìm thấy đơn của khách: "${foundJob.title}" tại ${foundJob.address.district}`);

  // ─── BƯỚC 4: Thợ gửi báo giá ───────────────────────────────────────────────
  console.log('\n📌 [BƯỚC 4] Thợ gửi báo giá cho đơn hàng...');
  const quote = await post(`/jobs/${newJob._id}/quotes`, {
    labor_cost: 350000,
    estimated_duration: 2,
    notes: 'Tôi mang theo đồng hồ đo điện fluke, dây điện Cadivi và aptomat Panasonic chính hãng để thay thế.',
    available_date: new Date().toISOString().split('T')[0],
  }, helperToken);
  console.log(` -> ✅ Gửi báo giá thành công!`);
  console.log(` -> Giá công báo: ${quote.labor_cost.toLocaleString()}đ | Phí sàn (15%): ${quote.platform_fee.toLocaleString()}đ | Thợ thực nhận: ${quote.helper_receives.toLocaleString()}đ`);

  // ─── BƯỚC 5: Khách hàng xem báo giá & chọn Thợ ─────────────────────────────
  console.log('\n📌 [BƯỚC 5] Khách hàng xem danh sách báo giá & chấp nhận Thợ...');
  const quotesList = await get(`/jobs/${newJob._id}/quotes`, customerToken);
  console.log(` -> Số báo giá nhận được: ${quotesList.length}`);
  const selectedQuote = quotesList[0];

  const selectResult = await post(`/jobs/${newJob._id}/select-quote`, {
    quote_id: selectedQuote._id,
    scheduled_at: new Date().toISOString(),
  }, customerToken);
  console.log(` -> ✅ Khách đã chọn thợ! Hợp đồng đã được ký.`);
  console.log(` -> Trạng thái Job cập nhật: [${selectResult.job.status.toUpperCase()}]`);

  // ─── BƯỚC 6: Thợ bắt đầu di chuyển ─────────────────────────────────────────
  console.log('\n📌 [BƯỚC 6] Thợ bắt đầu di chuyển đến nhà khách...');
  const onTheWayJob = await patch(`/jobs/${newJob._id}/on-the-way`, {}, helperToken);
  console.log(` -> ✅ Trạng thái: [${onTheWayJob.status.toUpperCase()}] (Helper on the way)`);

  // ─── BƯỚC 7: Thợ đã đến nơi ────────────────────────────────────────────────
  console.log('\n📌 [BƯỚC 7] Thợ đã có mặt tại địa chỉ khách hàng...');
  const arrivedJob = await patch(`/jobs/${newJob._id}/arrived`, {}, helperToken);
  console.log(` -> ✅ Trạng thái: [${arrivedJob.status.toUpperCase()}] (Helper arrived)`);

  // ─── BƯỚC 8: Thợ bắt đầu làm việc ──────────────────────────────────────────
  console.log('\n📌 [BƯỚC 8] Thợ bấm giờ bắt đầu làm việc...');
  const startedJob = await patch(`/jobs/${newJob._id}/start`, {}, helperToken);
  console.log(` -> ✅ Trạng thái: [${startedJob.status.toUpperCase()}] (In progress)`);

  // ─── BƯỚC 9: Thợ hoàn tất công việc ────────────────────────────────────────
  console.log('\n📌 [BƯỚC 9] Thợ hoàn tất sửa chữa & gửi yêu cầu nghiệm thu...');
  const completedJob = await patch(`/jobs/${newJob._id}/complete`, {
    completion_photos: ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e'],
  }, helperToken);
  console.log(` -> ✅ Trạng thái: [${completedJob.status.toUpperCase()}] (Pending review)`);

  // ─── BƯỚC 10: Khách hàng nghiệm thu & đánh giá 5 sao ────────────────────────
  console.log('\n📌 [BƯỚC 10] Khách hàng kiểm tra, nghiệm thu & đánh giá 5 sao...');
  const approvedJob = await patch(`/jobs/${newJob._id}/approve`, {
    rating: 5,
    review: 'Anh Tuấn làm việc rất chuyên nghiệp, cẩn thận, giải thích rõ nguyên nhân chập điện. Rất hài lòng!',
  }, customerToken);
  console.log(` -> ✅ Trạng thái đơn hàng cuối cùng: [${approvedJob.status.toUpperCase()}] (COMPLETED)`);

  // ─── BƯỚC 11: Kiểm tra ví tiền của Thợ ──────────────────────────────────────
  console.log('\n📌 [BƯỚC 11] Kiểm tra số dư ví của Thợ sau khi hoàn thành...');
  const helperWallet = await get('/payments/wallet', helperToken);
  console.log(` -> 💰 Số dư ví hiện tại: ${helperWallet.balance.toLocaleString()}đ`);
  console.log(` -> 📈 Tổng thu nhập tích lũy: ${helperWallet.total_earned.toLocaleString()}đ`);

  const transactions = await get('/payments/transactions', helperToken);
  const latestTx = transactions.transactions[0];
  console.log(` -> Giao dịch cộng tiền gần nhất: +${latestTx.amount.toLocaleString()}đ ("${latestTx.description}")`);

  console.log('\n====================================================');
  console.log('🎉 TOÀN BỘ LUỒNG E2E ĐÃ HOÀN TẤT VÀ VẬN HÀNH HOÀN HẢO!');
  console.log('====================================================');
  process.exit(0);
}

testFullFlow().catch(err => {
  console.error('Flow test error:', err);
  process.exit(1);
});
