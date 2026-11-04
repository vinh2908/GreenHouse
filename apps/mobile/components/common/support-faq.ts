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

export const SUPPORT_FAQS_EN: SupportFaq[] = [
  {
    q: 'How do I book or rebook a service?',
    a: 'Go to the "Post Job" tab in the bottom menu, select a service, address, time, and job description — nearby helpers will send you quotes. To rebook a past job: open a completed job in "Activity" and tap "Rebook", or save the helper to Favorites for 1-tap rebooking.',
  },
  {
    q: 'How does Escrow payment protection work?',
    a: 'When you accept a quote and pay online (VietQR / MoMo / ZaloPay), funds are SECURELY HELD by Green House and not released to the helper yet. Only after you tap "Approve" upon completion is payment disbursed to the helper. In case of dispute, funds remain securely held until resolved.',
  },
  {
    q: 'How do I cancel a job? Are there any fees?',
    a: 'You can cancel for free before a helper accepts the job or begins traveling. Open job details → "Cancel Job" and select a reason. If Escrow has been paid, funds are refunded to the original payment method according to the refund policy. Late cancellation fees may apply once a helper is en route.',
  },
  {
    q: 'What is the Helper Deposit Wallet? How to deposit / withdraw?',
    a: 'The Deposit Wallet is the helper security balance on Green House: cash jobs deduct a 15% platform fee from this wallet, and helpers must maintain a minimum balance to receive cash jobs. Top up via VietQR (min 50,000₫) and withdraw to linked bank accounts in Earnings → Deposit Wallet.',
  },
  {
    q: 'What are the steps for helper e-KYC verification?',
    a: 'Helpers must scan both sides of their chip-based ID card, take a live facial selfie (liveness check), and await admin review. 100% of helpers visible on the platform are verified via e-KYC. Unapproved helpers cannot accept jobs until approved.',
  },
  {
    q: 'How does the 30-day warranty work?',
    a: 'All completed jobs include a 30-day warranty from the date of sign-off. If the issue recurs within this period, open job details and create a "1-Tap Warranty Job" — free of charge, prioritized to the original helper. You can also file insurance claims directly from the job details.',
  },
  {
    q: 'How are complaints and disputes resolved?',
    a: 'Open job details → "Dispute" and submit evidence (text + photos). Escrow funds remain safely held during the dispute. Admin reviews and issues a resolution (full refund / release / partial refund); you may appeal once within 72 hours of the decision.',
  },
  {
    q: 'Who should I contact in an emergency?',
    a: 'For urgent emergencies (water leaks, short circuits, lockouts, etc.): use the "SOS Emergency" button on the home screen to find priority helpers in 15–20 minutes, or call hotline 1900 8888 (24/7). For life-threatening emergencies, call 113/114/115 immediately.',
  },
];

export function getSupportFaqs(lang?: string): SupportFaq[] {
  return lang === 'en' ? SUPPORT_FAQS_EN : SUPPORT_FAQS;
}
