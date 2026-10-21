// components/common/support-faq.ts — FAQ rút gọn cho màn hình live chat hỗ trợ (Feature 18).
// FAQS trong help-center.tsx không được export nên file này giữ bản copy ngắn gọn,
// dùng riêng trong support-chat: chạm vào câu hỏi → hiện câu trả lời tĩnh dạng bong
// bóng hỗ trợ (không lưu server) + nút gửi câu hỏi thật cho đội hỗ trợ.
export interface SupportFaq {
  q: string;
  a: string;
}

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    q: 'Làm thế nào để đặt lịch / đặt lại một đơn?',
    a: 'Vào tab "Đăng việc" ở menu dưới, chọn dịch vụ, địa chỉ, thời gian và mô tả công việc — thợ gần bạn sẽ gửi báo giá để bạn chọn. Muốn đặt lại đơn cũ: mở đơn đã hoàn thành trong "Hoạt động" và bấm "Đặt lại", hoặc lưu thợ vào mục Yêu thích để đặt lại 1 chạm.',
  },
  {
    q: 'Thanh toán Escrow (giữ tiền bảo đảm) hoạt động thế nào?',
    a: 'Khi bạn chọn báo giá và thanh toán online (VietQR / MoMo / ZaloPay), tiền được Green House GIỮ bảo đảm, chưa chuyển cho thợ. Chỉ khi bạn bấm "Nghiệm thu" sau khi thợ hoàn thành, tiền mới được giải ngân cho thợ. Nếu có tranh chấp, tiền vẫn được giữ an toàn cho tới khi có phán quyết.',
  },
  {
    q: 'Tôi muốn hủy đơn thì làm sao, có mất phí không?',
    a: 'Bạn hủy miễn phí khi đơn chưa có thợ nhận hoặc thợ chưa bắt đầu di chuyển. Mở chi tiết đơn → "Hủy đơn" và chọn lý do. Nếu đã thanh toán Escrow, tiền được hoàn về phương thức gốc theo chính sách hoàn tiền. Đơn đã có thợ đang đến có thể phát sinh phí hủy muộn.',
  },
  {
    q: 'Ví ký quỹ của thợ là gì? Nạp / rút thế nào?',
    a: 'Ví ký quỹ là ví bảo đảm của thợ trên Green House: đơn thanh toán tiền mặt sẽ trừ phí sàn 15% từ ví này, và thợ cần giữ số dư tối thiểu để nhận đơn tiền mặt. Nạp tiền qua VietQR (tối thiểu 50.000₫) và rút về tài khoản ngân hàng đã liên kết trong mục Thu nhập → Ví ký quỹ.',
  },
  {
    q: 'e-KYC xác minh thợ gồm những bước nào?',
    a: 'Thợ phải chụp CCCD gắn chip 2 mặt, chụp ảnh khuôn mặt trực tiếp (liveness) và chờ admin duyệt hồ sơ. 100% thợ hiển thị trên nền tảng đều đã qua e-KYC. Thợ chưa duyệt xong sẽ chưa nhận được đơn cho tới khi hồ sơ được phê duyệt.',
  },
  {
    q: 'Bảo hành 30 ngày áp dụng ra sao?',
    a: 'Mọi đơn đã hoàn thành đều được bảo hành 30 ngày kể từ ngày nghiệm thu. Nếu công việc lỗi lại trong thời hạn, bạn mở chi tiết đơn và tạo "Đơn bảo hành 1 chạm" — miễn phí, ưu tiên gửi cho thợ cũ khắc phục. Ngoài ra bạn có thể gửi yêu cầu bồi thường bảo hiểm ngay trong chi tiết đơn.',
  },
  {
    q: 'Khiếu nại / tranh chấp được xử lý thế nào?',
    a: 'Mở chi tiết đơn → "Khiếu nại" và bổ sung bằng chứng (chữ + ảnh) trong hồ sơ tranh chấp. Tiền Escrow được giữ nguyên trong lúc tranh chấp. Admin xem xét và ra phán quyết (hoàn tiền / giải ngân / hoàn một phần); bạn có quyền kháng cáo 1 lần trong 72 giờ sau phán quyết.',
  },
  {
    q: 'Trường hợp khẩn cấp thì liên hệ ai?',
    a: 'Sự cố khẩn cấp (rò rỉ nước, chập điện, kẹt khóa...): dùng nút "Cứu hộ SOS" trên trang chủ để được ưu tiên tìm thợ trong 15–20 phút, hoặc gọi hotline 1900 8888 (24/7). Nếu có nguy hiểm tới tính mạng, hãy gọi 113/114/115 trước tiên.',
  },
];
