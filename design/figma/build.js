// Generates the design-kit pages from the shared styles and icon sprite in index.html.
// Run: node design/figma/build.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const base = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const style = base.match(/<style>([\s\S]*?)<\/style>/)[1];
const sprite = base.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)[0];
const logo = base.match(/src="(data:image\/svg\+xml;base64,[^"]+)"/)[1];

const extra = `
  .sec { margin-bottom: 44px; }
  .sec > h2 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .sec > p { font-size: 13px; color: var(--g500); margin-bottom: 18px; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .comp { background: #fff; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; border: 1px solid #DDE1E7; }
  .comp > .name { font-size: 11.5px; font-weight: 700; color: #7C3AED; font-family: ui-monospace, Consolas, monospace; }
  .comp > .note { font-size: 11.5px; color: var(--g500); max-width: 340px; line-height: 1.45; }
  .vars { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .sw { width: 132px; }
  .sw .c { height: 64px; border-radius: 12px; border: 1px solid rgba(0,0,0,.06); }
  .sw b { display: block; font-size: 12.5px; margin-top: 6px; }
  .sw span { font-size: 11.5px; color: var(--g500); font-family: ui-monospace, Consolas, monospace; }
  /* flows */
  .flow { background: #fff; border-radius: 16px; border: 1px solid #DDE1E7; padding: 20px 22px; margin-bottom: 28px; }
  .flow h3 { font-size: 17px; font-weight: 800; }
  .flow > p { font-size: 12.5px; color: var(--g500); margin: 2px 0 16px; }
  .lane { display: flex; align-items: stretch; border-top: 1px dashed #D5DAE1; }
  .lane .who { width: 108px; flex: none; font-size: 12px; font-weight: 800; padding: 14px 10px 14px 0; display: flex; align-items: center; gap: 6px; }
  .lane .steps { display: flex; align-items: center; gap: 8px; padding: 12px 0; flex-wrap: wrap; }
  .step { border-radius: 10px; padding: 9px 12px; font-size: 12.5px; font-weight: 600; line-height: 1.3; max-width: 190px; border: 1.5px solid; }
  .step small { display: block; font-weight: 500; font-size: 11px; opacity: .8; margin-top: 2px; }
  .step.k { background: #EEF4FE; border-color: #BFD4FA; color: #1E3A8A; }
  .step.t { background: #FEFCE8; border-color: #EAD98A; color: #713F12; }
  .step.s { background: #F3F4F6; border-color: #D1D5DB; color: #374151; }
  .step.a { background: #F5F3FF; border-color: #D4C8FB; color: #4C1D95; }
  .step.end { background: #DCFCE7; border-color: #86EFAC; color: #166534; }
  .step.bad { background: #FEF2F2; border-color: #FCA5A5; color: #991B1B; }
  .arr { color: var(--g400); font-weight: 800; font-size: 16px; }
  .st { display: inline-block; font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; background: #111827; color: #fff; border-radius: 6px; padding: 1px 6px; margin-top: 4px; }
  .legend { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 26px; }
`;

const page = (title, sub, body) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>${style}${extra}</style></head>
<body>
${sprite}
<h1 class="doc">${title}</h1>
<p class="doc">${sub}</p>
${body}
</body></html>
`;

const ic = (id, s = '') => `<svg class="i" style="${s}"><use href="#${id}"/></svg>`;
const comp = (name, inner, note = '') =>
  `<div class="comp"><div class="name">${name}</div>${inner}${note ? `<div class="note">${note}</div>` : ''}</div>`;
const sw = (name, hex, use) =>
  `<div class="sw"><div class="c" style="background:${hex}"></div><b>${name}</b><span>${hex}</span><div style="font-size:11px;color:var(--g500)">${use}</div></div>`;
const chip = (bg, fg, t) => `<span class="chip" style="background:${bg};color:${fg}">${t}</span>`;

// ───────────────────────────── 01 Foundations ─────────────────────────────
const foundations = `
<div class="sec"><h2>Màu thương hiệu</h2><p>Lấy từ COLORS trong apps/mobile/components/ui và globals.css của admin.</p>
<div class="grid">
${sw('Primary', '#22C55E', 'Nút chính, tab đang chọn')}
${sw('Primary Dark', '#16A34A', 'Màu chủ đạo admin, giá tiền')}
${sw('Primary Light', '#DCFCE7', 'Nền chip, nền icon')}
${sw('Secondary', '#1A73E8', 'Liên kết phụ')}
${sw('Helper BG', '#FFFF99', 'Nền khu vực Thợ')}
${sw('Dark Card', '#1E1E24', 'Thẻ nổi bật nền tối')}
</div></div>

<div class="sec"><h2>Màu trạng thái</h2><p>Dùng cho thông báo, chip trạng thái đơn và KYC.</p>
<div class="grid">
${sw('Success', '#10B981', 'Đã xác thực, hoàn thành')}
${sw('Warning', '#F59E0B', 'Chờ duyệt, sao đánh giá')}
${sw('Error', '#EF4444', 'Lỗi, từ chối, huỷ')}
${sw('SOS', '#DC2626', 'Cứu hộ khẩn cấp')}
</div></div>

<div class="sec"><h2>Thang xám</h2><p>Chữ, viền, nền.</p>
<div class="grid">
${[['50', '#F9FAFB', 'Nền ô nhập'], ['100', '#F3F4F6', 'Nền nút icon'], ['200', '#E5E7EB', 'Viền'], ['300', '#D1D5DB', 'Viền nét đứt'], ['400', '#9CA3AF', 'Placeholder'], ['500', '#6B7280', 'Chữ phụ'], ['600', '#4B5563', ''], ['700', '#374151', 'Nhãn'], ['800', '#1F2937', ''], ['900', '#111827', 'Chữ chính']].map(([n, h, u]) => sw('Gray ' + n, h, u)).join('')}
</div></div>

<div class="sec"><h2>Chữ</h2><p>Mobile dùng font hệ thống; bản thiết kế dùng Inter. Admin dùng Inter.</p>
<div class="comp" style="gap:16px">
  <div><div style="font-size:26px;font-weight:900">Tiêu đề lớn · 26 / 900</div><div class="note">Tên thương hiệu, tiêu đề màn hình chào</div></div>
  <div><div style="font-size:20px;font-weight:900">Tiêu đề thẻ trạng thái · 20 / 900</div></div>
  <div><div style="font-size:17px;font-weight:800">Tiêu đề thanh đầu / mục · 17 / 800</div></div>
  <div><div style="font-size:16px;font-weight:800">Tên người dùng, tiêu đề thẻ · 16 / 800</div></div>
  <div><div style="font-size:15px;font-weight:800">Chữ nút · 15 / 800</div></div>
  <div><div style="font-size:14px;font-weight:600">Nội dung · 14 / 600</div></div>
  <div><div style="font-size:13px;font-weight:700;color:var(--g700)">Nhãn ô nhập · 13 / 700</div></div>
  <div><div style="font-size:12px;color:var(--g500)">Chữ phụ, mô tả · 12 / 400</div></div>
  <div><div style="font-size:10.5px;font-weight:600;color:var(--g400)">Nhãn tab · 10.5 / 600</div></div>
</div></div>

<div class="sec"><h2>Bo góc, khoảng cách, bóng</h2><p>Các giá trị lặp lại trong code.</p>
<div class="grid">
  ${[['Chip', 10], ['Nút nhỏ / icon', 12], ['Nút, ô nhập', 14], ['Thẻ', 18], ['Khung nổi', 24]].map(([n, r]) => `<div class="comp" style="align-items:center"><div style="width:96px;height:64px;background:var(--primary-light);border:1.5px solid var(--primary);border-radius:${r}px"></div><div class="name">radius ${r}</div><div class="note">${n}</div></div>`).join('')}
  <div class="comp"><div class="name">spacing</div><div class="vars">${[4, 8, 12, 14, 16, 24].map(s => `<div style="text-align:center;font-size:11px;color:var(--g500)"><div style="width:${s}px;height:32px;background:var(--primary);border-radius:2px;margin:0 auto 4px"></div>${s}</div>`).join('')}</div><div class="note">Lề màn hình 16 · khoảng cách giữa thẻ 14–16 · trong thẻ 10–12</div></div>
  <div class="comp"><div class="name">shadow/card</div><div class="card" style="width:200px">0 2px 8px rgba(17,24,39,.06)</div></div>
</div></div>

<div class="sec"><h2>Logo</h2><p>apps/mobile/assets/images/logo.svg</p>
<div class="grid">
  <div class="comp" style="align-items:center"><img src="${logo}" width="96" height="96" style="border-radius:24px;background:#F0FDF4" /><div class="name">logo / nền sáng</div></div>
  <div class="comp" style="align-items:center"><img src="${logo}" width="96" height="96" style="border-radius:24px;background:#22C55E" /><div class="name">logo / nền thương hiệu</div></div>
  <div class="comp" style="align-items:center"><img src="${logo}" width="44" height="44" style="border-radius:12px;background:#F0FDF4" /><div class="name">logo / 44 (admin)</div></div>
</div></div>
`;

// ───────────────────────────── 02 Components ─────────────────────────────
const quoteRow = (letter, name, meta, price) => `
  <div style="width:330px;border:1px solid var(--g100);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;background:#fff">
    <div class="row" style="gap:10px"><div class="avatar" style="width:42px;height:42px">${letter}</div>
      <div style="flex:1"><div class="row" style="gap:4px;font-size:14px;font-weight:800">${name} ${ic('shield', 'width:14px;height:14px;color:var(--success)')}</div><div class="muted" style="font-size:12px;margin-top:1px">${meta}</div></div>
      <b style="font-size:18px;color:var(--primary-dark)">${price}</b></div>
    <div class="row" style="justify-content:flex-end"><div class="btn sm">Chấp nhận thợ này</div></div>
  </div>`;

const components = `
<div class="sec"><h2>Nguyên tử (Atoms)</h2><p>Phần nhỏ nhất, không tách được nữa. Trong Figma: mỗi ô là một Component, các biến thể gộp thành Variants.</p>
<div class="grid">
${comp('Button / Primary', `<div class="vars"><div class="btn" style="width:220px">Đăng nhập</div><div class="btn" style="width:220px;opacity:.6">Đang xử lý…</div><div class="btn" style="width:220px;background:var(--g300)">Vô hiệu</div></div>`, 'Trạng thái: mặc định · đang tải · vô hiệu. Cao 52, bo 14.')}
${comp('Button / Small', `<div class="vars"><div class="btn sm">Chấp nhận thợ này</div><div class="btn sm" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary)">Viền</div></div>`, 'Cao 40, bo 12.')}
${comp('Button / Soft', `<div class="btn soft" style="width:260px;height:46px;font-size:14px">${ic('nav')}Lấy vị trí GPS hiện tại</div>`, 'Hành động phụ có icon.')}
${comp('Button / Danger text', `<div style="font-weight:700;color:var(--error);font-size:14px">Hủy yêu cầu</div>`)}
${comp('Input', `<div style="width:300px;display:flex;flex-direction:column;gap:12px"><div><div class="label">Số điện thoại</div><div class="input">Nhập số điện thoại của bạn</div></div><div><div class="label">Đã nhập</div><div class="input" style="color:var(--g900)">0901 234 567</div></div><div><div class="label">Lỗi</div><div class="input" style="border-color:var(--error);color:var(--g900)">123</div><div style="font-size:12px;color:var(--error);margin-top:4px">Số điện thoại không hợp lệ</div></div></div>`, 'Trạng thái: trống · đã nhập · lỗi.')}
${comp('Chip / Trạng thái đơn', `<div class="vars" style="max-width:420px">${chip('#EEF4FE', '#1D4ED8', 'Chờ thợ báo giá')}${chip('#F5F3FF', '#5B21B6', 'Có báo giá')}${chip('#FFF7ED', '#C2410C', 'Đã nhận đơn')}${chip('#FEF9C3', '#854D0E', 'Thợ đang đến')}${chip('#E0F2FE', '#075985', 'Đang làm')}${chip('#FCE7F3', '#9D174D', 'Chờ nghiệm thu')}${chip('#DCFCE7', '#166534', 'Hoàn thành')}${chip('#FEE2E2', '#991B1B', 'Đã hủy')}</div>`, 'Một chip cho mỗi JobStatus. Màu ở đây là đề xuất, cần đối chiếu lại với app.')}
${comp('Chip / Thông tin', `<div class="vars">${chip('var(--primary-light)', 'var(--primary)', 'Giúp việc theo giờ')}${chip('var(--g100)', 'var(--g700)', '12/10/2026')}${chip('var(--g100)', 'var(--g700)', '07:00')}</div>`)}
${comp('Avatar', `<div class="vars"><div class="avatar" style="width:32px;height:32px;font-size:12px">A</div><div class="avatar" style="width:44px;height:44px">A</div><div class="avatar" style="width:72px;height:72px;font-size:26px">A</div></div>`, 'Cỡ 32 · 44 · 72. Có ảnh hoặc chữ cái đầu.')}
${comp('Icon button', `<div class="vars"><div class="iconbtn">${ic('arrow-left')}</div><div class="iconbtn">${ic('bell', 'color:var(--g700)')}<span class="dot"></span></div><div class="iconbtn">${ic('x', 'color:var(--g700)')}</div></div>`, 'Biến thể: thường · có chấm thông báo.')}
${comp('Toggle', `<div class="vars"><div style="width:46px;height:26px;border-radius:13px;background:var(--primary);position:relative"><span style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff"></span></div><div style="width:46px;height:26px;border-radius:13px;background:var(--g300);position:relative"><span style="position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff"></span></div></div>`, 'Bật / tắt nhận việc.')}
${comp('Verified badge', `<div class="row" style="gap:4px;font-weight:800">Anh Tuấn ${ic('shield', 'width:16px;height:16px;color:var(--success)')}</div>`, 'Hiện khi verification_status = approved.')}
${comp('Price', `<div class="vars"><b style="font-size:18px;color:var(--primary-dark)">800.000đ</b><b style="font-size:15px">1.700.000đ</b></div>`)}
</div></div>

<div class="sec"><h2>Phân tử (Molecules)</h2><p>Ghép từ vài nguyên tử, làm một việc cụ thể.</p>
<div class="grid">
${comp('Header / Back + title', `<div class="header" style="width:343px;border-radius:12px;border:1px solid var(--g100)"><div class="iconbtn">${ic('arrow-left')}</div><div class="title" style="flex:1">Lau nhà 56</div>${chip('#F5F3FF', '#5B21B6', 'Có báo giá')}</div>`, 'Biến thể: có / không có chip bên phải; tiêu đề trái hoặc giữa.')}
${comp('Search bar', `<div class="row" style="width:343px;height:46px;border-radius:14px;background:var(--g100);padding:0 14px;gap:10px;color:var(--g400);font-size:14px">${ic('search')}Tìm thợ sửa điện, dọn nhà...</div>`)}
${comp('Location pill', `<div class="row" style="gap:10px"><div style="width:34px;height:34px;border-radius:10px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center">${ic('map-pin')}</div><div><div style="font-size:11px;font-weight:600;color:var(--g400)">Vị trí của bạn</div><div style="font-size:14px;font-weight:800">Đà Nẵng • Ngũ Hành Sơn ›</div></div></div>`)}
${comp('Service tile', `<div class="vars"><div class="card" style="width:78px;padding:10px 4px;text-align:center;font-size:10.5px;font-weight:600;line-height:1.3"><div style="font-size:22px">🧹</div>Giúp việc<br/>theo giờ</div><div class="card" style="width:78px;padding:10px 4px;text-align:center;font-size:10.5px;font-weight:600;line-height:1.3"><div style="font-size:22px">💡</div>Sửa điện<br/>gia dụng</div></div>`, 'Icon + tên 2 dòng.')}
${comp('Stat card', `<div class="vars"><div class="card" style="padding:12px;width:108px"><div style="font-size:10px;font-weight:700;color:var(--g500)">VÍ THU NHẬP</div><div style="font-size:15px;font-weight:900;margin:4px 0">1.700.000đ</div><div style="font-size:11px;font-weight:700;color:var(--primary)">Rút tiền →</div></div><div class="card" style="padding:12px;width:108px"><div style="font-size:10px;font-weight:700;color:var(--g500)">UY TÍN</div><div style="font-size:15px;font-weight:900;margin:4px 0;color:var(--warning)">★ 5.0</div><div style="font-size:11px;color:var(--g400)">Thợ xuất sắc</div></div></div>`)}
${comp('Quote row', quoteRow('Q', 'Quốc Cường', 'Cách 1,2km • Dự kiến đến ~5 phút', '800.000đ'), 'Biến thể: có khoảng cách · "Chưa xác định được vị trí thợ".')}
${comp('Job card / Thợ', `<div class="card" style="width:343px;display:flex;flex-direction:column;gap:10px"><div class="row between"><b style="font-size:15px">Lau nhà 56</b><span style="font-size:12px;font-weight:700;color:var(--primary)">một giờ trước</span></div><div class="row" style="gap:10px;font-size:13px;color:var(--g700)">${chip('var(--primary-light)', 'var(--primary)', 'Giúp việc theo giờ')}📍 Cách 1,2km • 🕐 07:00</div><div class="row between" style="border-top:1px solid var(--g100);padding-top:10px;font-size:13px"><span class="muted">2 thợ đã báo giá</span><b style="color:var(--primary)">Gửi báo giá ngay →</b></div></div>`)}
${comp('Active job card', `<div class="card" style="width:343px;border:2px solid var(--primary);display:flex;flex-direction:column;gap:10px"><div class="row between"><b style="font-size:15px">Deco phòng khách</b>${chip('#FFF7ED', '#C2410C', 'Đã nhận đơn')}</div><div class="row muted" style="gap:14px;font-size:13px"><span class="row" style="gap:4px">${ic('map-pin', 'width:14px;height:14px')}Ngũ Hành Sơn</span><span class="row" style="gap:4px">${ic('clock', 'width:14px;height:14px')}09:00</span></div><div class="btn" style="height:44px;font-size:13.5px">Cập nhật tiến độ &amp; Nghiệm thu →</div></div>`)}
${comp('Banner / SOS', `<div style="width:343px;background:#DC2626;border-radius:18px;padding:14px 16px;color:#fff;display:flex;gap:12px;align-items:center"><div style="font-size:26px">🚨</div><div style="flex:1"><div class="row" style="gap:8px"><b style="font-size:14px">CỨU HỘ SOS KHẨN CẤP</b><span style="background:rgba(255,255,255,.2);font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px">15P CÓ MẶT</span></div><div style="font-size:12px;opacity:.9;margin-top:2px">Chập điện, vỡ ống nước, kẹt khóa cửa ngoài...</div></div></div>`)}
${comp('Banner / Online status', `<div style="width:343px;background:#1E1E24;border-radius:18px;padding:16px;color:#fff;display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="row" style="gap:8px;font-size:16px;font-weight:800"><span style="width:9px;height:9px;border-radius:50%;background:var(--success)"></span>Đang nhận đơn mới</div><div style="font-size:12.5px;color:rgba(255,255,255,.7);margin-top:4px">Bạn sẽ nhận được thông báo ngay khi có khách hàng đăng việc gần bạn.</div></div><div style="width:46px;height:26px;border-radius:13px;background:var(--primary);position:relative;flex:none"><span style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff"></span></div></div>`, 'Biến thể: đang nhận đơn · ngoại tuyến.')}
${comp('Upload tile', `<div style="width:311px;height:96px;border-radius:14px;border:2px dashed var(--g300);background:var(--g50);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--g700)"><div style="width:38px;height:38px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center">${ic('camera')}</div>Chụp hoặc chọn ảnh mặt trước</div>`, 'Biến thể: trống · đã có ảnh.')}
${comp('Map tile', `<div class="mapph" style="width:311px;height:150px"><div class="water"></div><div class="pin"><svg viewBox="0 0 24 24"><use href="#map-pin"/></svg></div><div class="row" style="position:absolute;right:8px;top:8px;gap:5px;background:rgba(17,24,39,.85);color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;font-weight:700">${ic('map-pin', 'width:13px;height:13px')}Mở bản đồ chọn địa chỉ</div></div>`, 'Biến thể: có ghim · "Chưa chọn vị trí".')}
${comp('KYC status card', `<div class="vars" style="align-items:stretch"><div class="card" style="width:200px;background:#ECFDF5;border:1.5px solid #A7F3D0;text-align:center;font-size:13px;font-weight:800;color:#065F46">Đã xác thực e-KYC</div><div class="card" style="width:200px;background:#FFFBEB;border:1.5px solid #FDE68A;text-align:center;font-size:13px;font-weight:800;color:#92400E">Đang được xét duyệt</div><div class="card" style="width:200px;background:#FEF2F2;border:1.5px solid #FECACA;text-align:center;font-size:13px;font-weight:800;color:#991B1B">Bị từ chối xét duyệt</div></div>`, 'Ba trạng thái: approved · pending · rejected.')}
</div></div>

<div class="sec"><h2>Tổ chức (Organisms)</h2><p>Khối lớn dùng lại ở nhiều màn hình.</p>
<div class="grid">
${comp('Tab bar / Khách hàng', `<div class="tabbar" style="width:375px;border:1px solid var(--g100);border-radius:12px"><div class="tab on">${ic('home')}Trang chủ</div><div class="tab">${ic('list')}Hoạt động</div><div class="tab">${ic('plus')}Đăng việc</div><div class="tab">${ic('chat')}Tin nhắn</div><div class="tab">${ic('user')}Tài khoản</div></div>`, '5 tab. Mỗi tab có trạng thái chọn / không chọn.')}
${comp('Tab bar / Thợ', `<div class="tabbar" style="width:375px;border:1px solid var(--g100);border-radius:12px"><div class="tab on">${ic('home')}Tổng quan</div><div class="tab">${ic('list')}Nhận việc</div><div class="tab">${ic('trend')}Thu nhập</div><div class="tab">${ic('user')}Tài khoản</div></div>`, '4 tab.')}
${comp('Quote list', `<div class="card" style="width:362px;display:flex;flex-direction:column;gap:12px"><b style="font-size:16px">Danh sách thợ báo giá (2)</b>${quoteRow('Q', 'Quốc Cường', 'Cách 1,2km • Dự kiến đến ~5 phút', '800.000đ')}${quoteRow('T', 'Anh Tuấn', 'Cách 860km • Dự kiến đến ~10 giờ 51 phút', '500.000đ')}</div>`, 'Thứ tự: trong 30 km trước, ngoài bán kính sau, chưa có vị trí cuối cùng.')}
${comp('Admin / Sidebar', `<div class="side" style="height:560px;border:1px solid #E2E8F0;border-radius:10px"><div class="brand"><img src="${logo}" width="44" height="44" style="border-radius:12px;background:#F0FDF4" /><div><div style="font-size:18px;font-weight:800">Green House</div><div style="font-size:12px;color:#64748B">Admin Portal</div></div></div><nav style="font-size:14px"><div class="nav">${ic('grid')}Tổng quan Dashboard</div><div class="nav">${ic('users')}Quản lý Người dùng</div><div class="nav">${ic('user')}Đối tác Thợ &amp; Giúp việc</div><div class="nav on">${ic('shield')}Duyệt e-KYC Thợ</div><div class="nav">${ic('brief')}Quản lý Đơn hàng</div><div class="nav">${ic('wrench')}Dịch vụ &amp; Phí</div><div class="nav">${ic('cardi')}Thanh toán &amp; Rút tiền</div><div class="nav">${ic('star')}Đánh giá &amp; Phản hồi</div><div class="nav">${ic('chart')}Thống kê &amp; Báo cáo</div><div class="nav">${ic('mega')}Gửi thông báo</div></nav></div>`, 'Nav item: thường · đang chọn (chỉ một mục sáng).')}
${comp('Admin / Action buttons', `<div class="vars" style="font-size:14px"><span class="obtn" style="color:#16A34A;border-color:#86EFAC">${ic('check', 'width:13px;height:13px')}Duyệt</span><span class="obtn" style="color:#DC2626;border-color:#FCA5A5">${ic('xc', 'width:13px;height:13px')}Từ chối</span></div>`)}
</div></div>
`;

// ───────────────────────────── 03 Flows ─────────────────────────────
const S = (cls, t, small = '', st = '') =>
  `<div class="step ${cls}">${t}${small ? `<small>${small}</small>` : ''}${st ? `<div class="st">${st}</div>` : ''}</div>`;
const A = '<span class="arr">→</span>';
const lane = (who, steps) => `<div class="lane"><div class="who">${who}</div><div class="steps">${steps.join(A)}</div></div>`;
const flow = (title, desc, lanes) => `<div class="flow"><h3>${title}</h3><p>${desc}</p>${lanes.join('')}</div>`;

const flows = `
<div class="legend">${S('k', 'Khách hàng')}${S('t', 'Thợ / Đối tác')}${S('s', 'Hệ thống')}${S('a', 'Admin')}${S('end', 'Kết thúc tốt')}${S('bad', 'Nhánh lỗi / huỷ')}<div class="step s" style="border-style:dashed">Nhãn đen = trạng thái lưu trong hệ thống<div class="st">status</div></div></div>

${flow('1 · Vào app & xác thực tài khoản', 'Màn hình: Chào → Đăng nhập / Đăng ký → OTP → Chọn vai trò.', [
  lane('👤 Người dùng', [S('k', 'Mở app', 'Màn hình chào'), S('k', 'Đăng nhập', 'SĐT + mật khẩu'), S('end', 'Vào trang chính', 'Khách: Trang chủ · Thợ: Tổng quan')]),
  lane('👤 Người mới', [S('k', 'Đăng ký', 'Họ tên, SĐT, mật khẩu'), S('k', 'Nhập OTP'), S('k', 'Chọn vai trò', 'Khách hàng / Thợ'), S('end', 'Vào trang chính')]),
  lane('⚙️ Hệ thống', [S('s', 'Kiểm tra thông tin'), S('s', 'Cấp phiên đăng nhập', 'Tự làm mới khi hết hạn'), S('bad', 'Sai thông tin', 'Báo lỗi, ở lại màn hình')]),
])}

${flow('2 · Đặt việc thường: báo giá → chọn thợ → nghiệm thu', 'Luồng chính của sản phẩm. Thứ tự trạng thái lấy từ JobStatus trong packages/types.', [
  lane('🙋 Khách', [S('k', 'Đăng yêu cầu', '5 bước: dịch vụ, mô tả, địa chỉ, thời gian, xác nhận', 'open'), S('k', 'Xem danh sách báo giá', 'Xếp theo khoảng cách, sao, giá'), S('k', 'Chấp nhận một thợ', '', 'confirmed'), S('k', 'Theo dõi thợ'), S('k', 'Nghiệm thu', 'Xem ảnh hoàn thành', 'completed'), S('k', 'Thanh toán'), S('end', 'Đánh giá thợ')]),
  lane('🔧 Thợ', [S('t', 'Thấy đơn gần mình', 'Tab Nhận việc'), S('t', 'Gửi báo giá', 'Giá công, ghi chú', 'receiving_quotes'), S('t', 'Đang đến', '', 'helper_on_the_way'), S('t', 'Đã đến nơi', '', 'helper_arrived'), S('t', 'Bắt đầu làm', '', 'in_progress'), S('t', 'Báo hoàn thành', 'Ảnh / video kết quả', 'pending_review')]),
  lane('⚙️ Hệ thống', [S('s', 'Lưu vị trí thợ', 'GPS hoặc điểm ghim'), S('s', 'Tính quãng đường & thời gian đến'), S('s', 'Tạo hợp đồng', 'Khi khách chọn thợ'), S('s', 'Mở khung chat'), S('s', 'Gửi thông báo mỗi bước'), S('s', 'Cộng tiền vào ví thợ')]),
  lane('⚠️ Nhánh khác', [S('bad', 'Khách hủy yêu cầu', '', 'cancelled'), S('bad', 'Khiếu nại', 'Không đồng ý nghiệm thu', 'disputed'), S('bad', 'Hoàn tiền', '', 'refunded')]),
])}

${flow('3 · Cứu hộ khẩn cấp SOS', 'Không qua báo giá: thợ nào nhận trước thì được đơn.', [
  lane('🙋 Khách', [S('k', 'Bấm SOS', 'Chọn loại sự cố, địa chỉ, ảnh'), S('k', 'Chờ thợ nhận'), S('k', 'Theo dõi thợ trên bản đồ'), S('end', 'Nghiệm thu & thanh toán')]),
  lane('⚙️ Hệ thống', [S('s', 'Tạo đơn SOS', 'Có phụ phí', 'open'), S('s', 'Phát tới mọi thợ đang online đã e-KYC'), S('s', 'Chốt cho thợ nhận đầu tiên', 'Thợ sau nhận thông báo "đã có thợ khác nhận"', 'confirmed')]),
  lane('🔧 Thợ', [S('t', 'Nhận cảnh báo SOS', 'Hiện trên Tổng quan'), S('t', 'Bấm nhận đơn'), S('t', 'Di chuyển → làm → báo hoàn thành')]),
])}

${flow('4 · Thợ: đăng ký → e-KYC → bật nhận việc', 'Trạng thái lấy từ VerificationStatus và HelperStatus.', [
  lane('🔧 Thợ', [S('t', 'Chọn vai trò Thợ'), S('t', 'Nộp hồ sơ e-KYC', 'Số CCCD, ảnh 2 mặt, ảnh chân dung', 'pending'), S('t', 'Chờ duyệt'), S('t', 'Bật nhận việc', '', 'online'), S('end', 'Thấy đơn & gửi báo giá')]),
  lane('🛡️ Admin', [S('a', 'Mở Duyệt e-KYC Thợ'), S('a', 'Xem 3 ảnh', 'Phóng to để đối chiếu'), S('a', 'Duyệt', '', 'approved'), S('bad', 'Từ chối + lý do', '', 'rejected')]),
  lane('⚙️ Hệ thống', [S('s', 'Lưu ảnh gốc, không nén'), S('s', 'Gửi thông báo kết quả'), S('s', 'Bị từ chối → thợ nộp lại'), S('s', 'Đang làm đơn → tạm ngừng nhận SOS', '', 'busy')]),
])}

${flow('5 · Thu nhập & rút tiền', 'Tiền về ví sau khi đơn hoàn thành; rút tiền cần admin duyệt.', [
  lane('🔧 Thợ', [S('t', 'Xem ví thu nhập', 'Tab Thu nhập'), S('t', 'Liên kết tài khoản ngân hàng'), S('t', 'Yêu cầu rút tiền'), S('end', 'Nhận tiền')]),
  lane('🛡️ Admin', [S('a', 'Mở Thanh toán & Rút tiền'), S('a', 'Duyệt yêu cầu rút'), S('bad', 'Từ chối yêu cầu')]),
  lane('⚙️ Hệ thống', [S('s', 'Ghi giao dịch vào ví'), S('s', 'Thông báo kết quả cho thợ')]),
])}

${flow('6 · Admin: các phân hệ', 'Mỗi phân hệ là một mục trên thanh bên của trang quản trị.', [
  lane('🛡️ Người & hồ sơ', [S('a', 'Quản lý Người dùng', 'Tìm, khoá / mở tài khoản'), S('a', 'Đối tác Thợ & Giúp việc'), S('a', 'Duyệt e-KYC Thợ')]),
  lane('🛡️ Vận hành', [S('a', 'Quản lý Đơn hàng', 'Danh sách, chi tiết đơn'), S('a', 'Dịch vụ & Phí'), S('a', 'Đánh giá & Phản hồi')]),
  lane('🛡️ Tiền & số liệu', [S('a', 'Thanh toán & Rút tiền'), S('a', 'Thống kê & Báo cáo'), S('a', 'Gửi thông báo')]),
])}
`;

const out = [
  ['01-nen-tang.html', 'Green House – 01 Nền tảng', 'Màu, chữ, bo góc, khoảng cách, logo. Nhập vào Figma page "01 Nền tảng" rồi tạo Color/Text Styles từ đây.', foundations],
  ['02-thanh-phan.html', 'Green House – 02 Thành phần', 'Tách từ nhỏ đến lớn: nguyên tử → phân tử → tổ chức. Tên tím phía trên mỗi ô là tên Component nên đặt trong Figma.', components],
  ['03-luong.html', 'Green House – 03 Luồng sự kiện', 'Mỗi hàng là một vai trò, đọc từ trái sang phải. Dùng làm bản đồ để nối prototype giữa các màn hình.', flows],
];
for (const [file, title, sub, body] of out) fs.writeFileSync(path.join(dir, file), page(title, sub, body));
console.log('built', out.map(o => o[0]).join(', '));
