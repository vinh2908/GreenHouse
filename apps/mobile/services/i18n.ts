// services/i18n.ts — Từ điển song ngữ phẳng cho Feature 20 (Tiếng Anh + cỡ chữ lớn)
// Tiếng Việt là ngôn ngữ mặc định và là fallback: thiếu key ở 'en' → dùng 'vi',
// thiếu cả hai → trả về chính key để không bao giờ crash giao diện.
// Chỉ các màn hình được liệt kê trong README Feature 20 mới wire t(); phạm vi có
// chủ đích hẹp, không dịch toàn bộ app.
export const STRINGS = {
  // ─── Tab bar ──────────────────────────────────────────────────────────────
  tab_home: { vi: 'Trang chủ', en: 'Home' },
  tab_activity: { vi: 'Hoạt động', en: 'Activity' },
  tab_booking: { vi: 'Đăng việc', en: 'Post a job' },
  tab_messages: { vi: 'Tin nhắn', en: 'Messages' },
  tab_account: { vi: 'Tài khoản', en: 'Account' },
  tab_overview: { vi: 'Tổng quan', en: 'Overview' },
  tab_helper_jobs: { vi: 'Nhận việc', en: 'Find jobs' },
  tab_earnings: { vi: 'Thu nhập', en: 'Earnings' },

  // ─── Customer home ────────────────────────────────────────────────────────
  home_greeting: { vi: 'Xin chào 👋', en: 'Hello 👋' },
  home_guest: { vi: 'Khách', en: 'Guest' },
  home_your_location: { vi: 'Vị trí của bạn', en: 'Your location' },
  home_pick_location: { vi: 'Chọn khu vực của bạn', en: 'Pick your area' },
  home_search_placeholder: {
    vi: 'Tìm thợ sửa điện, dọn nhà, sửa máy lạnh...',
    en: 'Find an electrician, cleaner, AC repair...',
  },
  home_sos_title: { vi: 'CỨU HỘ SOS KHẨN CẤP', en: 'EMERGENCY SOS RESCUE' },
  home_sos_badge: { vi: '15P CÓ MẶT', en: 'ARRIVES IN 15M' },
  home_sos_subtitle: {
    vi: 'Chập điện, vỡ ống nước, kẹt khóa cửa ngoài...',
    en: 'Power faults, burst pipes, locked doors...',
  },
  home_ai_title: { vi: 'Trợ lý AI Green House', en: 'Green House AI Assistant' },
  home_featured_services: { vi: 'Dịch vụ nổi bật', en: 'Featured services' },
  home_active_jobs: { vi: 'Đơn đang thực hiện', en: 'Jobs in progress' },
  home_active_jobs_sub: {
    vi: 'Theo dõi tiến độ thợ theo thời gian thực',
    en: 'Track your helper in real time',
  },
  home_history: { vi: 'Lịch sử đặt việc', en: 'Booking history' },
  home_no_jobs_title: { vi: 'Chưa có yêu cầu nào', en: 'No requests yet' },
  home_no_jobs_sub: {
    vi: 'Đăng việc ngay để thợ xung quanh bạn báo giá nhanh chóng!',
    en: 'Post a job now and nearby helpers will quote fast!',
  },

  // ─── Job statuses (dùng qua JobStatusBadge) ───────────────────────────────
  status_open: { vi: 'Đang tìm thợ', en: 'Finding helper' },
  status_receiving_quotes: { vi: 'Có báo giá', en: 'Quotes received' },
  status_quote_selected: { vi: 'Đã chọn báo giá', en: 'Quote selected' },
  status_confirmed: { vi: 'Đã nhận đơn', en: 'Confirmed' },
  status_helper_on_the_way: { vi: 'Đang di chuyển', en: 'On the way' },
  status_helper_arrived: { vi: 'Đã đến nơi', en: 'Arrived' },
  status_in_progress: { vi: 'Đang thực hiện', en: 'In progress' },
  status_pending_review: { vi: 'Chờ nghiệm thu', en: 'Awaiting review' },
  status_completed: { vi: 'Hoàn tất', en: 'Completed' },
  status_cancelled: { vi: 'Đã hủy', en: 'Cancelled' },
  status_disputed: { vi: 'Đang tranh chấp', en: 'Disputed' },
  status_refunded: { vi: 'Đã hoàn tiền', en: 'Refunded' },

  // ─── Customer jobs ────────────────────────────────────────────────────────
  jobs_title: { vi: 'Quản lý đơn hàng', en: 'My jobs' },
  jobs_subtitle: {
    vi: 'Theo dõi và quản lý các yêu cầu của bạn',
    en: 'Track and manage your requests',
  },
  jobs_tab_all: { vi: 'Tất cả', en: 'All' },
  jobs_tab_waiting: { vi: 'Chờ thợ báo giá', en: 'Waiting for quotes' },
  jobs_tab_working: { vi: 'Đang làm', en: 'In progress' },
  jobs_tab_review: { vi: 'Nghiệm thu / Khiếu nại', en: 'Review / Disputes' },
  jobs_tab_done: { vi: 'Hoàn thành / Hoàn tiền', en: 'Completed / Refunded' },
  jobs_tab_cancelled: { vi: 'Đã hủy', en: 'Cancelled' },
  jobs_empty_title: { vi: 'Không có đơn hàng nào', en: 'No jobs here' },
  jobs_empty_sub_all: {
    vi: 'Bạn chưa đăng yêu cầu dịch vụ nào.',
    en: 'You have not posted any service request yet.',
  },
  jobs_empty_action: { vi: 'Đăng yêu cầu ngay', en: 'Post a request now' },
  jobs_details: { vi: 'Chi tiết', en: 'Details' },
  jobs_helper_label: { vi: 'Thợ:', en: 'Helper:' },
  jobs_quotes_count: { vi: '💰 {count} thợ đã báo giá', en: '💰 {count} helpers quoted' },
  jobs_waiting_quotes: { vi: 'Đang chờ thợ báo giá', en: 'Waiting for quotes' },
  jobs_service_fallback: { vi: 'Dịch vụ', en: 'Service' },
  jobs_badge_recurring: { vi: '🔁 Định kỳ', en: '🔁 Recurring' },
  jobs_badge_private: { vi: '⭐ Gửi riêng', en: '⭐ Private offer' },
  jobs_badge_warranty: { vi: '🛡 Đơn bảo hành — Miễn phí', en: '🛡 Warranty job — Free' },

  // ─── Booking ──────────────────────────────────────────────────────────────
  booking_step_service: { vi: 'Dịch vụ', en: 'Service' },
  booking_step_address: { vi: 'Địa chỉ', en: 'Address' },
  booking_step_schedule: { vi: 'Lịch hẹn', en: 'Schedule' },
  booking_step_description: { vi: 'Mô tả', en: 'Description' },
  booking_step_confirm: { vi: 'Xác nhận', en: 'Confirm' },
  booking_step_indicator: { vi: 'Bước {step}/{total}: {name}', en: 'Step {step}/{total}: {name}' },
  booking_continue: { vi: 'Tiếp theo', en: 'Continue' },
  booking_back: { vi: 'Quay lại', en: 'Back' },
  booking_confirm_title: { vi: 'Xác nhận yêu cầu', en: 'Confirm your request' },
  booking_submit: { vi: 'Đăng yêu cầu ngay', en: 'Post request now' },
  booking_fixed_price: { vi: '🏷️ Giá cam kết:', en: '🏷️ Fixed price:' },
  booking_use_suggestion: { vi: 'Tiếp tục với gợi ý này →', en: 'Continue with this suggestion →' },

  // ─── Helper dashboard ─────────────────────────────────────────────────────
  dash_wallet: { vi: 'VÍ THU NHẬP', en: 'EARNINGS WALLET' },
  dash_withdraw: { vi: 'Rút tiền →', en: 'Withdraw →' },
  dash_done: { vi: 'ĐÃ LÀM', en: 'COMPLETED' },
  dash_jobs_unit: { vi: '{count} đơn', en: '{count} jobs' },
  dash_acceptance_rate: { vi: 'Tỷ lệ nhận 100%', en: '100% acceptance' },
  dash_reputation: { vi: 'UY TÍN', en: 'RATING' },
  dash_top_helper: { vi: 'Thợ xuất sắc', en: 'Top-rated helper' },
  dash_active_job: { vi: 'Công việc đang tiến hành', en: 'Job in progress' },
  dash_active_job_sub: {
    vi: 'Nhấn để cập nhật trạng thái di chuyển / hoàn thành',
    en: 'Tap to update travel / completion status',
  },
  dash_online_hint: {
    vi: 'Bạn sẽ nhận được thông báo ngay khi có khách hàng đăng việc gần bạn trong bán kính 15km.',
    en: 'You will be notified as soon as a customer posts a job within 15 km of you.',
  },
  dash_offline_hint: {
    vi: 'Gạt công tắc để mở radar quét đơn hàng dịch vụ gần bạn.',
    en: 'Turn on the switch to scan for service jobs near you.',
  },
  dash_working_hint: {
    vi: 'Bạn đang có công việc đang tiến hành. Trạng thái sẽ tự chuyển về Đang nhận đơn khi bạn hoàn tất nghiệm thu.',
    en: 'You have a job in progress. Your status returns to Available once it is reviewed and completed.',
  },

  // ─── Helper earnings / wallet ─────────────────────────────────────────────
  earn_wallet_balance_label: {
    vi: 'Số dư ví ký quỹ & thu nhập khả dụng',
    en: 'Escrow wallet balance & available earnings',
  },
  earn_total_received: { vi: 'Tổng thu nhập đã nhận:', en: 'Total earnings received:' },
  earn_total_income: { vi: 'Tổng thu nhập', en: 'Total income' },
  earn_withdrawn: { vi: 'Đã rút về TK', en: 'Withdrawn to bank' },
  earn_wallet_balance: { vi: 'Số dư ví', en: 'Wallet balance' },
  earn_topup: { vi: 'Nạp tiền', en: 'Top up' },
  earn_topup_wallet: { vi: 'Nạp ví ký quỹ', en: 'Top up escrow wallet' },
  earn_topup_title: { vi: 'Nạp tiền vào ví ký quỹ', en: 'Top up escrow wallet' },
  earn_withdraw: { vi: 'Rút tiền', en: 'Withdraw' },
  earn_withdraw_bank: { vi: 'Rút về ngân hàng', en: 'Withdraw to bank' },
  earn_withdraw_title: { vi: 'Rút tiền về tài khoản', en: 'Withdraw to your bank account' },
  earn_history: { vi: 'Lịch sử giao dịch', en: 'Transaction history' },
  earn_history_title: { vi: 'Lịch sử biến động số dư', en: 'Balance history' },
  earn_no_transactions: { vi: 'Chưa có giao dịch nào', en: 'No transactions yet' },
  earn_no_transactions_sub: {
    vi: 'Các khoản thu nhập, nạp ký quỹ và khấu trừ hoa hồng sẽ hiển thị tại đây',
    en: 'Earnings, escrow top-ups and platform fee deductions will appear here',
  },
  earn_current_balance: { vi: 'Số dư ví hiện tại', en: 'Current wallet balance' },
  earn_current_balance_short: { vi: 'Số dư hiện tại', en: 'Current balance' },

  // ─── Profiles (chung) ─────────────────────────────────────────────────────
  profile_section_account: { vi: 'Tài khoản & Cá nhân', en: 'Account & Personal' },
  profile_section_support: { vi: 'Hỗ trợ & Pháp lý', en: 'Support & Legal' },
  profile_personal_info: { vi: 'Thông tin cá nhân', en: 'Personal information' },
  profile_saved_addresses: { vi: 'Địa chỉ đã lưu', en: 'Saved addresses' },
  profile_my_vouchers: { vi: 'Voucher của tôi', en: 'My vouchers' },
  profile_payment_wallet: {
    vi: 'Phương thức thanh toán & Ví',
    en: 'Payment methods & Wallet',
  },
  profile_notification_settings: { vi: 'Cài đặt thông báo', en: 'Notification settings' },
  profile_favorite_helpers: { vi: 'Thợ yêu thích', en: 'Favorite helpers' },
  profile_recurring_plans: { vi: 'Gói định kỳ của tôi', en: 'My recurring plans' },
  profile_monthly_contracts: { vi: 'Hợp đồng theo tháng', en: 'Monthly contracts' },
  profile_support_online: { vi: '💬 Hỗ trợ trực tuyến', en: '💬 Online support' },
  profile_help_center: {
    vi: 'Trung tâm trợ giúp Vua Thợ (24/7)',
    en: 'Help Center (24/7)',
  },
  profile_privacy_insurance: {
    vi: 'Chính sách bảo mật & Bảo hiểm 30 ngày',
    en: 'Privacy policy & 30-day insurance',
  },
  profile_rate_app: { vi: 'Đánh giá ứng dụng Green House', en: 'Rate the Green House app' },
  profile_logout: { vi: 'Đăng xuất', en: 'Log out' },
  profile_edit: { vi: 'Chỉnh sửa hồ sơ ✏️', en: 'Edit profile ✏️' },
  profile_bank_account: { vi: 'Tài khoản ngân hàng liên kết', en: 'Linked bank account' },
  profile_work_schedule: { vi: '🗓 Lịch làm việc', en: '🗓 Work schedule' },
  profile_career: { vi: 'Hồ sơ nghề nghiệp & Kỹ năng', en: 'Career profile & Skills' },
  profile_edit_helper: { vi: 'Chỉnh sửa hồ sơ thợ ✏️', en: 'Edit helper profile ✏️' },
  profile_reviews: {
    vi: 'Đánh giá & Phản hồi từ khách hàng',
    en: 'Ratings & Customer feedback',
  },
  profile_loyalty_title: {
    vi: 'Điểm thành viên — Hạng {tier}',
    en: 'Loyalty points — {tier} tier',
  },
  profile_loyalty_points: { vi: '{points} điểm', en: '{points} points' },

  // ─── Display settings (mục mới trong cả 2 profile) ────────────────────────
  settings_section: { vi: 'Cài đặt hiển thị / Display', en: 'Display / Cài đặt hiển thị' },
  settings_language: { vi: 'Ngôn ngữ / Language', en: 'Language / Ngôn ngữ' },
  settings_language_vi: { vi: 'Tiếng Việt', en: 'Tiếng Việt' },
  settings_language_en: { vi: 'English', en: 'English' },
  settings_text_size: { vi: 'Cỡ chữ / Text size', en: 'Text size / Cỡ chữ' },
  settings_text_normal: { vi: 'Thường', en: 'Normal' },
  settings_text_large: { vi: 'Lớn', en: 'Large' },

  booking_screen_title: { vi: 'Đăng yêu cầu dịch vụ', en: 'Post a service request' },
  dash_accepting: { vi: 'Đang nhận đơn mới', en: 'Accepting new jobs' },
  dash_paused: { vi: 'Đang tạm dừng nhận đơn', en: 'Paused — not accepting jobs' },
  dash_busy: { vi: 'Đang bận làm việc', en: 'Busy on a job' },
  support_greeting: { vi: 'Xin chào {name} 👋', en: 'Hello {name} 👋' },
  support_empty_sub: {
    vi: 'Chọn một câu hỏi thường gặp ở trên hoặc nhắn trực tiếp — đội hỗ trợ sẽ phản hồi ngay trong mục này.',
    en: 'Pick a common question above or message us directly — support will reply right here.',
  },
  profile_switch_helper: {
    vi: 'Chuyển sang chế độ Nhận việc / Thợ →',
    en: 'Switch to Helper mode →',
  },
  profile_switch_customer: {
    vi: 'Chuyển sang chế độ Thuê dịch vụ / Khách hàng',
    en: 'Switch to Customer mode',
  },
  profile_guest_name: { vi: 'Khách trải nghiệm', en: 'Guest user' },
  profile_not_logged_in: { vi: 'Chưa đăng nhập tài khoản', en: 'Not signed in yet' },
  profile_login: { vi: 'Đăng nhập / Tạo tài khoản', en: 'Sign in / Create account' },
  profile_app_version_customer: {
    vi: 'Green House v1.0.0 • Dịch vụ gia đình chuyên nghiệp',
    en: 'Green House v1.0.0 • Professional home services',
  },
  earn_note: {
    vi: '💡 Đơn thanh toán Online sẽ cộng 85% vào ví. Đơn thu Tiền mặt trực tiếp sẽ khấu trừ 15% phí sàn từ ví ký quỹ.',
    en: '💡 Online-paid jobs credit 85% to your wallet. Cash jobs deduct the 15% platform fee from your escrow wallet.',
  },
  home_notifications: { vi: 'Thông báo', en: 'Notifications' },
  common_details: { vi: 'Chi tiết', en: 'Details' },
  common_service: { vi: 'Dịch vụ', en: 'Service' },
  // ─── Support chat ─────────────────────────────────────────────────────────
  support_title: { vi: 'Đội hỗ trợ Green House', en: 'Green House Support Team' },
  support_online: { vi: '● Trực tuyến 24/7', en: '● Online 24/7' },
  support_faq_heading: {
    vi: 'Câu hỏi thường gặp — chạm để xem trả lời ngay',
    en: 'Frequently asked questions — tap for an instant answer',
  },
  support_send_question: {
    vi: 'Gửi câu này cho đội hỗ trợ',
    en: 'Send this question to support',
  },
  support_sent: { vi: '✓ Đã gửi cho đội hỗ trợ', en: '✓ Sent to support' },
  support_placeholder: { vi: 'Nhắn cho đội hỗ trợ...', en: 'Message support...' },
  support_closed_notice: {
    vi: 'Hội thoại này đã được đội hỗ trợ đóng. Gửi tin nhắn mới sẽ mở một hội thoại hỗ trợ mới.',
    en: 'This conversation was closed by support. Sending a new message opens a new support conversation.',
  },
} as const;

export type I18nKey = keyof typeof STRINGS;
export type AppLanguage = 'vi' | 'en';

export function translate(
  lang: AppLanguage,
  key: I18nKey | string,
  params?: Record<string, string | number>,
): string {
  const entry = (STRINGS as Record<string, { vi: string; en: string }>)[key];
  let text = entry ? entry[lang] || entry.vi : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}
