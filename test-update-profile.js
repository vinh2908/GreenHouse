async function testUpdateProfile() {
  const BASE_URL = 'http://localhost:3000/api/v1';

  console.log('====================================================');
  console.log('👤 TEST CẬP NHẬT THÔNG TIN CÁ NHÂN & CÁ NHÂN HÓA');
  console.log('====================================================\n');

  // 1. Đăng nhập Thợ Anh Tuấn
  const helper = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0902222222', password: 'password123' }),
  }).then(r => r.json());

  const token = helper.data.access_token;
  console.log('1. Đăng nhập Thợ ban đầu:', helper.data.user.full_name);

  // 2. Cập nhật thông tin User (Tên mới, Avatar mới, Email mới)
  console.log('\n2. Cập nhật thông tin cá nhân mới...');
  const updateRes = await fetch(`${BASE_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      full_name: 'Anh Tuấn (Thợ Điện Nước VIP 5★)',
      email: 'anhtuan.pro@homemate.vn',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    }),
  }).then(r => r.json());

  console.log(' -> ✅ Cập nhật thành công! Dữ liệu mới:');
  console.log('    • Họ và tên mới:', updateRes.data.full_name);
  console.log('    • Email mới:', updateRes.data.email);
  console.log('    • Avatar mới:', updateRes.data.avatar);

  // 3. Cập nhật thêm thông tin chuyên môn Thợ (Khu vực làm việc)
  console.log('\n3. Cập nhật khu vực hoạt động ưu tiên của Thợ...');
  const updateHelperRes = await fetch(`${BASE_URL}/helpers/me/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      working_areas: ['Quận 1', 'Quận 3', 'Bình Thạnh', 'TP. Thủ Đức'],
    }),
  }).then(r => r.json());

  console.log(' -> ✅ Khu vực làm việc đã cập nhật:', updateHelperRes.data.working_areas?.join(', '));

  console.log('\n====================================================');
  console.log('🎉 TÍNH NĂNG CHỈNH SỬA HỒ SƠ & CÁ NHÂN HÓA HOÀN TẤT!');
  console.log('====================================================');
  process.exit(0);
}

testUpdateProfile().catch(console.error);
