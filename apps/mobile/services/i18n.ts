// services/i18n.ts — Từ điển song ngữ phẳng cho Feature 20 (Tiếng Anh + cỡ chữ lớn)
// Tiếng Việt là ngôn ngữ mặc định và là fallback: thiếu key ở 'en' → dùng 'vi',
// thiếu cả hai → trả về chính key để không bao giờ crash giao diện.
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);

export function syncDayjsLocale(lang: AppLanguage) {
  dayjs.locale(lang === 'en' ? 'en' : 'vi');
}

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
  home_pick_location: { vi: 'Chọn khu vực của bạn', en: 'Pick your area' },
  home_search_placeholder: {
    vi: 'Tìm thợ sửa điện, dọn nhà, sửa máy lạnh...',
    en: 'Find an electrician, cleaner, AC repair...',
  },
  home_active_jobs: { vi: 'Đơn đang thực hiện', en: 'Jobs in progress' },

  // ─── Helper dashboard SOS (B8) ────────────────────────────────────────────
  helper_dash_sos_title: {
    vi: 'CỨU HỘ KHẨN CẤP SOS GẦN BẠN!',
    en: 'EMERGENCY SOS RESCUE NEAR YOU!',
  },
  helper_dash_sos_body: {
    vi: '{title} tại {district}. Phụ phí +{surcharge}đ',
    en: '{title} in {district}. Surcharge +{surcharge} VND',
  },
  helper_dash_sos_accept_failed: {
    vi: 'Không thể nhận đơn cứu hộ',
    en: 'Could not accept the SOS job',
  },
  helper_dash_job_in_progress_title: {
    vi: 'Đang có công việc diễn ra',
    en: 'A job is in progress',
  },
  helper_dash_job_in_progress_msg: {
    vi: 'Bạn đang có đơn công việc đang thực hiện. Hãy hoàn thành hoặc kết thúc công việc trước khi tắt nhận việc nhé!',
    en: 'You have a job in progress. Please finish or end it before turning off job receiving.',
  },
  helper_dash_understood: { vi: 'Đã hiểu', en: 'Understood' },
  delete_account: { vi: 'Xoá tài khoản', en: 'Delete account' },
  delete_account_title: { vi: 'Xoá tài khoản của bạn', en: 'Delete your account' },
  delete_account_warn: {
    vi: 'Tài khoản của bạn sẽ bị xoá vĩnh viễn và không thể đăng nhập lại bằng số điện thoại/email này. Lịch sử đơn hàng cũ vẫn được lưu cho quản trị viên tra cứu.',
    en: 'Your account will be permanently deleted and you will not be able to sign in again with this phone/email. Past order history is kept for admin records.',
  },
  delete_account_confirm_title: {
    vi: 'Chắc chắn xoá tài khoản?',
    en: 'Are you sure you want to delete your account?',
  },
  delete_account_confirm_desc: {
    vi: 'Hành động này không thể hoàn tác. Bạn sẽ bị đăng xuất ngay và không đăng nhập lại được.',
    en: 'This cannot be undone. You will be signed out immediately and cannot sign in again.',
  },
  delete_account_password_label: {
    vi: 'Nhập mật khẩu để xác nhận',
    en: 'Enter your password to confirm',
  },
  delete_account_password_placeholder: { vi: 'Mật khẩu hiện tại', en: 'Current password' },
  delete_account_success: {
    vi: 'Tài khoản đã được xoá.',
    en: 'Your account has been deleted.',
  },
  delete_account_wrong_password: {
    vi: 'Mật khẩu không đúng. Vui lòng thử lại.',
    en: 'Wrong password. Please try again.',
  },
  time_badge_new: { vi: 'MỚI', en: 'NEW' },
  root_error_title: { vi: 'Lỗi hiển thị màn hình', en: 'Screen render error' },
  onboarding_skip: { vi: 'Bỏ qua', en: 'Skip' },
  onboarding_next: { vi: 'Tiếp', en: 'Next' },
  onboarding_start: { vi: 'Bắt đầu', en: 'Get started' },
  onboarding_1_title: { vi: 'Đặt dịch vụ trong 1 phút', en: 'Book a service in 1 minute' },
  onboarding_1_body: { vi: 'Chọn dịch vụ, chọn giờ, mô tả yêu cầu — thợ gần bạn sẽ báo giá. Bạn chọn báo giá phù hợp rồi chờ thợ đến.', en: 'Pick a service, time and describe the job — nearby helpers quote a price. Choose the quote you like and wait for the helper.' },
  onboarding_2_title: { vi: 'SOS luôn ở ngay tay', en: 'SOS is always at hand' },
  onboarding_2_body: { vi: 'Sự cố khẩn cấp? Nút SOS đỏ trên trang chính sẽ tìm thợ thay thế gần nhất và báo cho bạn ngay.', en: 'An emergency? The red SOS button on the home screen finds the nearest replacement helper and notifies you right away.' },
  onboarding_3_title: { vi: 'Thanh toán minh bạch', en: 'Transparent payment' },
  onboarding_3_body: { vi: 'Giá chốt trước khi làm, thanh toán qua ví trong app. Mọi giao dịch đều có hoá đơn và lịch sử rõ ràng.', en: 'The price is agreed before work starts, paid via the in-app wallet. Every transaction has an invoice and clear history.' },
  onboarding_4_title: { vi: 'Theo dõi đơn theo thời gian thực', en: 'Track your job in real time' },
  onboarding_4_body: { vi: 'Xem thợ đang ở đâu, nhắn tin và gọi điện trực tiếp trong app, nghiệm thu và đánh giá khi xong việc.', en: 'See where your helper is, chat and call right in the app, then review and rate when the job is done.' },
  root_error_unknown: { vi: 'Lỗi không xác định', en: 'Unknown error' },
  time_badge_night: { vi: 'ĐÊM', en: 'NIGHT' },

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
  jobs_quotes_count: { vi: ' {count} thợ đã báo giá', en: ' {count} helpers quoted' },
  jobs_waiting_quotes: { vi: 'Đang chờ thợ báo giá', en: 'Waiting for quotes' },
  jobs_service_fallback: { vi: 'Dịch vụ', en: 'Service' },
  jobs_badge_recurring: { vi: ' Định kỳ', en: ' Recurring' },
  jobs_badge_private: { vi: ' Gửi riêng', en: ' Private offer' },
  jobs_badge_warranty: { vi: ' Đơn bảo hành — Miễn phí', en: ' Warranty job — Free' },

  // ─── Booking ──────────────────────────────────────────────────────────────
  booking_step_service: { vi: 'Dịch vụ', en: 'Service' },
  booking_step_address: { vi: 'Địa chỉ', en: 'Address' },
  booking_step_schedule: { vi: 'Lịch hẹn', en: 'Schedule' },
  booking_step_description: { vi: 'Mô tả', en: 'Description' },
  booking_step_confirm: { vi: 'Xác nhận', en: 'Confirm' },
  booking_step_indicator: { vi: 'Bước {step}/{total}: {name}', en: 'Step {step}/{total}: {name}' },
  booking_continue: { vi: 'Tiếp theo', en: 'Continue' },
  booking_confirm_title: { vi: 'Xác nhận yêu cầu', en: 'Confirm your request' },
  booking_submit: { vi: 'Đăng yêu cầu ngay', en: 'Post request now' },
  booking_fixed_price: { vi: ' Giá cam kết:', en: ' Fixed price:' },
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
  earn_topup_wallet: { vi: 'Nạp ví ký quỹ', en: 'Top up escrow wallet' },
  earn_topup_title: { vi: 'Nạp tiền vào ví ký quỹ', en: 'Top up escrow wallet' },
  earn_withdraw_bank: { vi: 'Rút về ngân hàng', en: 'Withdraw to bank' },
  earn_withdraw_title: { vi: 'Rút tiền về tài khoản', en: 'Withdraw to your bank account' },
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
  profile_support_online: { vi: ' Hỗ trợ trực tuyến', en: ' Online support' },
  profile_help_center: {
    vi: 'Trung tâm trợ giúp Green House (24/7)',
    en: 'Help Center (24/7)',
  },
  profile_privacy_insurance: {
    vi: 'Chính sách bảo mật & Bảo hiểm 30 ngày',
    en: 'Privacy policy & 30-day insurance',
  },
  profile_rate_app: { vi: 'Đánh giá ứng dụng Green House', en: 'Rate the Green House app' },
  profile_rate_app_thanks_title: {
    vi: 'Cảm ơn bạn đã ủng hộ Green House! ',
    en: 'Thank you for supporting Green House! ',
  },
  profile_rate_app_thanks_desc: {
    vi: 'Đánh giá 5 sao của bạn giúp đội ngũ phát triển tốt hơn mỗi ngày.',
    en: 'Your 5-star rating helps our team improve every day.',
  },
  profile_logout_confirm_title: {
    vi: 'Đăng xuất khỏi Green House?',
    en: 'Log out of Green House?',
  },
  profile_logout_confirm_desc: {
    vi: 'Bạn có chắc chắn muốn đăng xuất tài khoản? Lịch sử đặt việc và thông tin thanh toán của bạn luôn được bảo lưu an toàn.',
    en: 'Are you sure you want to log out? Your booking history and payment info remain safe.',
  },
  profile_logout_stay: { vi: 'Ở lại', en: 'Stay' },
  profile_logout_now: { vi: 'Đăng xuất ngay', en: 'Log out now' },
  profile_logout: { vi: 'Đăng xuất', en: 'Log out' },
  profile_edit: { vi: 'Chỉnh sửa hồ sơ ', en: 'Edit profile ' },
  profile_bank_account: { vi: 'Tài khoản ngân hàng liên kết', en: 'Linked bank account' },
  profile_work_schedule: { vi: ' Lịch làm việc', en: ' Work schedule' },
  profile_career: { vi: 'Hồ sơ nghề nghiệp & Kỹ năng', en: 'Career profile & Skills' },
  profile_edit_helper: { vi: 'Chỉnh sửa hồ sơ thợ ', en: 'Edit helper profile ' },
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
  settings_section: { vi: 'Cài đặt hiển thị', en: 'Display Settings' },
  settings_theme: { vi: 'Giao diện', en: 'Appearance' },
  settings_theme_light: { vi: 'Sáng', en: 'Light' },
  settings_theme_dark: { vi: 'Tối', en: 'Dark' },
  settings_language: { vi: 'Ngôn ngữ', en: 'Language' },
  settings_language_vi: { vi: 'Tiếng Việt', en: 'Tiếng Việt' },
  settings_language_en: { vi: 'English', en: 'English' },
  settings_text_size: { vi: 'Cỡ chữ', en: 'Text Size' },
  settings_text_normal: { vi: 'Thường', en: 'Normal' },
  settings_text_large: { vi: 'Lớn', en: 'Large' },

  // ─── Messages ─────────────────────────────────────────────────────────────
  messages_title: { vi: 'Tin nhắn & Trao đổi', en: 'Messages & Chat' },
  messages_subtitle: {
    vi: 'Trò chuyện trực tiếp với thợ và khách hàng',
    en: 'Direct chat with helpers and customers',
  },
  messages_empty_title: { vi: 'Chưa có cuộc trò chuyện nào', en: 'No conversations yet' },
  messages_empty_sub: {
    vi: 'Khi bạn chấp nhận báo giá hoặc nhận đơn công việc, cuộc trò chuyện sẽ tự động được mở tại đây để hai bên trao đổi.',
    en: 'When you accept a quote or take a job, a conversation will automatically appear here.',
  },
  messages_partner_helper: { vi: 'Thợ đối tác', en: 'Partner helper' },
  messages_partner_customer: { vi: 'Khách hàng', en: 'Customer' },
  messages_job_fallback: { vi: 'Công việc', en: 'Job' },
  messages_photo: { vi: ' Ảnh', en: ' Photo' },
  messages_chat_hint: {
    vi: 'Bắt đầu trao đổi thông tin công việc...',
    en: 'Start discussing job details...',
  },

  // ─── Helper jobs ──────────────────────────────────────────────────────────
  helper_jobs_title: { vi: 'Quản lý công việc', en: 'Job Management' },
  helper_jobs_subtitle: {
    vi: 'Xem các đơn hàng mới cần thợ và theo dõi tiến độ công việc',
    en: 'View new jobs needing helpers and track ongoing work',
  },
  helper_jobs_tab_available: { vi: 'Đơn mới', en: 'New' },
  helper_jobs_tab_active: { vi: 'Đang làm', en: 'Active' },
  helper_jobs_tab_history: { vi: 'Lịch sử', en: 'History' },
  helper_jobs_demand_map: { vi: 'Bản đồ nhu cầu', en: 'Demand map' },
  helper_jobs_demand_map_sub: {
    vi: 'Xem khu vực nào đang có nhiều đơn chờ báo giá nhất',
    en: 'See which areas have the most jobs waiting for quotes',
  },
  helper_jobs_quote_now: { vi: 'Báo giá ngay', en: 'Quote now' },
  helper_jobs_view_detail: { vi: 'Xem chi tiết', en: 'View details' },
  helper_jobs_empty_available: { vi: 'Chưa có đơn mới quanh đây', en: 'No new jobs nearby' },
  helper_jobs_empty_available_sub: {
    vi: 'Bật nhận đơn và mở định vị để nhận thông báo việc mới sớm nhất.',
    en: 'Turn on accepting jobs and GPS to get notified of new jobs immediately.',
  },
  helper_jobs_empty_active: { vi: 'Không có việc đang thực hiện', en: 'No active jobs' },
  helper_jobs_empty_active_sub: {
    vi: 'Các đơn hàng bạn đang nhận làm sẽ hiển thị ở đây.',
    en: 'Jobs you are currently working on will appear here.',
  },
  helper_jobs_empty_history: { vi: 'Chưa có lịch sử công việc', en: 'No job history yet' },
  helper_jobs_empty_history_sub: {
    vi: 'Các công việc đã hoàn thành hoặc đã hủy sẽ hiển thị ở đây.',
    en: 'Completed or cancelled jobs will appear here.',
  },

  // ─── Customer Home Extra ──────────────────────────────────────────────────
  home_nearby_helpers_title: { vi: 'Thợ đang ở gần bạn', en: 'Helpers near you' },
  home_vouchers_title: { vi: 'Ưu đãi dành cho bạn', en: 'Offers for you' },
  home_vouchers_sub: {
    vi: 'Mã giảm giá dịch vụ Green House',
    en: 'Green House service discount codes',
  },
  home_all_services_title: { vi: 'Dịch vụ', en: 'Services' },
  home_quick_booking_title: { vi: 'Đặt dịch vụ nhanh', en: 'Quick Booking' },
  home_quick_booking_sub: {
    vi: 'Chọn nhanh thời gian để thợ xung quanh báo giá',
    en: 'Pick a time for nearby helpers to quote',
  },
  home_search_empty_title: { vi: 'Không tìm thấy dịch vụ', en: 'No service found' },
  home_search_empty_sub: {
    vi: 'Thử tìm với từ khóa khác (ví dụ: máy lạnh, điện, dọn nhà)',
    en: 'Try searching with other keywords (e.g. AC, electricity, cleaning)',
  },
  home_view_all: { vi: 'Xem tất cả', en: 'View all' },
  home_choose_service: { vi: 'Chọn dịch vụ này', en: 'Select service' },

  // ─── Profile Extra ────────────────────────────────────────────────────────
  profile_permissions: { vi: 'Quyền ứng dụng', en: 'App permissions' },
  profile_status_granted: { vi: 'Đã cấp', en: 'Granted' },
  profile_status_denied: { vi: 'Chưa cấp', en: 'Not granted' },

  booking_screen_title: { vi: 'Đăng yêu cầu dịch vụ', en: 'Post a service request' },
  dash_accepting: { vi: 'Đang nhận đơn mới', en: 'Accepting new jobs' },
  dash_paused: { vi: 'Đang tạm dừng nhận đơn', en: 'Paused — not accepting jobs' },
  dash_busy: { vi: 'Đang bận làm việc', en: 'Busy on a job' },
  support_greeting: { vi: 'Xin chào {name} ', en: 'Hello {name} ' },
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
    vi: ' Đơn thanh toán Online sẽ cộng 85% vào ví. Đơn thu Tiền mặt trực tiếp sẽ khấu trừ 15% phí sàn từ ví ký quỹ.',
    en: ' Online-paid jobs credit 85% to your wallet. Cash jobs deduct the 15% platform fee from your escrow wallet.',
  },
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

  // ─── 12 Demo Services & Badges ─────────────────────────────────────────────
  svc_housekeeping_hourly: { vi: 'Giúp việc theo giờ', en: 'Hourly housekeeping' },
  svc_electrician: { vi: 'Sửa điện gia dụng', en: 'Home electrician' },
  svc_house_cleaning: { vi: 'Dọn nhà', en: 'House cleaning' },
  svc_cooking: { vi: 'Nấu ăn', en: 'Home cooking' },
  svc_moving_help: { vi: 'Chuyển nhà', en: 'Home moving' },
  svc_child_care: { vi: 'Chăm trẻ', en: 'Babysitting' },
  svc_plumbing: { vi: 'Sửa ống nước', en: 'Plumbing repair' },
  svc_laundry: { vi: 'Giặt ủi', en: 'Laundry' },
  svc_ac_repair: { vi: 'Vệ sinh máy lạnh', en: 'AC cleaning' },
  svc_elderly_care: { vi: 'Chăm người già', en: 'Elderly care' },
  svc_handyman: { vi: 'Bốc hàng, vận chuyển', en: 'Cargo & logistics' },
  svc_custom: { vi: 'Dịch vụ khác — tự ghi việc, tự set giá', en: 'Other — custom task & price' },
  svc_custom_sub: { vi: 'Việc gì cũng đăng được', en: 'Post any task' },
  badge_new: { vi: 'MỚI', en: 'NEW' },

  // ─── Prices & Units ────────────────────────────────────────────────────────
  price_from_prefix: { vi: 'Từ ', en: 'From ' },
  price_per_hour: { vi: '/giờ', en: '/hr' },
  price_per_shift: { vi: '/ca', en: '/shift' },
  price_per_meal: { vi: '/bữa', en: '/meal' },
  price_per_trip: { vi: 'Báo giá theo chuyến', en: 'Quote per trip' },
  price_per_task: { vi: 'Báo giá theo việc', en: 'Quote per job' },
  price_per_kg: { vi: '/kg', en: '/kg' },
  price_per_unit: { vi: '/máy', en: '/unit' },
  price_negotiate: { vi: 'Deal giá với thợ', en: 'Negotiate price' },

  // ─── Home SOS & AI Callout ─────────────────────────────────────────────────
  home_sos_callout_title: { vi: 'SOS — Cần người gấp?', en: 'SOS — Need help fast?' },
  home_sos_callout_urgent: { vi: 'Khẩn cấp', en: 'Urgent' },
  home_sos_callout_desc: {
    vi: 'Thợ hủy phút chót hoặc việc khẩn trong ngày: phát tín hiệu SOS, thợ gần nhất nhận thay ngay trong 3 phút.',
    en: 'Last-minute cancellation or urgent job: broadcast SOS, nearest helper accepts within 3 minutes.',
  },
  home_ai_callout_title: {
    vi: 'Không biết thuộc dịch vụ nào?',
    en: 'Not sure which service you need?',
  },
  home_ai_callout_desc: {
    vi: 'Mô tả bằng lời hoặc chụp ảnh ở thẻ AI phía trên — AI gợi ý đúng dịch vụ và ước tính giá.',
    en: 'Describe or snap a photo in the AI card above — AI suggests the right service and price estimate.',
  },

  // ─── Quick Booking Form on Home ────────────────────────────────────────────
  home_quick_need_work: { vi: 'Bạn cần làm việc gì?', en: 'What do you need done?' },
  home_quick_chip_cleaning: { vi: 'Dọn nhà', en: 'Cleaning' },
  home_quick_chip_moving: { vi: 'Bốc hàng', en: 'Moving' },
  home_quick_chip_ac: { vi: 'Vệ sinh máy lạnh', en: 'AC cleaning' },
  home_quick_chip_other: { vi: 'Dịch vụ khác…', en: 'Other…' },
  home_quick_desc_placeholder: { vi: 'Mô tả công việc của bạn...', en: 'Describe your job...' },
  home_quick_price_title: {
    vi: 'Giá bạn muốn trả (giá mở đầu để deal)',
    en: 'Your target price (starting offer)',
  },
  home_quick_time_title: { vi: 'Thời gian làm việc', en: 'Working time' },
  home_quick_calendar_hint: {
    vi: 'Bấm để mở lịch tháng trong bottom sheet',
    en: 'Tap to open monthly calendar sheet',
  },
  home_quick_chip_today: { vi: 'Hôm nay', en: 'Today' },
  home_quick_chip_tomorrow: { vi: 'Ngày mai', en: 'Tomorrow' },
  home_quick_chip_sat: { vi: 'Thứ 7', en: 'Saturday' },
  home_quick_chip_sun: { vi: 'Chủ nhật', en: 'Sunday' },
  home_quick_post_btn: { vi: 'Đăng việc', en: 'Post job' },

  // ─── Benefits & Guarantees ─────────────────────────────────────────────────
  home_benefits_title: { vi: 'Quyền lợi & cam kết', en: 'Benefits & Guarantees' },
  home_benefit_verified: { vi: 'Thợ đã xác thực', en: 'Verified helpers' },
  home_benefit_verified_sub: { vi: 'CCCD & lý lịch rõ ràng', en: 'ID & background checked' },
  home_benefit_insurance: { vi: 'Bảo hiểm công việc', en: 'Job insurance' },
  home_benefit_insurance_sub: { vi: 'Bồi thường hư hỏng, mất mát', en: 'Damage & loss covered' },
  home_benefit_escrow: { vi: 'Giữ tiền bảo đảm', en: 'Escrow protection' },
  home_benefit_escrow_sub: {
    vi: 'Chỉ trả khi bạn nghiệm thu xong',
    en: 'Pay only upon satisfaction',
  },

  // ─── Active Job Timeline & Statuses on Home ────────────────────────────────
  home_timeline_confirmed: { vi: 'Đã nhận việc', en: 'Confirmed' },
  home_timeline_arriving: { vi: 'Đang đến', en: 'Arriving' },
  home_timeline_working: { vi: 'Đang làm', en: 'Working' },
  home_timeline_review: { vi: 'Nghiệm thu', en: 'Review' },
  home_status_finding_desc: {
    vi: 'Hệ thống đang điều phối và tìm thợ phù hợp nhất gần bạn.',
    en: 'System is finding the best matching helper near you.',
  },
  home_status_quotes_desc: {
    vi: 'Đã có thợ gửi báo giá, bấm để xem chi tiết và xác nhận thợ.',
    en: 'Helpers have quoted, tap to view details and confirm.',
  },
  home_status_helper_accepted_desc: {
    vi: 'Thợ đã nhận việc và đang chuẩn bị dụng cụ đến điểm hẹn.',
    en: 'Helper accepted the job and is preparing tools to depart.',
  },
  home_status_helper_coming_desc: {
    vi: 'Thợ đang trên đường di chuyển đến địa chỉ của bạn.',
    en: 'Helper is traveling to your address.',
  },
  home_status_arrived_desc: {
    vi: 'Thợ đã có mặt tại địa chỉ của bạn và chuẩn bị tiến hành công việc.',
    en: 'Helper has arrived at your address.',
  },
  home_status_in_progress_desc: {
    vi: 'Thợ đang thực hiện công việc tại địa chỉ của bạn.',
    en: 'Helper is performing the job at your address.',
  },
  home_status_pending_review_desc: {
    vi: 'Thợ đã làm xong, bạn vui lòng kiểm tra và nghiệm thu công việc.',
    en: 'Job is done, please inspect and accept the work.',
  },
  home_status_done_desc: {
    vi: 'Công việc đã hoàn thành và thanh toán thành công.',
    en: 'Job completed and payment settled.',
  },
  home_status_processing: { vi: 'Đang xử lý', en: 'Processing' },
  home_status_processing_desc: {
    vi: 'Đơn dịch vụ đang được hệ thống xử lý.',
    en: 'Job order is being processed by the system.',
  },
  home_active_empty_title: { vi: 'Bạn chưa có việc đang thực hiện', en: 'No jobs in progress' },
  home_active_empty_sub: {
    vi: 'Chọn dịch vụ hoặc đăng việc mới bên trên để thợ nhận việc ngay',
    en: 'Choose a service or post a job above to get a helper fast',
  },

  // ─── Recent Jobs on Home ───────────────────────────────────────────────────
  home_recent_title: { vi: 'Đặt gần đây', en: 'Recently booked' },
  home_view_history: { vi: 'Xem lịch sử →', en: 'View history →' },
  home_rebook_btn: { vi: 'Đặt lại', en: 'Rebook' },

  // ─── Time Picker & Schedule ───────────────────────────────────────────────
  picker_start_time: { vi: 'Giờ bắt đầu', en: 'Start time' },
  picker_unit_hour: { vi: 'giờ', en: 'hrs' },
  picker_unit_min: { vi: 'phút', en: 'mins' },
  picker_err_past_time: {
    vi: ' Thời điểm bắt đầu không thể ở quá khứ',
    en: ' Start time cannot be in the past',
  },
  picker_err_end_before_start: {
    vi: ' Giờ kết thúc phải lớn hơn giờ bắt đầu',
    en: ' End time must be after start time',
  },
  picker_chips_instruction: { vi: 'bấm là chọn đúng giờ đó', en: 'tap to select exact time' },
  picker_no_chips: { vi: 'Hôm nay đã hết khung giờ gợi ý', en: 'No suggested times left today' },
  picker_select_hour: { vi: 'Chọn Giờ (00 - 23)', en: 'Select Hour (00 - 23)' },
  picker_select_minute: { vi: 'Chọn Phút (00 - 59)', en: 'Select Minute (00 - 59)' },
  picker_preview_title: { vi: 'Lịch dự kiến', en: 'Schedule preview' },
  picker_date_label: { vi: 'Ngày:', en: 'Date:' },
  picker_time_slot_label: { vi: 'Khung giờ:', en: 'Time frame:' },
  picker_duration_label: { vi: 'Thời lượng:', en: 'Duration:' },
  picker_deal_price: { vi: 'Giá deal:', en: 'Deal price:' },
  picker_next_day: { vi: '(ngày hôm sau)', en: '(next day)' },
  picker_midnight_cross_error: {
    vi: 'Vượt quá 24:00 — không thể đặt khung giờ này, vui lòng chọn giờ sớm hơn hoặc rút ngắn thời lượng.',
    en: 'Crosses midnight — this time frame cannot be booked, please pick an earlier start or shorten the duration.',
  },
  picker_cannot_calc: { vi: 'Chưa tính được', en: 'Unavailable' },

  // ─── SOS Backup & Decision Popups ──────────────────────────────────────────
  sos_popup_title: { vi: 'YÊU CẦU NHẬN THAY SOS', en: 'SOS BACKUP REQUEST' },
  sos_popup_desc: {
    vi: 'Thợ trước không thể tiếp tục công việc này. Bạn có muốn nhận thay không?',
    en: 'The previous helper cannot continue this job. Would you like to take over?',
  },
  sos_popup_service_fallback: { vi: 'Dịch vụ tại nhà', en: 'Home service' },
  sos_popup_area: { vi: ' Khu vực:', en: ' Area:' },
  sos_popup_distance: { vi: ' Cách bạn khoảng {dist} km', en: ' About {dist} km from you' },
  sos_popup_payout: { vi: ' Thực nhận:', en: ' Net payout:' },
  sos_popup_accept: { vi: ' Nhận thay ngay', en: ' Accept takeover' },
  sos_popup_skip: { vi: 'Bỏ qua', en: 'Skip' },
  sos_popup_auto_skip: { vi: 'Tự động bỏ qua sau {sec}s', en: 'Auto skip in {sec}s' },
  sos_popup_accepted_success: {
    vi: 'Bạn đã nhận thay đơn này!',
    en: 'You accepted this takeover!',
  },
  sos_popup_accepted_sub: {
    vi: 'Hãy di chuyển đến khách hàng như đơn thường',
    en: 'Please travel to customer like a standard job',
  },
  sos_popup_already_taken: {
    vi: 'Đã có người khác nhận đơn này rồi',
    en: 'Another helper has already taken this job',
  },

  sos_customer_popup_title: { vi: 'SỰ CỐ ĐƠN HÀNG SOS', en: 'SOS ORDER INCIDENT' },
  sos_customer_popup_reason_prefix: { vi: 'không thể tiếp tục vì:', en: 'cannot continue due to:' },
  sos_customer_popup_reason_suffix: {
    vi: '. Bạn muốn xử lý thế nào?',
    en: '. How would you like to proceed?',
  },
  sos_customer_popup_replace_desc: {
    vi: ' Đổi người: một thợ khác sẽ tiếp tục đơn - giá và số tiền giữ đảm bảo không thay đổi.',
    en: ' Replace helper: another helper will take over - guaranteed price and escrow deposit remain unchanged.',
  },
  sos_customer_popup_cancel_desc: {
    vi: ' Hủy đơn: hoàn 100% số tiền bạn đã thực trả (sau voucher và điểm) vào ví. Đơn chưa thanh toán hoặc trả tiền mặt sẽ không phát sinh hoàn tiền ví.',
    en: ' Cancel order: 100% refund of your actual paid amount (after vouchers and points) to wallet. Unpaid or cash orders have no wallet refund.',
  },
  sos_customer_popup_accept_btn: {
    vi: ' Chấp nhận đổi người',
    en: ' Accept replacement helper',
  },
  sos_customer_popup_cancel_btn: {
    vi: 'Hủy đơn - hoàn tiền thực trả',
    en: 'Cancel order - refund paid amount',
  },

  // ─── In-app Voice Call ─────────────────────────────────────────────────────
  call_incoming_title: { vi: 'Cuộc gọi đến', en: 'Incoming call' },
  call_incoming_sub: { vi: 'Đối tác đang gọi cho bạn', en: 'Partner is calling you' },
  call_incoming_sub_job: {
    vi: 'Đơn {job} — đối tác đang gọi cho bạn',
    en: 'Job {job} — partner is calling you',
  },
  call_decline: { vi: 'Từ chối', en: 'Decline' },
  call_answer: { vi: 'Trả lời', en: 'Answer' },
  call_state_ended: { vi: 'Cuộc gọi đã kết thúc', en: 'Call ended' },
  call_state_rejected: { vi: 'Cuộc gọi bị từ chối', en: 'Call declined' },
  call_rejected_hint: {
    vi: 'Đối tác hiện đang bận hoặc không thể nghe máy. Bạn có thể gửi tin nhắn qua khung chat.',
    en: 'Partner is busy or cannot answer. You can leave a message in chat.',
  },
  call_thank_you: {
    vi: 'Cảm ơn bạn đã sử dụng tính năng gọi qua GreenHouse.',
    en: 'Thank you for calling via GreenHouse.',
  },
  call_muted_notice: { vi: 'Bạn đang tắt mic', en: 'Microphone is muted' },
  call_end_hint: { vi: 'Chạm nút đỏ để kết thúc cuộc gọi', en: 'Tap red button to end call' },
  call_retry: { vi: 'Thử kết nối lại', en: 'Retry connection' },
  call_no_answer: {
    vi: 'Đối tác không trả lời. Cuộc gọi đã kết thúc.',
    en: 'No answer — the other party did not pick up.',
  },

  // ─── Initial Permissions Modal ─────────────────────────────────────────────
  perm_modal_title: { vi: 'Cấp quyền ứng dụng', en: 'App Permissions' },
  perm_modal_subtitle: {
    vi: 'Để Green House hoạt động tốt nhất, vui lòng cấp các quyền cần thiết bên dưới',
    en: 'For the best Green House experience, please grant the necessary permissions below',
  },
  perm_granted: { vi: 'Đã cấp', en: 'Granted' },
  perm_grant_btn: { vi: 'Cấp quyền', en: 'Grant' },
  perm_grant_all: { vi: 'Cấp tất cả quyền', en: 'Grant all permissions' },
  perm_skip: { vi: 'Để sau / Bỏ qua', en: 'Later / Skip' },
  perm_open_settings_desc: {
    vi: 'Mở Cài đặt hệ thống để thay đổi quyền',
    en: 'Open system settings to change permissions',
  },
  perm_notifications_title: { vi: 'Thông báo đẩy', en: 'Push notifications' },
  perm_notifications_desc: {
    vi: 'Nhận thông báo khi có đơn mới, báo giá hoặc tin nhắn',
    en: 'Get notified for new jobs, quotes or messages',
  },
  perm_location_title: { vi: 'Vị trí & GPS', en: 'Location & GPS' },
  perm_location_desc: {
    vi: 'Tìm thợ xung quanh và hiển thị khoảng cách di chuyển',
    en: 'Find nearby helpers and show travel distance',
  },
  perm_camera_title: { vi: 'Máy ảnh', en: 'Camera' },
  perm_camera_desc: {
    vi: 'Chụp ảnh hiện trường công việc và giấy tờ xác thực KYC',
    en: 'Capture job photos and KYC verification IDs',
  },
  perm_microphone_title: { vi: 'Micro thoại', en: 'Microphone' },
  perm_microphone_desc: {
    vi: 'Gọi điện liên lạc miễn phí che số giữa khách và thợ',
    en: 'Free masked calling between customers and helpers',
  },
  perm_photos_title: { vi: 'Thư viện ảnh', en: 'Photo library' },
  perm_photos_desc: {
    vi: 'Tải ảnh từ máy để gửi tin nhắn hoặc cập nhật ảnh đại diện',
    en: 'Upload photos for chat or profile avatars',
  },

  // ─── Common general strings ────────────────────────────────────────────────
  common_back: { vi: 'Quay lại', en: 'Back' },
  common_close: { vi: 'Đóng', en: 'Close' },
  common_confirm: { vi: 'Xác nhận', en: 'Confirm' },
  common_cancel: { vi: 'Hủy', en: 'Cancel' },

  // ─── Helper Dashboard (Điểm 1) ─────────────────────────────────────────────
  dash_update_progress_btn: {
    vi: 'Cập nhật tiến độ & Nghiệm thu →',
    en: 'Update progress & Acceptance →',
  },
  dash_nearby_jobs_title: { vi: 'Đơn hàng gần bạn', en: 'Orders near you' },
  dash_auto_update_30s: {
    vi: 'Tự động cập nhật đơn mới mỗi 30s',
    en: 'Auto updates new jobs every 30s',
  },
  dash_offline_sub: { vi: 'Đang ở chế độ ngoại tuyến', en: 'Currently in offline mode' },
  dash_loading_status: {
    vi: 'Đang tải trạng thái nhận việc…',
    en: 'Loading job acceptance status…',
  },
  dash_offline_empty_title: { vi: 'Đang tắt nhận việc', en: 'Job acceptance paused' },
  dash_offline_empty_sub: {
    vi: "Bật công tắc 'Đang nhận đơn mới' ở trên để xem các công việc đang cần thợ xung quanh bạn.",
    en: "Turn on 'Accepting new jobs' above to view jobs needing helpers near you.",
  },
  dash_kyc_needed_title: {
    vi: 'Cần xác thực e-KYC để xem đơn',
    en: 'e-KYC verification required to view jobs',
  },
  dash_kyc_pending_sub: {
    vi: 'Hồ sơ CCCD đang chờ Admin duyệt. Bạn sẽ thấy danh sách đơn ngay khi được kích hoạt.',
    en: 'ID verification is pending admin review. Jobs will appear once activated.',
  },
  dash_kyc_not_done_sub: {
    vi: 'Vui lòng hoàn tất xác minh e-KYC (CCCD) để mở khóa xem và nhận đơn mới xung quanh bạn.',
    en: 'Please complete e-KYC verification to unlock and accept jobs near you.',
  },
  dash_no_jobs_nearby: { vi: 'Chưa có đơn mới xung quanh', en: 'No new jobs nearby' },
  dash_no_jobs_nearby_sub: {
    vi: 'Hệ thống đang quét đơn trong bán kính phục vụ. Đơn mới sẽ tự động hiển thị tại đây.',
    en: 'Scanning for jobs within service area. New jobs will appear automatically.',
  },
  dash_quotes_count: { vi: '{count} thợ đã báo giá', en: '{count} helpers quoted' },
  dash_no_quotes: { vi: 'Chưa có báo giá nào', en: 'No quotes yet' },
  dash_send_quote_now: { vi: 'Gửi báo giá ngay →', en: 'Send quote now →' },
  dash_helper_role_label: { vi: 'Đối tác Thợ / Người giúp việc', en: 'Partner Helper / Worker' },
  dash_kyc_pending: { vi: 'Hồ sơ e-KYC đang được xét duyệt', en: 'e-KYC profile under review' },
  dash_kyc_required: {
    vi: 'Yêu cầu xác thực e-KYC để nhận việc',
    en: 'e-KYC required to accept jobs',
  },
  dash_kyc_pending_desc: {
    vi: 'Admin đang kiểm tra CCCD. Bạn sẽ có thể nhận việc ngay khi được duyệt.',
    en: 'Admin is verifying ID. You can accept jobs as soon as approved.',
  },
  dash_kyc_required_desc: {
    vi: 'Vui lòng chụp CCCD để mở khóa tính năng nhận việc và gửi báo giá.',
    en: 'Please upload ID to unlock accepting jobs and sending quotes.',
  },
  dash_kyc_view: { vi: 'Xem →', en: 'View →' },
  dash_kyc_verify: { vi: 'Xác thực →', en: 'Verify →' },
  dash_sos_modal_title: { vi: 'YÊU CẦU CỨU HỘ SOS!', en: 'SOS RESCUE REQUEST!' },
  dash_sos_modal_sub: {
    vi: 'Có mặt khẩn cấp sau 15 - 20 phút',
    en: 'Urgent arrival in 15 - 20 minutes',
  },
  dash_sos_modal_min_payout: {
    vi: 'Thu nhập tối thiểu nhận về ví:',
    en: 'Minimum wallet net payout:',
  },
  dash_sos_modal_breakdown: {
    vi: '(Bao gồm công cơ bản 200.000₫ + Phụ phí khẩn cấp 100.000₫ - phí sàn 15%)',
    en: '(Includes base 200,000₫ + Emergency bonus 100,000₫ - 15% platform fee)',
  },
  dash_sos_modal_matching: { vi: 'ĐANG KHỚP ĐƠN...', en: 'MATCHING JOB...' },
  dash_sos_modal_accept: { vi: ' NHẬN CỨU HỘ SOS NGAY', en: ' ACCEPT SOS RESCUE NOW' },

  // ─── Customer Home (Điểm 2) ────────────────────────────────────────────────
  home_greeting_night: { vi: 'Chào {name}, khuya rồi', en: 'Hello {name}, it is late' },
  home_greeting_night_sub: { vi: 'Cần giúp việc gì trong đêm?', en: 'Need any help tonight?' },
  home_greeting_morning: { vi: 'Chào {name}, buổi sáng', en: 'Good morning {name}' },
  home_greeting_morning_sub: {
    vi: 'Hôm nay bạn cần hỗ trợ việc gì?',
    en: 'What do you need help with today?',
  },
  home_greeting_afternoon: { vi: 'Chào {name}, buổi chiều', en: 'Good afternoon {name}' },
  home_greeting_afternoon_sub: {
    vi: 'Chiều nay nhà mình cần việc gì?',
    en: 'What do you need done this afternoon?',
  },
  home_greeting_evening: { vi: 'Chào {name}, buổi tối', en: 'Good evening {name}' },
  home_greeting_evening_sub: {
    vi: 'Tối nay cần hỗ trợ việc gì?',
    en: 'What do you need help with this evening?',
  },
  home_live_badge: { vi: 'Trực tiếp', en: 'Live' },
  home_no_helpers_online: {
    vi: 'Hiện chưa có thợ online gần bạn',
    en: 'No online helpers near you yet',
  },
  home_no_helpers_online_sub: {
    vi: 'Bạn vẫn có thể đăng việc hoặc đặt lịch hẹn, thợ trong khu vực sẽ nhận việc sớm nhất.',
    en: 'You can still post a job or schedule an appointment, local helpers will accept it soon.',
  },
  home_no_location_helpers: {
    vi: 'Chưa có vị trí để tìm thợ lân cận',
    en: 'No location to find nearby helpers',
  },
  home_no_location_helpers_sub: {
    vi: 'Vui lòng bấm lấy vị trí GPS hoặc chọn khu vực để kết nối thợ xung quanh.',
    en: 'Please enable GPS or pick an area to connect with nearby helpers.',
  },
  home_map_you_are_here: { vi: 'Bạn ở đây', en: 'You are here' },
  home_map_no_key: { vi: 'Chưa cấu hình khoá bản đồ Goong.', en: 'Goong Map key not configured.' },
  home_map_error: { vi: 'Không tải được bản đồ Goong.', en: 'Failed to load Goong Map.' },
  home_map_retry: { vi: 'Thử lại', en: 'Retry' },
  home_ai_scan_badge: { vi: 'AI QUÉT ẢNH SỰ CỐ', en: 'AI ISSUE PHOTO SCAN' },
  home_ai_scan_title: {
    vi: 'Chụp ảnh sự cố, AI đoán việc',
    en: 'Snap the issue, AI diagnoses the job',
  },
  home_ai_scan_desc: {
    vi: 'Máy lạnh chảy nước, vòi rò, tường nứt… chỉ cần một tấm ảnh, không cần biết tên dịch vụ.',
    en: 'Leaking AC, dripping pipe, cracked wall… just one photo, no need to know the service name.',
  },
  home_ai_scan_step1: { vi: '1 · Chụp ảnh', en: '1 · Take photo' },
  home_ai_scan_step2: { vi: '2 · AI phân tích', en: '2 · AI analyze' },
  home_ai_scan_step3: { vi: '3 · Nhận báo giá', en: '3 · Get quotes' },
  home_ai_scan_btn: { vi: 'Chụp ảnh ngay', en: 'Snap photo now' },
  home_ai_scan_pick: { vi: 'hoặc chọn ảnh sự cố của bạn', en: 'or choose your issue photo' },
  home_location_unidentified: { vi: 'Chưa xác định vị trí của bạn', en: 'Location not identified' },
  home_location_unidentified_sub: {
    vi: 'Bật định vị GPS hoặc chọn khu vực để tìm thợ lành nghề gần bạn nhất.',
    en: 'Turn on GPS or pick an area to find skilled helpers near you.',
  },
  home_no_location_tap: { vi: 'Chưa định vị — Bấm lấy vị trí', en: 'No location — Tap to locate' },
  home_locating: { vi: 'Đang lấy vị trí...', en: 'Getting location...' },
  home_get_location_btn: { vi: 'Bấm lấy vị trí', en: 'Get current location' },
  home_select_manual: { vi: 'Chọn thủ công', en: 'Choose manually' },
  home_helper_fallback: { vi: 'Thợ chuyên nghiệp', en: 'Professional helper' },
  home_eta_min: { vi: 'tới trong ~{min} phút', en: 'arrives in ~{min} mins' },
  home_book_helper_btn: { vi: 'Đặt thợ →', en: 'Book helper →' },
  voucher_special_badge: { vi: 'ƯU ĐÃI ĐẶC BIỆT', en: 'SPECIAL OFFER' },

  // ─── Voucher & Time (Điểm 5) ───────────────────────────────────────────────
  voucher_copy: { vi: 'Sao chép', en: 'Copy' },
  voucher_copied: { vi: 'Đã chép', en: 'Copied' },
  voucher_title: { vi: 'Voucher của bạn', en: 'Your Vouchers' },
  voucher_empty_title: { vi: 'Chưa có voucher nào', en: 'No vouchers yet' },
  voucher_empty_sub: {
    vi: 'Các mã ưu đãi sẽ xuất hiện tại đây khi có chương trình khuyến mãi.',
    en: 'Discount codes will appear here when promotions are available.',
  },
  voucher_copy_toast_title: { vi: 'Đã sao chép mã "{code}"', en: 'Copied code "{code}"' },
  voucher_copy_toast_sub: {
    vi: 'Dán mã vào ô Voucher khi tạo hoặc thanh toán đơn hàng.',
    en: 'Paste code into Voucher field when creating or paying for jobs.',
  },

  // ─── Helper Jobs & Badges ──────────────────────────────────────────────────
  jobs_badge_private_for_you: { vi: ' Gửi riêng cho bạn', en: ' Private offer for you' },
  jobs_badge_fixed_price: { vi: ' Giá cam kết {price}₫', en: ' Fixed price {price}₫' },
  jobs_unspecified: { vi: 'Chưa rõ', en: 'Unspecified' },
  jobs_minutes_unit: { vi: 'phút', en: 'mins' },
  jobs_verify_now: { vi: 'Xác thực ngay', en: 'Verify now' },
  jobs_outside_hours_title: {
    vi: 'Không có việc trong khung giờ làm',
    en: 'No jobs during your working hours',
  },
  jobs_outside_hours_sub: {
    vi: 'Hiện có việc mới nhưng ngoài khung giờ hoạt động bạn đã đăng ký. Bạn có thể cập nhật Lịch làm việc trong Hồ sơ để nhận thêm đơn.',
    en: 'New jobs are available but outside your registered hours. Update your Work Schedule in Profile to receive them.',
  },
  jobs_customer_cancelled: { vi: 'Đã hủy yêu cầu', en: 'Request cancelled' },

  // ─── Common Actions & Units ────────────────────────────────────────────────
  common_hours: { vi: 'giờ', en: 'hours' },
  common_photos: { vi: 'ảnh', en: 'photos' },
  common_helper: { vi: 'thợ', en: 'helper' },
  common_helpers_plural: { vi: 'thợ', en: 'helpers' },

  // ─── Điểm 1: Helper Profile ────────────────────────────────────────────────
  'helper_profile.completed_jobs': { vi: 'Đơn hoàn tất', en: 'Completed jobs' },
  'helper_profile.reputation_points': { vi: 'Điểm uy tín', en: 'Reputation score' },
  'helper_profile.acceptance_rate': { vi: 'Nhận việc', en: 'Accept jobs' },
  'helper_profile.receiving_status': { vi: 'Trạng thái nhận đơn', en: 'Job receiving status' },
  'helper_profile.status_busy_working': {
    vi: ' Đang bận làm việc (Cuốc đang chạy)',
    en: ' Busy working (Ongoing job)',
  },
  'helper_profile.status_online': { vi: ' Đang nhận đơn mới', en: ' Accepting new jobs' },
  'helper_profile.status_offline': {
    vi: ' Ngoại tuyến (Đã tắt nhận đơn)',
    en: ' Offline (Job receiving off)',
  },
  'helper_profile.loading_status': { vi: 'Đang tải trạng thái...', en: 'Loading status...' },
  'helper_profile.kyc_title': {
    vi: 'Xác minh danh tính Thợ (e-KYC)',
    en: 'Helper identity verification (e-KYC)',
  },
  'helper_profile.no_reviews_yet': {
    vi: 'Chưa có dữ liệu đánh giá từ khách hàng',
    en: 'No customer reviews yet',
  },
  'helper_profile.footer_version': {
    vi: 'Green House Đối Tác v1.0.0 • Verified Ecosystem',
    en: 'Green House Partner v1.0.0 • Verified Ecosystem',
  },
  'helper_profile.logout_title': {
    vi: 'Đăng xuất khỏi Green House?',
    en: 'Log out of Green House?',
  },
  'helper_profile.logout_msg': {
    vi: 'Bạn có chắc chắn muốn đăng xuất tài khoản Thợ? Dữ liệu công việc và số dư ví của bạn luôn được bảo lưu an toàn.',
    en: 'Are you sure you want to log out of your Helper account? Your job history and wallet balance remain safe.',
  },
  'helper_profile.stay': { vi: 'Ở lại', en: 'Stay' },
  'helper_profile.logout_now': { vi: 'Đăng xuất ngay', en: 'Log out now' },
  'helper_profile.job_in_progress_title': {
    vi: 'Đang có công việc diễn ra',
    en: 'Job in progress',
  },
  'helper_profile.job_in_progress_msg': {
    vi: 'Bạn đang có đơn công việc đang thực hiện. Hãy hoàn thành hoặc kết thúc công việc trước khi tắt nhận việc nhé!',
    en: 'You have an ongoing job. Please complete or finish the job before turning off job reception!',
  },
  'helper_profile.i_understand': { vi: 'Đã hiểu', en: 'Understood' },
  'helper_profile.kyc_required_title': {
    vi: 'Yêu cầu xác minh danh tính e-KYC',
    en: 'e-KYC identity verification required',
  },
  'helper_profile.kyc_required_msg': {
    vi: 'Vui lòng hoàn tất xác thực e-KYC trước khi bật chế độ nhận việc.',
    en: 'Please complete e-KYC verification before turning on job reception.',
  },
  'helper_profile.later': { vi: 'Để sau', en: 'Later' },
  'helper_profile.verify_now': { vi: 'Xác thực ngay', en: 'Verify now' },
  'helper_profile.toast_online_title': {
    vi: 'Đã bật nhận đơn mới',
    en: 'Receiving new jobs enabled',
  },
  'helper_profile.toast_offline_title': {
    vi: 'Đã chuyển sang ngoại tuyến',
    en: 'Switched to offline',
  },
  'helper_profile.toast_online_sub': {
    vi: 'Bạn sẽ nhận được thông báo khi có khách hàng đặt dịch vụ gần bạn',
    en: 'You will receive notifications when customers book nearby services',
  },
  'helper_profile.toast_offline_sub': {
    vi: 'Hệ thống đã tạm dừng nhận việc cho bạn',
    en: 'System paused receiving jobs for you',
  },
  kyc_status_loading: { vi: 'Đang tải trạng thái...', en: 'Loading status...' },
  kyc_status_unsubmitted: { vi: 'Chưa xác minh', en: 'Unverified' },
  kyc_status_pending: { vi: 'Chờ duyệt hồ sơ', en: 'Pending approval' },
  kyc_status_approved: { vi: 'Đã xác thực e-KYC ✓', en: 'e-KYC verified ✓' },
  kyc_status_rejected: { vi: 'Hồ sơ bị từ chối', en: 'Application rejected' },

  // ─── Điểm 2: Booking Wizard 5 bước ─────────────────────────────────────────
  booking_fixed_price_sub: {
    vi: 'nhận việc ngay, không cần báo giá',
    en: 'instant match, no bidding needed',
  },
  booking_step_address_title: { vi: 'Địa chỉ làm việc', en: 'Work address' },
  booking_step_schedule_title: { vi: 'Chọn lịch hẹn', en: 'Select schedule' },
  booking_start_time_title: { vi: 'Thời gian bắt đầu làm việc', en: 'Work start time' },
  booking_tap_to_open_calendar: {
    vi: 'Bấm để mở lịch tháng trong bottom sheet',
    en: 'Tap to open monthly calendar sheet',
  },
  booking_address_notes_guide: {
    vi: 'Ghi chú hướng dẫn cho thợ (tùy chọn)',
    en: 'Guide notes for helper (optional)',
  },
  booking_toast_camera_perm: {
    vi: 'Cần quyền truy cập camera để chụp ảnh hiện trạng',
    en: 'Camera permission required to take issue photos',
  },
  booking_toast_camera_error: { vi: 'Không thể mở máy ảnh', en: 'Unable to open camera' },
  booking_toast_gallery_perm: {
    vi: 'Cần quyền truy cập thư viện ảnh',
    en: 'Photo library permission required',
  },
  booking_toast_gallery_error: {
    vi: 'Không thể chọn ảnh từ thư viện',
    en: 'Unable to select photo from library',
  },
  booking_ai_photo_failed_title: {
    vi: 'Chưa phân tích được ảnh',
    en: 'Photo analysis unsuccessful',
  },
  booking_ai_photo_failed_desc: {
    vi: 'Ảnh vẫn được đính kèm vào đơn, bạn tự mô tả giúp mình nhé',
    en: 'Photo is still attached, please write description manually',
  },
  booking_ai_photo_no_select_title: { vi: 'Chưa chọn ảnh', en: 'No photo selected' },
  booking_ai_photo_no_select_desc: {
    vi: 'Vui lòng chọn ảnh chụp sự cố để AI phân tích',
    en: 'Please select an issue photo for AI to analyze',
  },
  booking_ai_photo_path_error: { vi: 'Không tìm thấy đường dẫn ảnh', en: 'Photo path not found' },
  booking_ai_photo_read_error: {
    vi: 'Không thể đọc dữ liệu ảnh để phân tích AI',
    en: 'Unable to read photo data for AI analysis',
  },
  booking_toast_map_selected: {
    vi: 'Đã chọn địa điểm từ bản đồ',
    en: 'Selected location from map',
  },
  booking_ai_suggest_desc: {
    vi: 'AI đề xuất dịch vụ "{newSvc}" (hiện đang chọn "{currentSvc}"). Bạn có muốn chuyển sang dịch vụ này không?',
    en: 'AI suggested service "{newSvc}" (currently "{currentSvc}"). Do you want to switch to this service?',
  },
  booking_ai_suggest_change_title: { vi: 'AI gợi ý đổi dịch vụ', en: 'AI suggests service change' },
  booking_ai_suggest_change_desc: {
    vi: 'AI nhận diện ảnh phù hợp với "{newSvc}" (hiện đang chọn "{oldSvc}"). Bạn có muốn chuyển sang dịch vụ này không?',
    en: 'AI identified photo matches "{newSvc}" (currently "{oldSvc}"). Do you want to switch to this service?',
  },
  booking_keep_current_svc: { vi: 'Giữ dịch vụ hiện tại', en: 'Keep current service' },
  booking_change_to_svc: { vi: 'Đổi sang {name}', en: 'Switch to {name}' },
  booking_ai_service_tip_title: { vi: 'Gợi ý dịch vụ từ AI', en: 'AI Service Suggestion' },
  booking_ai_service_tip_desc: {
    vi: 'AI đề xuất dịch vụ "{name}". Do danh mục chuẩn chưa có dịch vụ này, hệ thống đã chuyển sang "Dịch vụ theo yêu cầu" và điền sẵn tên dịch vụ cho bạn.',
    en: 'AI suggested "{name}". As this is not in standard catalog, system switched to "Custom Service" and prefilled it for you.',
  },
  booking_ai_photo_success_title: {
    vi: 'AI đã nhận diện sự cố trong ảnh!',
    en: 'AI diagnosed the issue in your photo!',
  },
  booking_ai_photo_success_desc: {
    vi: 'Đã điền sẵn mô tả & gợi ý dịch vụ cho bạn',
    en: 'Prefilled description & suggested service for you',
  },
  booking_gps_located_title: {
    vi: 'Đã định vị vị trí của bạn',
    en: 'Your location was determined',
  },
  booking_gps_auto_fail_title: { vi: 'Không thể định vị tự động', en: 'Automatic location failed' },
  booking_gps_auto_fail_desc: {
    vi: 'Vui lòng kiểm tra GPS hoặc nhập tay địa chỉ của bạn bên dưới.',
    en: 'Please check GPS or enter your address manually below.',
  },
  booking_gps_fail_title: {
    vi: 'Không thể lấy vị trí hiện tại',
    en: 'Unable to get current location',
  },
  booking_gps_fail_desc: {
    vi: 'Vui lòng nhập tay địa chỉ của bạn bên dưới.',
    en: 'Please enter your address manually below.',
  },
  booking_ai_desc_success_title: { vi: 'AI đã phân tích xong!', en: 'AI analysis complete!' },
  booking_ai_desc_success_desc: {
    vi: 'Đã tự động chọn dịch vụ & tạo chi tiết công việc',
    en: 'Automatically selected service & created job details',
  },
  booking_ai_desc_fail: {
    vi: 'Phân tích thất bại, vui lòng thử lại',
    en: 'Analysis failed, please try again',
  },
  booking_login_required_title: { vi: 'Yêu cầu đăng nhập', en: 'Login required' },
  booking_login_required_desc: {
    vi: 'Vui lòng đăng nhập hoặc tạo tài khoản để gửi đơn đặt thợ',
    en: 'Please log in or create an account to post a job',
  },
  booking_coords_unconfirmed_title: {
    vi: 'Chưa xác định được tọa độ chính xác',
    en: 'Exact coordinates not confirmed',
  },
  booking_coords_unconfirmed_desc: {
    vi: 'Vui lòng chọn từ gợi ý tìm kiếm hoặc bấm nút lấy vị trí GPS để ghim đúng điểm cho thợ.',
    en: 'Please pick from search suggestions or tap GPS button to pinpoint location for helper.',
  },
  booking_min_price_error: {
    vi: 'Giá mong muốn tối thiểu là 50.000₫',
    en: 'Minimum expected price is 50,000₫',
  },
  booking_default_title: { vi: 'Yêu cầu dịch vụ', en: 'Service request' },
  booking_create_failed: {
    vi: 'Đăng việc thất bại. Vui lòng thử lại',
    en: 'Job posting failed. Please try again',
  },
  booking_select_service_error: {
    vi: 'Vui lòng chọn 1 dịch vụ cần làm',
    en: 'Please select a service',
  },
  booking_enter_service_name_error: {
    vi: 'Vui lòng nhập tên công việc bạn cần làm',
    en: 'Please enter job name needed',
  },
  booking_ai_desc_title: { vi: 'Mô tả để AI hỗ trợ', en: 'Describe for AI assistant' },
  booking_ai_analyze_btn: { vi: 'Phân tích với AI', en: 'Analyze with AI' },
  booking_ai_done: { vi: 'Đã phân tích xong', en: 'Analysis completed' },
  booking_ai_est_duration: { vi: 'Ước tính: {hours}h', en: 'Estimated: {hours}h' },
  booking_ai_tasks_needed: { vi: 'Hạng mục cần làm:', en: 'Tasks to perform:' },
  booking_ai_est_price: { vi: 'Ước giá thị trường:', en: 'Estimated market price:' },
  booking_or_choose_below: { vi: 'Hoặc chọn dịch vụ bên dưới:', en: 'Or choose service below:' },
  booking_loading_services: {
    vi: 'Đang tải danh sách dịch vụ...',
    en: 'Loading service catalog...',
  },
  booking_other_service_title: {
    vi: 'Dịch vụ khác — tự ghi việc, tự set giá',
    en: 'Other — custom task & custom price',
  },
  booking_new_badge: { vi: 'MỚI', en: 'NEW' },
  booking_other_service_desc: {
    vi: 'Việc gì cũng đăng được · bạn tự mô tả công việc và đặt giá mong muốn',
    en: 'Post any task · describe what you need and set expected price',
  },
  booking_other_service_sub: {
    vi: 'Deal giá trực tiếp với thợ',
    en: 'Negotiate price directly with helpers',
  },
  booking_other_service_name_label: {
    vi: 'Tên công việc / dịch vụ bạn cần *',
    en: 'Job / service name you need *',
  },
  booking_other_service_price_label: {
    vi: 'Giá bạn muốn trả (giá mở đầu để deal) *',
    en: 'Price you want to pay (starting deal price) *',
  },
  booking_no_location_found: {
    vi: 'Không tìm thấy địa điểm phù hợp. Vui lòng thử từ khóa khác hoặc nhập trực tiếp vào các ô bên dưới.',
    en: 'No matching location found. Please try other keywords or enter directly below.',
  },
  booking_get_gps: {
    vi: 'Lấy vị trí GPS hiện tại (Goong Maps)',
    en: 'Get current GPS location (Goong Maps)',
  },
  booking_locating_gps: { vi: 'Đang định vị vị trí...', en: 'Locating current position...' },
  booking_search_map_title: { vi: 'Tìm kiếm địa điểm trên bản đồ', en: 'Search location on map' },
  booking_search_address_placeholder: {
    vi: 'Gõ tên đường, tòa nhà, chung cư...',
    en: 'Enter street, building, apartment name...',
  },
  booking_detail_address_label: {
    vi: 'Địa chỉ chi tiết (Số nhà & tên đường) *',
    en: 'Detailed address (House number & street name) *',
  },
  booking_ward_label: { vi: 'Phường/Xã', en: 'Ward' },
  booking_district_label: { vi: 'Quận/Huyện', en: 'District' },
  booking_city_label: { vi: 'Thành phố', en: 'City' },
  booking_address_validation_error: {
    vi: 'Vui lòng nhập đầy đủ địa chỉ làm việc (Địa chỉ, Phường, Quận/Huyện hoặc Thành phố)',
    en: 'Please enter full work address (Address, Ward, District or City)',
  },
  booking_time_validation_error: {
    vi: 'Vui lòng chọn ngày và giờ bắt đầu làm việc',
    en: 'Please select work start date and time',
  },
  booking_time_past_error: {
    vi: 'Thời gian bắt đầu không được ở trong quá khứ',
    en: 'Start time cannot be in the past',
  },
  booking_invalid_date_error: {
    vi: 'Ngày đã chọn không hợp lệ, vui lòng chọn lại ngày',
    en: 'Selected date is invalid, please pick another date',
  },
  booking_time_window_error: {
    vi: 'Giờ làm việc từ 07:00 đến 22:00, vui lòng chọn giờ trong khung này',
    en: 'Working hours are 07:00–22:00, please pick a time in this range',
  },
  booking_midnight_cross_error: {
    vi: 'Giờ kết thúc vượt quá 24:00, vui lòng chọn giờ sớm hơn hoặc rút ngắn thời lượng',
    en: 'End time crosses midnight, please pick an earlier start or shorten the duration',
  },
  booking_title_desc_required: {
    vi: 'Vui lòng điền tiêu đề và mô tả công việc',
    en: 'Please enter job title and description',
  },
  chip_today: { vi: 'Hôm nay', en: 'Today' },
  chip_tomorrow: { vi: 'Ngày mai', en: 'Tomorrow' },
  chip_saturday: { vi: 'Thứ 7', en: 'Saturday' },
  chip_sunday: { vi: 'Chủ nhật', en: 'Sunday' },
  booking_step_details_title: { vi: 'Chi tiết công việc', en: 'Job details' },
  booking_photos_attached: {
    vi: 'Đã đính kèm {count} ảnh sự cố',
    en: '{count} issue photos attached',
  },
  booking_photos_attached_hint: {
    vi: 'Bấm nút màu xanh "Phân tích ảnh sự cố bằng AI" bên dưới để hệ thống nhận diện và điền mô tả ngay!',
    en: 'Tap the green button "AI Photo Diagnosis" below to auto-fill description!',
  },
  booking_title_label: { vi: 'Tiêu đề yêu cầu *', en: 'Request title *' },
  booking_description_label: { vi: 'Mô tả chi tiết *', en: 'Detailed description *' },
  booking_photos_label: {
    vi: ' Ảnh hiện trạng công việc ({count}/6)',
    en: ' Issue photos ({count}/6)',
  },
  booking_optional: { vi: 'Không bắt buộc', en: 'Optional' },
  booking_take_photo: { vi: 'Chụp ảnh', en: 'Take photo' },
  booking_pick_gallery: { vi: 'Chọn từ thư viện', en: 'Choose from library' },
  booking_ai_analyzing_photo: { vi: 'AI đang phân tích ảnh...', en: 'AI is analyzing photo...' },
  booking_ai_analyze_photo: { vi: 'Phân tích ảnh sự cố bằng AI', en: 'AI Photo Diagnosis' },
  booking_ai_detected_title: { vi: ' AI nhận diện sự cố', en: ' AI Issue Detection' },
  booking_ai_issue_label: { vi: 'Vấn đề phát hiện:', en: 'Detected issue:' },
  booking_ai_price_range: { vi: 'Khoảng giá:', en: 'Price range:' },
  booking_ai_confidence: { vi: 'độ tin cậy', en: 'confidence' },
  booking_ai_desc_hint: {
    vi: 'Mô tả đã được điền sẵn từ ảnh — bạn có thể sửa lại trước khi gửi đơn.',
    en: 'Description prefilled from photo — you can edit before submitting.',
  },
  booking_ai_estimating: { vi: 'Đang ước tính giá...', en: 'Estimating price...' },
  booking_ai_estimate_market: { vi: 'AI ước tính giá thị trường', en: 'AI Market Price Estimate' },
  booking_ai_estimate_title: { vi: 'Ước tính giá (AI)', en: 'Price Estimate (AI)' },
  booking_ai_market_note: {
    vi: 'Giá thực tế do thợ tự do báo giá cụ thể',
    en: 'Actual price quoted by helpers',
  },
  booking_address_unknown: { vi: 'Chưa rõ địa chỉ', en: 'Address unspecified' },
  booking_address_notes_label: { vi: 'Ghi chú địa chỉ', en: 'Address notes' },
  booking_date_label: { vi: 'Ngày', en: 'Date' },
  booking_time_label: { vi: 'Giờ', en: 'Time' },
  booking_attached_photos_label: { vi: 'Hình ảnh đính kèm', en: 'Attached photos' },
  booking_fixed_price_desc: {
    vi: 'Dịch vụ này có giá cố định do Green House cam kết. Thợ sẽ nhận việc trực tiếp với đúng mức giá trên — bạn không cần chờ đợi hay so sánh báo giá. Cứ đăng yêu cầu như bình thường!',
    en: 'This service has a fixed price guaranteed by Green House. Helpers accept directly at this price — no bidding or waiting needed!',
  },
  booking_quote_tip_fixed: {
    vi: 'Đơn giá cam kết sẽ được gửi tới các thợ quanh bạn — thợ đầu tiên nhận việc sẽ thực hiện với giá đã cam kết.',
    en: 'Guaranteed price job will be sent to nearby helpers — first helper to accept will perform it.',
  },
  booking_quote_tip_regular: {
    vi: 'Sau khi đăng, các thợ xung quanh sẽ gửi báo giá. Bạn có thể tự do so sánh tay nghề & giá cả trước khi chọn thợ.',
    en: 'After posting, nearby helpers will quote. Compare skill & prices before choosing.',
  },
  booking_send_private_to: { vi: 'Gửi riêng cho {name}', en: 'Send privately to {name}' },
  booking_private_offer_desc: {
    vi: 'Đơn chỉ hiển thị với thợ này trong 24 giờ đầu. Hết thời gian chờ, đơn sẽ mở công khai cho mọi thợ nếu thợ chưa báo giá.',
    en: 'Job only visible to this helper for the first 24 hours. After that, it opens publicly if unquoted.',
  },
  booking_helpers_needed_title: { vi: 'Số thợ thực hiện', en: 'Number of helpers' },
  booking_helpers_needed_desc: {
    vi: 'Việc lớn cần nhiều người? Chọn 2–4 thợ — thợ chính sẽ lập nhóm và chia tiền công minh bạch theo tỉ lệ.',
    en: 'Big task needing a team? Pick 2–4 helpers — the lead helper forms a team and splits pay transparently.',
  },
  booking_set_recurring: { vi: 'Đặt thành gói định kỳ', en: 'Set as recurring plan' },
  booking_recurring_desc: {
    vi: 'Hệ thống tự tạo đơn theo lịch lặp — bạn không cần đăng lại mỗi lần.',
    en: 'System automatically creates recurring jobs — no need to re-post every time.',
  },
  booking_weekly: { vi: 'Hàng tuần', en: 'Weekly' },
  booking_monthly: { vi: 'Hàng tháng', en: 'Monthly' },
  booking_on_day: { vi: 'Vào ngày', en: 'On day' },
  booking_every_month: { vi: 'hàng tháng', en: 'every month' },
  booking_recurring_preview: {
    vi: 'Buổi đầu tiên: {date} lúc {time} ({duration} giờ). Quản lý, tạm dừng hoặc bỏ qua từng buổi trong mục "Gói định kỳ của tôi".',
    en: 'First session: {date} at {time} ({duration} hrs). Manage, pause or skip sessions in "My Recurring Plans".',
  },

  // ─── Điểm 6: Loyalty & Điểm thưởng ─────────────────────────────────────────
  profile_loyalty_redeem_desc: {
    vi: 'Đổi điểm giảm tối đa {cap}% giá trị đơn · Xem lịch sử & quyền lợi →',
    en: 'Redeem points up to {cap}% off order · View history & benefits →',
  },
  'loyalty.title': { vi: 'Tích điểm & Hạng thành viên', en: 'Loyalty Points & Tiers' },
  'loyalty.tier_label_prefix': { vi: 'Hạng {tier}', en: 'Tier {tier}' },
  'loyalty.points_unit': { vi: 'điểm', en: 'points' },
  'loyalty.lifetime_summary': {
    vi: 'Tổng điểm đã tích lũy: {lifetime} điểm · 1 điểm = {value}₫ khi đổi',
    en: 'Total lifetime points: {lifetime} pts · 1 pt = {value}₫ on redemption',
  },
  'loyalty.points_to_next': {
    vi: 'Còn {points} điểm nữa để lên hạng tiếp theo ({next} điểm)',
    en: '{points} more points to reach next tier ({next} pts)',
  },
  'loyalty.highest_tier': {
    vi: ' Bạn đang ở hạng cao nhất!',
    en: ' You are at the highest tier!',
  },
  'loyalty.perks_title': { vi: 'Quyền lợi theo hạng', en: 'Tier Benefits' },
  'loyalty.perks_body': {
    vi: '• Tích điểm: 1 điểm / {earn}₫ đã thanh toán\n• Hạng Thường (dưới 500 điểm): đổi tối đa 20% giá trị đơn\n• Hạng Bạc (500–1.999 điểm): đổi tối đa 30% giá trị đơn\n• Hạng Vàng (từ 2.000 điểm): đổi tối đa 50% giá trị đơn\n• Đổi tối thiểu {min} điểm/lần, áp dụng trong chi tiết đơn khi đã có giá chốt.',
    en: '• Earn: 1 point / {earn}₫ paid\n• Standard Tier (under 500 pts): redeem up to 20% off order\n• Silver Tier (500–1,999 pts): redeem up to 30% off order\n• Gold Tier (from 2,000 pts): redeem up to 50% off order\n• Min redeem {min} pts/time, applied in job details once price is fixed.',
  },
  'loyalty.current_cap': {
    vi: 'Hạng hiện tại của bạn được đổi tối đa {cap}% giá trị đơn.',
    en: 'Your current tier allows up to {cap}% order discount.',
  },
  'loyalty.history_title': { vi: 'Lịch sử điểm', en: 'Points History' },
  'loyalty.empty_title': { vi: 'Chưa có biến động điểm', en: 'No points transactions yet' },
  'loyalty.empty_desc': {
    vi: 'Hoàn thành đơn và thanh toán để bắt đầu tích điểm',
    en: 'Complete jobs and pay to start earning points',
  },
  'loyalty.balance_after': { vi: 'Số dư sau: {balance} điểm', en: 'Balance after: {balance} pts' },
  'loyalty.tx_earn': { vi: 'Tích điểm từ đơn', en: 'Earned from job' },
  'loyalty.tx_redeem': { vi: 'Đổi điểm giảm giá đơn', en: 'Redeemed for job discount' },
  'loyalty.tx_reversal': { vi: 'Hoàn điểm do hủy đơn', en: 'Points refunded due to cancellation' },
  'loyalty.tx_adjust': { vi: 'Điều chỉnh bởi quản trị viên', en: 'Adjusted by admin' },
  loyalty_title: { vi: 'Điểm thành viên', en: 'Loyalty Points' },
  loyalty_tier_name: { vi: 'Hạng {tier}', en: 'Tier {tier}' },
  loyalty_points_unit: { vi: 'điểm', en: 'pts' },
  loyalty_lifetime_summary: {
    vi: 'Tổng điểm đã tích lũy: {lifetime} điểm · 1 điểm = {value}₫ khi đổi',
    en: 'Lifetime points: {lifetime} pts · 1 pt = {value}₫ when redeemed',
  },
  loyalty_next_tier_hint: {
    vi: 'Còn {points} điểm nữa để lên hạng tiếp theo ({target} điểm)',
    en: '{points} more pts to reach next tier ({target} pts)',
  },
  loyalty_max_tier: {
    vi: ' Bạn đang ở hạng cao nhất!',
    en: ' You have reached the highest tier!',
  },
  loyalty_perks_title: { vi: 'Quyền lợi theo hạng', en: 'Tier Benefits' },
  loyalty_perks_body: {
    vi: '• Tích điểm: 1 điểm / {earn}₫ đã thanh toán\n• Hạng Thường (dưới 500 điểm): đổi tối đa 20% giá trị đơn\n• Hạng Bạc (500–1.999 điểm): đổi tối đa 30% giá trị đơn\n• Hạng Vàng (từ 2.000 điểm): đổi tối đa 50% giá trị đơn\n• Đổi tối thiểu {min} điểm/lần, áp dụng trong chi tiết đơn khi đã có giá chốt.',
    en: '• Earn points: 1 pt / {earn}₫ paid\n• Standard tier (under 500 pts): redeem up to 20% order value\n• Silver tier (500–1,999 pts): redeem up to 30% order value\n• Gold tier (from 2,000 pts): redeem up to 50% order value\n• Min redemption {min} pts/time, applicable in order detail when final price is fixed.',
  },
  loyalty_current_cap_desc: {
    vi: 'Hạng hiện tại của bạn được đổi tối đa {cap}% giá trị đơn.',
    en: 'Your current tier allows redeeming up to {cap}% of order value.',
  },
  loyalty_history_title: { vi: 'Lịch sử điểm', en: 'Point History' },
  loyalty_history_empty_title: { vi: 'Chưa có biến động điểm', en: 'No point activity yet' },
  loyalty_history_empty_sub: {
    vi: 'Hoàn thành đơn và thanh toán để bắt đầu tích điểm',
    en: 'Complete orders and pay to start earning points',
  },
  loyalty_tx_earn: { vi: 'Tích điểm', en: 'Earn points' },
  loyalty_tx_redeem: { vi: 'Đổi điểm', en: 'Redeem points' },
  loyalty_tx_adjust: { vi: 'Điều chỉnh', en: 'Adjustment' },
  loyalty_balance_after: {
    vi: '{time} · Số dư sau: {balance} điểm',
    en: '{time} · Balance after: {balance} pts',
  },
  'loyalty_input.apply_btn': { vi: 'Dùng điểm', en: 'Apply' },
  'loyalty_input.applied_summary': {
    vi: 'Đã dùng {points} điểm — giảm {discount}₫',
    en: 'Used {points} pts — discount {discount}₫',
  },
  'loyalty_input.payment_note': {
    vi: 'Điểm sẽ bị trừ khi bạn thanh toán. Cần thanh toán khoảng {amount}₫.',
    en: 'Points will be deducted at payment. Need to pay approx {amount}₫.',
  },
  'loyalty_input.remove_btn': { vi: 'Gỡ điểm', en: 'Remove points' },
  'loyalty_input.balance_summary': {
    vi: 'Điểm thành viên: {points} điểm',
    en: 'Loyalty balance: {points} pts',
  },
  'loyalty_input.min_notice': {
    vi: 'Cần tối thiểu {min} điểm để đổi. Tích điểm: 1 điểm / {earn}₫ đã thanh toán.',
    en: 'Min {min} pts needed to redeem. Earn: 1 pt / {earn}₫ paid.',
  },
  'loyalty_input.title': { vi: 'Dùng điểm thành viên', en: 'Use loyalty points' },
  'loyalty_input.summary_line': {
    vi: 'Bạn có {points} điểm · Hạng {tier} (đổi tối đa {cap}% giá trị đơn) · 1 điểm = {value}₫',
    en: 'You have {points} pts · Tier {tier} (max {cap}% order discount) · 1 pt = {value}₫',
  },
  'loyalty_input.placeholder': { vi: 'Số điểm (tối thiểu {min})', en: 'Points amount (min {min})' },
  'loyalty_input.min_error': {
    vi: 'Vui lòng nhập ít nhất {min} điểm',
    en: 'Please enter at least {min} points',
  },
  'loyalty_input.generic_error': { vi: 'Không áp dụng được điểm', en: 'Could not apply points' },

  // ─── Điểm 7: Demand Map + Live Tracking + Helper Details + SOS Card ────────
  'demand_map.title': { vi: 'Bản đồ nhu cầu', en: 'Demand map' },
  'demand_map.total_summary': {
    vi: '{count} đơn đang chờ báo giá tại {areas} khu vực',
    en: '{count} jobs waiting for quotes across {areas} areas',
  },
  'demand_map.subtitle_empty': {
    vi: 'Khu vực nào đang cần thợ nhất lúc này',
    en: 'Which areas need helpers the most right now',
  },
  'demand_map.loading': {
    vi: 'Đang tải dữ liệu bản đồ nhu cầu...',
    en: 'Loading demand map data...',
  },
  'demand_map.no_jobs_title': { vi: 'Chưa có đơn nào đang mở', en: 'No open jobs right now' },
  'demand_map.no_jobs_desc': {
    vi: 'Hiện không có đơn chờ báo giá trong khu vực. Bản đồ đang hiển thị vị trí của bạn, đơn mới sẽ xuất hiện ngay khi có khách đăng việc.',
    en: 'No jobs waiting for quotes in this area right now. The map shows your position, new jobs will appear as soon as posted.',
  },
  'demand_map.jobs_waiting_quotes': { vi: 'đơn đang chờ báo giá', en: 'jobs waiting for quotes' },
  'demand_map.fixed_price_count': { vi: '{count} giá cam kết', en: '{count} guaranteed price' },
  'tracking.google_maps_directions': {
    vi: 'Chỉ đường bằng Google Maps',
    en: 'Directions with Google Maps',
  },
  'tracking.gps_note': {
    vi: 'GPS được chia sẻ khi Green House đang mở. Khi chuyển sang ứng dụng khác, cập nhật có thể tạm dừng.',
    en: 'GPS is shared while Green House is open. When switching apps, updates may pause.',
  },
  'tracking.arrived_helper': { vi: 'Đã tới điểm hẹn', en: 'Arrived at meeting location' },
  'tracking.arrived_customer': {
    vi: 'Thợ đã đến điểm hẹn',
    en: 'Helper has arrived at meeting location',
  },
  'tracking.heading_helper': { vi: 'Đang di chuyển đến khách', en: 'Heading to customer location' },
  'tracking.heading_customer': { vi: 'Đang di chuyển đến bạn', en: 'Helper is heading to you' },
  'tracking.in_progress': { vi: 'Đang thực hiện công việc', en: 'Work in progress' },
  'tracking.confirmed_prep': {
    vi: 'Đã nhận đơn — chuẩn bị đi',
    en: 'Job confirmed — preparing to head out',
  },
  'tracking.meeting_location': { vi: 'Vị trí điểm hẹn làm việc', en: 'Work meeting location' },
  'helper_job_detail.contract_amendments_title': {
    vi: 'Hợp đồng & Phụ lục chi phí',
    en: 'Contract & Cost Addendum',
  },
  'helper_job_detail.estimated_payout': {
    vi: 'Thực nhận dự kiến ({percent}%):',
    en: 'Estimated net payout ({percent}%):',
  },
  'helper_job_detail.propose_amendment_btn': {
    vi: ' Đề xuất phát sinh vật tư / chi phí',
    en: ' Propose additional materials / costs',
  },
  'helper_job_detail.update_progress_title': {
    vi: 'Cập nhật tiến trình làm việc',
    en: 'Update work progress',
  },
  'helper_job_detail.start_moving_btn': {
    vi: '  Bắt đầu di chuyển đến khách',
    en: '  Start heading to customer',
  },
  'helper_job_detail.i_arrived_btn': { vi: '  Tôi đã đến nơi', en: '  I have arrived' },
  'helper_job_detail.start_work_btn': { vi: '▶  Bắt đầu làm việc', en: '▶  Start work' },
  'helper_job_detail.complete_work_btn': {
    vi: '  Hoàn thành công việc',
    en: '  Complete work',
  },
  'sos_helper.replacement_title': {
    vi: ' Bạn đang thay thế đơn này qua SOS Backup',
    en: ' You are replacing this job via SOS Backup',
  },
  'sos_helper.replacement_desc': {
    vi: 'Thợ trước gặp sự cố nên khách hàng đã đồng ý đổi người. Hãy tiếp tục đơn như bình thường — tiền công giữ nguyên theo hợp đồng.',
    en: 'Previous helper had an issue so customer agreed to switch. Continue job normally — contract payout remains unchanged.',
  },
  'sos_helper.withdraw_title': { vi: 'Thu hồi yêu cầu SOS?', en: 'Withdraw SOS request?' },
  'sos_helper.withdraw_desc': {
    vi: 'Đơn sẽ tiếp tục với bạn như bình thường.',
    en: 'The job will continue with you normally.',
  },
  'sos_helper.withdraw_confirm': { vi: 'Thu hồi SOS', en: 'Withdraw SOS' },
  'sos_helper.awaiting_customer': {
    vi: ' Đang chờ khách xác nhận…',
    en: ' Awaiting customer confirmation…',
  },
  'sos_helper.finding_replacement': {
    vi: ' Đang tìm người thay thế…',
    en: ' Finding replacement helper…',
  },
  'sos_helper.awaiting_desc': {
    vi: 'Bạn đã gửi SOS (lý do: {reason}). Khách hàng cần đồng ý đổi người thì hệ thống mới tìm thợ thay thế.{deadline} Nếu khách không phản hồi, đơn sẽ tự hủy và hoàn tiền 100% theo chính sách.',
    en: 'You submitted SOS (reason: {reason}). Customer must agree to switch before system finds replacement.{deadline} If customer does not respond, job will auto-cancel and refund 100%.',
  },
  'sos_helper.deadline_text': {
    vi: ' Thời hạn khách quyết định còn {countdown}.',
    en: ' Customer decision window remaining {countdown}.',
  },
  'sos_helper.searching_desc': {
    vi: 'Khách hàng đã đồng ý đổi người. Hệ thống đang mời các thợ đang online gần đây — bạn vẫn phụ trách đơn cho tới khi có thợ nhận thay.',
    en: 'Customer agreed to switch. System is inviting nearby online helpers — you remain responsible until a helper accepts.',
  },
  'sos_helper.withdraw_btn': { vi: 'Thu hồi yêu cầu SOS', en: 'Withdraw SOS request' },
  'sos_helper.perm_gallery': {
    vi: 'Cần quyền truy cập thư viện ảnh',
    en: 'Photo library permission required',
  },
  'sos_helper.upload_fail_title': {
    vi: 'Tải ảnh minh chứng thất bại',
    en: 'Failed to upload proof photo',
  },
  'sos_helper.upload_fail_sub': {
    vi: 'Bạn có thể thử lại hoặc vẫn gửi SOS mà không kèm ảnh',
    en: 'You can retry or submit SOS without photo',
  },
  'sos_helper.upload_fail_alert_title': {
    vi: 'Không tải được ảnh minh chứng',
    en: 'Could not upload proof photo',
  },
  'sos_helper.upload_fail_alert_msg': {
    vi: 'Vẫn gửi yêu cầu SOS mà không kèm ảnh?',
    en: 'Submit SOS request without photos?',
  },
  'sos_helper.retry': { vi: 'Để tôi thử lại', en: 'Let me retry' },
  'sos_helper.submit_without_photo': { vi: 'Gửi không kèm ảnh', en: 'Submit without photo' },
  'sos_helper.penalty_exceeded_title': {
    vi: 'Bạn đã vượt ngưỡng hủy đơn tuần này',
    en: 'You exceeded weekly cancellation limit',
  },
  'sos_helper.penalty_exceeded_msg': {
    vi: 'Lần SOS này bị trừ {pts} điểm tin cậy. Điểm uy tín hiện tại: {total}/100',
    en: 'This SOS deducts {pts} reliability points. Current score: {total}/100',
  },
  'sos_helper.reputation_notice_title': { vi: 'Lưu ý điểm uy tín', en: 'Reputation score notice' },
  'sos_helper.reputation_notice_msg': {
    vi: 'Bạn đã hủy/SOS {count} đơn trong 7 ngày — hủy quá 3 đơn sẽ bị trừ điểm tin cậy',
    en: 'You cancelled/SOS {count} jobs in 7 days — over 3 will deduct reliability points',
  },
  'sos_helper.trigger_title': {
    vi: ' Gặp sự cố không thể tiếp tục đơn?',
    en: ' Encountered an issue and cannot continue?',
  },
  'sos_helper.trigger_desc': {
    vi: 'Gửi SOS để xin đổi người: khách hàng sẽ xác nhận đổi thợ khác (giữ nguyên giá) hoặc hủy đơn. Bạn không bị tính phạt trễ/hủy cho đơn này khi dùng SOS.',
    en: 'Submit SOS to request replacement: customer confirms switching helpers (price kept) or cancels. You will not receive late/cancel penalties for this job when using SOS.',
  },
  'sos_helper.trigger_reputation_warning': {
    vi: ' Điểm uy tín: bạn đã hủy/SOS {cancels} đơn trong 7 ngày qua{score}. Hủy quá 3 đơn/7 ngày sẽ bị trừ điểm tiêu chí Độ tin cậy.',
    en: ' Reputation: you cancelled/SOS {cancels} jobs in past 7 days{score}. Over 3 jobs/7 days will deduct Reliability score.',
  },
  'sos_helper.score_suffix': {
    vi: ' — điểm hiện tại {score}/100',
    en: ' — current score {score}/100',
  },
  'sos_helper.open_modal_btn': {
    vi: ' Gửi SOS — xin đổi người',
    en: ' Submit SOS — request replacement',
  },
  'sos_helper.modal_title': {
    vi: 'Lý do không thể tiếp tục đơn',
    en: 'Reason for being unable to continue',
  },
  'sos_helper.modal_subtitle': {
    vi: 'Chỉ lý do này được gửi cho khách hàng — ghi chú thêm (nếu có) chỉ đội hỗ trợ xem.',
    en: 'Only this reason is sent to customer — additional notes (if any) are viewed by support team only.',
  },
  'sos_helper.notes_placeholder': {
    vi: 'Ghi chú thêm (không bắt buộc)',
    en: 'Additional notes (optional)',
  },
  'sos_helper.photos_label': {
    vi: 'Thêm ảnh minh chứng (không bắt buộc)',
    en: 'Attach proof photos (optional)',
  },
  'sos_helper.photos_hint': {
    vi: 'VD: xe hư, tai nạn — khách hàng sẽ thấy các ảnh này khi quyết định đổi người hay hủy đơn. Tối đa 4 ảnh.',
    en: 'E.g., broken vehicle, accident — customer sees these photos when deciding. Max 4 photos.',
  },
  'sos_helper.add_photo': { vi: 'Thêm ảnh', en: 'Add photo' },
  'sos_helper.uploading': { vi: 'Đang tải ảnh lên…', en: 'Uploading photos…' },
  'sos_helper.submit_btn': { vi: 'Gửi yêu cầu SOS', en: 'Submit SOS Request' },
  'helper_job.kyc_required_title': {
    vi: 'Yêu cầu xác thực e-KYC',
    en: 'e-KYC Verification Required',
  },
  'helper_job.kyc_required_msg': {
    vi: 'Bạn cần hoàn tất và được duyệt xác thực danh tính e-KYC trước khi có thể gửi báo giá và nhận việc.',
    en: 'You must complete and get approved for e-KYC identity verification before bidding or accepting jobs.',
  },
  'helper_job.kyc_verify_now': { vi: 'Xác thực ngay', en: 'Verify now' },
  'helper_job.min_quote_toast': { vi: 'Báo giá tối thiểu 50,000₫', en: 'Minimum quote is 50,000₫' },
  'helper_job.quote_success_title': {
    vi: 'Gửi báo giá thành công!',
    en: 'Quote submitted successfully!',
  },
  'helper_job.quote_success_desc': {
    vi: 'Chờ khách hàng duyệt và chọn bạn',
    en: 'Waiting for customer review and selection',
  },
  'helper_job.quote_fail': {
    vi: 'Gửi báo giá thất bại. Vui lòng thử lại.',
    en: 'Quote submission failed. Please try again.',
  },
  'helper_job.accept_fail': {
    vi: 'Nhận việc thất bại. Vui lòng thử lại.',
    en: 'Job acceptance failed. Please try again.',
  },
  'helper_job.reject_title': { vi: 'Từ chối nhận đơn', en: 'Decline job offer' },
  'helper_job.reject_desc': {
    vi: 'Đơn này sẽ được ẩn khỏi danh sách việc mới và bản đồ của bạn. Bạn có chắc chắn muốn bỏ qua?',
    en: 'This job will be hidden from your new job list and map. Are you sure you want to pass?',
  },
  'helper_job.reject_confirm': { vi: 'Từ chối đơn', en: 'Decline job' },
  'helper_job.reject_success_title': { vi: 'Đã từ chối đơn', en: 'Job declined' },
  'helper_job.reject_success_desc': {
    vi: 'Đơn đã được ẩn khỏi danh sách của bạn.',
    en: 'Job has been hidden from your list.',
  },
  'helper_job.reject_fail': {
    vi: 'Từ chối thất bại. Vui lòng thử lại.',
    en: 'Decline failed. Please try again.',
  },
  'helper_job.amendment_amount_err': {
    vi: 'Vui lòng nhập số tiền công hoặc vật tư phát sinh lớn hơn 0₫',
    en: 'Please enter additional labor or materials amount greater than 0₫',
  },
  'helper_job.amendment_reason_err': {
    vi: 'Vui lòng nhập lý do phát sinh cụ thể để khách hàng duyệt',
    en: 'Please enter specific reason for customer approval',
  },
  'helper_job.amendment_submit_fail': {
    vi: 'Gửi đề xuất phụ lục thất bại',
    en: 'Failed to submit addendum proposal',
  },
  'helper_job.evidence_camera_perm': {
    vi: 'Cần quyền truy cập camera để chụp ảnh',
    en: 'Camera permission required to take photos',
  },
  'helper_job.evidence_camera_err': { vi: 'Không thể mở máy ảnh', en: 'Unable to open camera' },
  'helper_job.evidence_gallery_perm': {
    vi: 'Cần quyền truy cập thư viện để chọn ảnh',
    en: 'Gallery permission required to select photos',
  },
  'helper_job.evidence_gallery_err': {
    vi: 'Không thể chọn ảnh từ thư viện',
    en: 'Unable to select photos from gallery',
  },
  'helper_job.evidence_video_camera_perm': {
    vi: 'Cần quyền truy cập camera để quay video',
    en: 'Camera permission required to record video',
  },
  'helper_job.evidence_video_record_err': {
    vi: 'Không thể quay video',
    en: 'Unable to record video',
  },
  'helper_job.evidence_video_gallery_perm': {
    vi: 'Cần quyền truy cập thư viện để chọn video',
    en: 'Gallery permission required to select video',
  },
  'helper_job.evidence_video_gallery_err': {
    vi: 'Không thể chọn video từ thư viện',
    en: 'Unable to select video from gallery',
  },
  'helper_job.evidence_no_media_title': {
    vi: 'Chưa có bằng chứng nghiệm thu',
    en: 'No acceptance evidence yet',
  },
  'helper_job.evidence_no_media_msg': {
    vi: 'Khách hàng cần xem ảnh/video kết quả công việc để kiểm tra và nghiệm thu nhanh chóng. Bạn có chắc muốn tiếp tục gửi mà không có ảnh/video?',
    en: 'Customer needs to view photos/videos of completed work to review and accept promptly. Are you sure you want to proceed without photos/videos?',
  },
  'helper_job.evidence_capture_now': { vi: 'Chụp/Quay ngay', en: 'Capture now' },
  'helper_job.evidence_submit_anyway': { vi: 'Tiếp tục gửi', en: 'Submit anyway' },
  'helper_job.step_moving_toast': {
    vi: 'Bắt đầu di chuyển đến khách hàng ',
    en: 'Heading to customer location ',
  },
  'helper_job.step_arrived_toast': {
    vi: 'Đã đến địa điểm của khách hàng ',
    en: 'Arrived at customer location ',
  },
  'helper_job.step_working_toast': {
    vi: 'Bắt đầu tính giờ làm việc ▶',
    en: 'Timer started & working ▶',
  },
  'helper_job.step_moving_title': { vi: 'Bắt đầu di chuyển?', en: 'Start heading out?' },
  'helper_job.step_moving_msg': {
    vi: 'Bạn chuẩn bị xuất phát tới nhà khách hàng? Vị trí GPS của bạn sẽ được đồng bộ trực tiếp để khách hàng theo dõi hành trình như Grab.',
    en: 'Ready to depart for customer address? Your GPS location will sync live for customer to track like Grab.',
  },
  'helper_job.step_moving_btn': { vi: 'Bắt đầu xuất phát ', en: 'Start heading out ' },
  'helper_job.step_arrived_title': { vi: 'Đã đến nơi?', en: 'Arrived at location?' },
  'helper_job.step_arrived_msg': {
    vi: 'Xác nhận bạn đã có mặt tại địa chỉ khách hàng. Khách hàng sẽ nhận được thông báo để chuẩn bị đón tiếp.',
    en: 'Confirm you have arrived at customer address. Customer will receive a notification to welcome you.',
  },
  'helper_job.step_arrived_btn': { vi: 'Tôi đã có mặt ', en: 'I have arrived ' },
  'helper_job.step_working_title': { vi: 'Bắt đầu bấm giờ làm việc?', en: 'Start working timer?' },
  'helper_job.step_working_msg': {
    vi: 'Bắt đầu tính giờ và thực hiện công việc theo thỏa thuận với khách hàng.',
    en: 'Start timer and perform work as agreed with customer.',
  },
  'helper_job.step_working_btn': { vi: 'Bắt đầu ngay ▶', en: 'Start now ▶' },
  'helper_job.sos_replacement_accepted_title': {
    vi: 'Khách đã đồng ý đổi thợ — Đang tìm thợ cứu hộ thay thế...',
    en: 'Customer agreed to switch helper — Finding replacement helper...',
  },
  'helper_job.sos_replacement_accepted_desc': {
    vi: 'Bạn đã báo sự cố và khách hàng đã chấp nhận tìm thợ thay thế. Hệ thống đang quét thợ cứu hộ gần nhất để tiếp nhận đơn này.',
    en: 'You reported an issue and customer accepted replacement. System is scanning nearest rescue helpers to take over.',
  },
  'helper_job.warranty_badge': { vi: ' Đơn bảo hành — Miễn phí', en: ' Warranty Job — Free' },
  'helper_job.warranty_header': {
    vi: ' Yêu cầu bảo hành từ khách',
    en: ' Warranty request from customer',
  },
  'helper_job.quote_modal_title': { vi: 'Gửi báo giá dịch vụ', en: 'Submit Service Quote' },
  'helper_job.labor_price_label': { vi: 'Giá công thợ (₫) *', en: 'Helper labor price (₫) *' },
  'helper_job.min_quote_warning': {
    vi: ' Tiền công báo giá tối thiểu là 50.000₫',
    en: ' Minimum quote price is 50,000₫',
  },
  'helper_job.cust_pays': { vi: 'Giá khách hàng trả', en: 'Customer pays' },
  'helper_job.platform_fee': { vi: 'Phí nền tảng (15%)', en: 'Platform fee (15%)' },
  'helper_job.net_payout': { vi: 'Thực nhận về ví', en: 'Net wallet payout' },
  'helper_job.est_hours': { vi: 'Thời gian ước tính (giờ)', en: 'Estimated time (hours)' },
  'helper_job.quote_notes_label': {
    vi: 'Ghi chú gửi khách (tuỳ chọn)',
    en: 'Notes to customer (optional)',
  },
  'helper_job.quote_notes_placeholder': {
    vi: 'VD: Tôi có đầy đủ đồ nghề chuyên dụng, có thể đến ngay...',
    en: 'E.g., I have professional tools and can arrive promptly...',
  },
  'helper_job.submit_quote_btn': { vi: 'Xác nhận gửi báo giá', en: 'Confirm quote submission' },
  'helper_job.evidence_title': { vi: 'Bằng chứng hoàn thành', en: 'Completion Evidence' },
  'helper_job.evidence_badge': { vi: 'Nghiệm thu', en: 'Acceptance' },
  'helper_job.evidence_sub': {
    vi: 'Gửi kết quả để khách nghiệm thu',
    en: 'Submit results for customer acceptance',
  },
  'helper_job.evidence_hint': {
    vi: 'Chụp 1-4 hình ảnh hoặc quay video ngắn thể hiện kết quả sạch sẽ, đã sửa chữa xong để khách hàng kiểm tra và bấm hoàn thành nhanh chóng.',
    en: 'Capture 1-4 photos or short video showing clean, finished repair work for customer to verify and complete quickly.',
  },
  'helper_job.evidence_photos_count': {
    vi: ' Ảnh kết quả ({count})',
    en: ' Result photos ({count})',
  },
  'helper_job.evidence_max_photos': { vi: 'Tối đa 6 ảnh', en: 'Max 6 photos' },
  'helper_job.evidence_take_photo': { vi: 'Chụp ảnh ngay', en: 'Take photo' },
  'helper_job.evidence_pick_album': { vi: 'Chọn từ album', en: 'Choose from album' },
  'helper_job.evidence_videos_count': {
    vi: ' Video nghiệm thu ({count})',
    en: ' Acceptance video ({count})',
  },
  'helper_job.evidence_video_limit': { vi: '1-2 video ngắn', en: '1-2 short videos' },
  'helper_job.evidence_pick_video': { vi: 'Chọn video', en: 'Choose video' },
  'helper_job.evidence_notes_label': {
    vi: 'Ghi chú bàn giao cho khách (tuỳ chọn)',
    en: 'Handover notes for customer (optional)',
  },
  'helper_job.evidence_notes_placeholder': {
    vi: 'VD: Đã dọn dẹp sạch sẽ toàn bộ khu bếp, kiểm tra khóa và van nước an toàn...',
    en: 'E.g., Fully cleaned kitchen, checked all valves safely...',
  },
  'helper_job.evidence_submit_btn': {
    vi: 'Gửi kết quả & Báo hoàn thành',
    en: 'Submit results & report completion',
  },
  'sos_helper.issue_title': {
    vi: 'Gặp sự cố không thể tiếp tục đơn?',
    en: 'Encountered an issue and cannot continue?',
  },
  'sos_helper.issue_desc': {
    vi: 'Gửi SOS để xin đổi người: khách hàng sẽ xác nhận đổi thợ khác (giữ nguyên giá) hoặc hủy đơn. Bạn không bị tính phạt trễ/hủy cho đơn này khi dùng SOS.',
    en: 'Send SOS to request a replacement: customer will confirm another helper (same price) or cancel. You won’t be penalized for delays/cancellation.',
  },
  'sos_helper.reputation_warning': {
    vi: ' Điểm uy tín: bạn đã hủy/SOS {count} đơn trong 7 ngày qua{score}. Hủy quá 3 đơn/7 ngày sẽ bị trừ điểm tiêu chí Độ tin cậy.',
    en: ' Reputation: you cancelled/SOS {count} jobs in the last 7 days{score}. Over 3 cancellations in 7 days reduces Reliability score.',
  },
  'sos_helper.score_info': {
    vi: ' — điểm hiện tại {score}/100',
    en: ' — current score {score}/100',
  },
  'sos_helper.send_sos_btn': {
    vi: 'Gửi SOS — xin đổi người',
    en: 'Send SOS — Request replacement',
  },
  'sos_helper.reason_title': {
    vi: 'Lý do không thể tiếp tục đơn',
    en: 'Reason unable to continue job',
  },
  'sos_helper.reason_desc': {
    vi: 'Chỉ lý do này được gửi cho khách hàng — ghi chú thêm (nếu có) chỉ đội hỗ trợ xem.',
    en: 'Only this reason is sent to the customer — additional notes are visible only to support.',
  },
  'sos_helper.note_placeholder': {
    vi: 'Ghi chú thêm (không bắt buộc)',
    en: 'Additional notes (optional)',
  },
  'sos_helper.add_photos_title': {
    vi: 'Thêm ảnh minh chứng (không bắt buộc)',
    en: 'Add evidence photos (optional)',
  },
  'sos_helper.add_photos_desc': {
    vi: 'VD: xe hư, tai nạn — khách hàng sẽ thấy các ảnh này khi quyết định đổi người hay hủy đơn. Tối đa 4 ảnh.',
    en: 'E.g. broken vehicle, accident — customer sees these when deciding replacement or cancellation. Up to 4 photos.',
  },
  'sos_helper.add_photo_btn': { vi: 'Thêm ảnh', en: 'Add photo' },
  'sos_helper.uploading_photos': { vi: 'Đang tải ảnh lên…', en: 'Uploading photos…' },
  'sos_helper.submit_sos_btn': { vi: 'Gửi yêu cầu SOS', en: 'Submit SOS request' },
  // ─── Email verification (P0-7) ───────────────────────────────────────────
  verify_banner_title: { vi: 'Xác minh email của bạn', en: 'Verify your email' },
  verify_banner_desc: {
    vi: 'Bạn chưa xác minh email nên chưa thể tạo đơn hoặc nhận việc. Gửi lại mã xác minh để tiếp tục.',
    en: 'You have not verified your email yet, so you cannot post jobs or accept work. Resend the verification code to continue.',
  },
  verify_banner_action: { vi: 'Gửi lại mã', en: 'Resend code' },
  verify_banner_sent: {
    vi: 'Đã gửi mã xác minh đến email của bạn',
    en: 'Verification code sent to your email',
  },
  verify_banner_no_email: {
    vi: 'Tài khoản chưa có email — vui lòng liên hệ hỗ trợ để cập nhật email trước khi xác minh.',
    en: 'This account has no email — please contact support to add an email before verifying.',
  },
  booking_verify_title: { vi: 'Cần xác minh email trước', en: 'Email verification required first' },
  booking_verify_desc: {
    vi: 'Tài khoản của bạn chưa được xác minh qua email nên chưa thể tạo đơn. Gửi lại mã xác minh ngay?',
    en: 'Your account is not email-verified yet, so you cannot post a job. Resend the verification code now?',
  },
  booking_verify_resend: { vi: 'Gửi lại mã', en: 'Resend code' },

  // ─── Auth error mapping (P2-16) — xem mapAuthErrorMessage bên dưới ────────
  auth_err_invalid_phone: {
    vi: 'Vui lòng nhập số điện thoại 10 số hợp lệ',
    en: 'Please enter a valid 10-digit phone number',
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

// ─── Auth Error Mapping (P2-16) ──────────────────────────────────────────────
// Backend trả message tiếng Việt thô; ở chế độ English phải dịch sang tiếng
// Anh thay vì hiển thị nguyên văn. Chỉ map các message đã biết — message lạ
// giữ nguyên để không giấu thông tin.
const AUTH_ERROR_EN_MAP: Record<string, string> = {
  'Số điện thoại đã được đăng ký': 'This phone number is already registered',
  'Email đã được đăng ký': 'This email is already registered',
  'Email này đã được đăng ký': 'This email is already registered',
  'Số điện thoại, email hoặc mật khẩu không đúng': 'Incorrect phone number, email or password',
  'Tài khoản đã bị khóa. Liên hệ hỗ trợ.': 'This account is locked. Please contact support.',
  'Tài khoản đã bị xóa.': 'This account has been deleted.',
  'OTP không đúng hoặc đã hết hạn': 'Invalid or expired OTP code',
  'Mã OTP không đúng hoặc đã hết hạn': 'Invalid or expired OTP code',
  'Mã xác nhận không đúng hoặc đã hết hạn': 'Invalid or expired verification code',
  'Số điện thoại chưa được đăng ký': 'This phone number is not registered',
  'Số điện thoại không tồn tại': 'This phone number does not exist',
  'Email chưa được đăng ký trong hệ thống': 'This email is not registered',
  'Tài khoản không tồn tại trong hệ thống': 'Account does not exist',
  'Tài khoản không tồn tại': 'Account does not exist',
  'Gửi mã OTP thất bại. Vui lòng thử lại sau.': 'Failed to send the OTP code. Please try again later.',
  'Bạn đã yêu cầu gửi mã OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau.':
    'You have requested the OTP code too many times in 1 hour. Please try again later.',
  'Gửi mã OTP qua SMS chưa được hỗ trợ. Vui lòng dùng email để nhận mã OTP.':
    'SMS OTP is not supported yet. Please use email to receive the OTP code.',
  'Tài khoản chưa đăng ký email nên không thể gửi mã OTP qua email. Vui lòng liên hệ hỗ trợ để cập nhật email.':
    'This account has no email registered, so the OTP cannot be sent by email. Please contact support to add an email.',
  'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo đơn.':
    'Your account is not email-verified yet. Please verify your email before posting a job.',
  'Số điện thoại không hợp lệ': 'Invalid phone number',
  'Mật khẩu không đúng': 'Incorrect password',
  'Đăng ký thành công!': 'Registration successful!',
  'Đặt lại mật khẩu thành công': 'Password reset successful',
  'Xác minh email thành công': 'Email verified successfully',
  'OTP đã được gửi. Có hiệu lực trong 5 phút.': 'OTP sent. Valid for 5 minutes.',
  'Mã xác minh OTP đã được gửi đến email của bạn.':
    'The OTP verification code has been sent to your email.',
};

export function mapAuthErrorMessage(
  message: unknown,
  lang: AppLanguage,
): string | undefined {
  if (typeof message !== 'string' || !message) return undefined;
  if (lang !== 'en') return message;
  return AUTH_ERROR_EN_MAP[message.trim()] ?? message;
}

// ─── Service Catalog Name Translation (Điểm 3) ───────────────────────────────
export const SERVICE_NAME_EN_MAP: Record<string, string> = {
  'giúp việc theo giờ': 'Hourly housekeeping',
  'giúp việc theo ngày': 'Daily housekeeping',
  'giúp việc định kỳ': 'Periodic housekeeping',
  'dọn nhà': 'House cleaning',
  'dọn dẹp nhà': 'House cleaning',
  'dọn dẹp vệ sinh nhà cửa': 'House cleaning',
  'tổng vệ sinh nhà cửa': 'Deep house cleaning',
  'tổng vệ sinh': 'Deep cleaning',
  'vệ sinh nhà': 'House cleaning',
  'sửa điện gia dụng': 'Home electrician',
  'sửa điện': 'Home electrician',
  'thợ điện': 'Electrician',
  điện: 'Electrical',
  'sửa ống nước & thông cống': 'Plumbing & Drain unblocking',
  'sửa ống nước': 'Plumbing repair',
  'thông cống': 'Drain unblocking',
  'vệ sinh & bơm gas máy lạnh': 'AC cleaning & Gas refilling',
  'vệ sinh máy lạnh': 'AC cleaning',
  'sửa máy lạnh': 'AC repair',
  'máy lạnh': 'Air conditioning',
  'nấu ăn gia đình': 'Home cooking',
  'đi chợ & nấu ăn gia đình': 'Grocery shopping & Home cooking',
  'nấu ăn': 'Home cooking',
  'sửa máy giặt & tủ lạnh': 'Washing machine & Fridge repair',
  'sửa máy giặt': 'Washing machine repair',
  'sửa tủ lạnh': 'Fridge repair',
  'thiết bị gia dụng': 'Home appliances',
  'sửa khóa & lắp camera': 'Locksmith & Camera setup',
  'sửa khóa': 'Locksmith',
  'lắp camera': 'Camera setup',
  'chuyển nhà': 'Home moving',
  'chuyển nhà trọn gói': 'Full moving service',
  'dọn nhà & chuyển nhà': 'Home moving & packing',
  'chăm trẻ': 'Babysitting',
  'trông trẻ': 'Babysitting',
  'giặt ủi': 'Laundry',
  'giặt ủi quần áo': 'Laundry & Ironing',
  'giặt giũ & là ủi quần áo': 'Laundry & Ironing',
  'chăm người già': 'Elderly care',
  'chăm sóc người già': 'Elderly care',
  'chăm sóc người già & trẻ nhỏ': 'Elderly & Child care',
  'chăm sóc người già & trẻ em': 'Elderly & Child care',
  'chăm sóc gia chủ': 'Family & Elderly care',
  'chăm sóc cây cảnh': 'Plant & Garden care',
  'trông giữ & quản lý nhà cửa': 'House-sitting & Property management',
  'phụ việc lặt vặt': 'Handyman & Odd jobs',
  'sơn nhà': 'House painting',
  'rửa xe tận nơi': 'Mobile vehicle wash',
  'diệt côn trùng': 'Pest control',
  'cứu hộ khẩn cấp': 'Emergency rescue (SOS)',
  'cứu hộ sos': 'Emergency SOS rescue',
  'bốc hàng, vận chuyển': 'Cargo & logistics',
  'bốc hàng': 'Cargo moving',
  'vận chuyển': 'Logistics & Moving',
  'chăm sóc thú cưng': 'Pet care',
  'thú cưng': 'Pet care',
  'chăm sóc chó mèo': 'Pet care',
  'tắm thú cưng': 'Pet grooming',
  'cắt tỉa lông thú cưng': 'Pet grooming',
  'dịch vụ khác — tự ghi việc, tự set giá': 'Other — custom task & price',
  'dịch vụ khác': 'Other services',
  'dịch vụ': 'Service',
};

export const SERVICE_SLUG_EN_MAP: Record<string, string> = {
  housekeeping_hourly: 'Hourly housekeeping',
  housekeeping_daily: 'Daily housekeeping',
  housekeeping_periodic: 'Periodic housekeeping',
  deep_cleaning: 'Deep cleaning',
  house_cleaning: 'House cleaning',
  cleaning: 'Cleaning',
  electrician: 'Home electrician',
  electrical: 'Electrical',
  plumbing: 'Plumbing repair',
  plumber: 'Plumbing repair',
  ac_repair: 'AC cleaning & repair',
  cooking: 'Home cooking',
  appliance: 'Appliance repair',
  appliances: 'Home appliances',
  locksmith: 'Locksmith & Camera',
  moving_help: 'Home moving',
  child_care: 'Babysitting',
  caregiving: 'Elderly & Child care',
  family_care: 'Family & Elderly care',
  laundry: 'Laundry & Ironing',
  elderly_care: 'Elderly care',
  handyman: 'Handyman & Odd jobs',
  petcare: 'Pet care',
  pet_care: 'Pet care',
  plantcare: 'Plant & Garden care',
  house_management: 'House-sitting & Property management',
  painting: 'House painting',
  car_wash: 'Mobile vehicle wash',
  pest_control: 'Pest control',
  sos: 'Emergency SOS rescue',
  custom: 'Other service',
};

export function translateServiceName(
  service: { name?: string; slug?: string; title?: string } | string | null | undefined,
  lang: AppLanguage,
): string {
  if (!service) return '';
  const rawName = typeof service === 'string' ? service : service.name || service.title || '';
  const slug = typeof service === 'object' && service ? service.slug : undefined;

  if (lang !== 'en') {
    return rawName || (slug ? SERVICE_SLUG_EN_MAP[slug] || slug : '');
  }

  // 1. Look up by slug if available
  if (slug && SERVICE_SLUG_EN_MAP[slug]) {
    return SERVICE_SLUG_EN_MAP[slug];
  }

  // 2. Look up by normalized Vietnamese name
  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();
  if (SERVICE_NAME_EN_MAP[lower]) {
    return SERVICE_NAME_EN_MAP[lower];
  }

  // 3. Fallback: return rawName as-is if out of catalog
  return rawName;
}

// ─── Service Description Translation (Điểm 3) ────────────────────────────────
export const SERVICE_DESC_SLUG_EN_MAP: Record<string, string> = {
  house_cleaning: 'Mopping, vacuuming, living room, bedroom, kitchen cleaning...',
  cooking: 'Grocery shopping, home-style meals, savory and vegetarian dishes...',
  laundry: 'Sorting, hand/machine wash, drying, folding, neat ironing...',
  family_care: 'Babysitting, elder care, patient care, pregnancy support...',
  caregiving: 'Watching over, feeding, medicine reminders, walking assistance...',
  petcare: 'Feeding, bathing, dog walking, pet cage cleaning...',
  pet_care: 'Feeding, bathing, dog walking, pet cage cleaning...',
  plantcare: 'Watering, fertilizing, pruning, repotting, pest control...',
  house_management: 'Watching home while away, receiving parcels, security checks, maintenance...',
  housekeeping_hourly: 'Cleaning, dishwashing, window cleaning, flexible hourly housework...',
  deep_cleaning: 'Intensive deep home cleaning, floor scrubbing, glass polishing, sanitizing...',
  moving_help: 'Packing belongings, moving, organizing and setting up new home...',
  handyman:
    'Hanging frames, shelf mounting, minor repairs, changing lightbulbs, household odd jobs...',
  electrician: 'Fixing electrical shorts, replacing switches, sockets, lights, safe wiring...',
  plumbing: 'Unclogging toilets, sinks, fixing leaks, replacing faucets and valves...',
  plumber: 'Fixing leaking faucets, unclogging toilets, sinks and pipes...',
  ac_repair: 'Cleaning filters, coils, checking gas pressure and refilling refrigerant...',
  appliance: 'Repairing washers, fridges, noisy motors, replacing genuine parts...',
  locksmith: 'Opening locked doors, cutting keys, installing home security cameras...',
};

export const SERVICE_DESC_TEXT_EN_MAP: Record<string, string> = {
  'lau sàn, hút bụi, dọn phòng khách, phòng ngủ, nhà bếp, vệ sinh...':
    'Mopping, vacuuming, living room, bedroom, kitchen cleaning...',
  'đi chợ mua nguyên liệu, nấu cơm canh, món mặn, món chay theo yêu cầu...':
    'Grocery shopping, home-style meals, savory and vegetarian dishes...',
  'phân loại, giặt tay/máy, phơi, gấp, là ủi quần áo gọn gàng...':
    'Sorting, hand/machine wash, drying, folding, neat ironing...',
  'trông trẻ, chăm sóc người già, người bệnh, hỗ trợ bà bầu...':
    'Babysitting, elder care, patient care, pregnancy support...',
  'cho ăn, tắm rửa, dắt đi dạo, vệ sinh chuồng trại thú cưng...':
    'Feeding, bathing, dog walking, pet cage cleaning...',
  'tưới cây, bón phân, cắt tỉa, thay chậu, phòng trừ sâu bệnh...':
    'Watering, fertilizing, pruning, repotting, pest control...',
  'trông coi nhà khi vắng, nhận bưu phẩm, kiểm tra an ninh, bảo trì...':
    'Watching home while away, receiving parcels, security checks, maintenance...',
  'dọn dẹp, rửa chén, lau kính, hỗ trợ việc nhà linh hoạt theo giờ...':
    'Cleaning, dishwashing, window cleaning, flexible hourly housework...',
  'vệ sinh toàn bộ nhà chuyên sâu, chà sàn, lau kính, tẩy rửa...':
    'Intensive deep home cleaning, floor scrubbing, glass polishing, sanitizing...',
  'đóng gói đồ đạc, sắp xếp, vận chuyển, bày trí nhà mới...':
    'Packing belongings, moving, organizing and setting up new home...',
  'treo tranh, lắp kệ, sửa nhỏ, thay bóng đèn, việc vặt trong nhà...':
    'Hanging frames, shelf mounting, minor repairs, changing lightbulbs, household odd jobs...',
  'dọn dẹp phòng khách, phòng ngủ, lau sàn, rửa chén bát...':
    'Cleaning living room, bedroom, mopping, washing dishes...',
  'tổng vệ sinh toàn bộ nhà, chà sàn, lau kính chuyên sâu...':
    'Full house deep cleaning, floor scrubbing, deep window cleaning...',
  'sửa chập điện, thay công tắc, ổ cắm, lắp đèn...':
    'Fixing power faults, replacing switches, sockets, installing lights...',
  'sửa vòi nước rò rỉ, thông tắc bồn cầu, chậu rửa...':
    'Fixing leaky faucets, unclogging toilets, sinks and drains...',
  'trông nom, cho ăn, nhắc nhở uống thuốc, đi dạo...':
    'Looking after, feeding, medication reminders, walking accompaniment...',
  'giặt giũ, phơi đồ, gấp và ủi phẳng quần áo...':
    'Laundry, drying, folding and pressing clothes...',
  'đi chợ, chuẩn bị thực phẩm, nấu các món ăn theo khẩu vị...':
    'Grocery shopping, prepping ingredients, cooking customized home meals...',
};

export function translateServiceDescription(
  service: { description?: string; slug?: string } | string | null | undefined,
  lang: AppLanguage,
): string {
  if (!service) return '';
  const rawDesc = typeof service === 'string' ? service : service.description || '';
  const slug = typeof service === 'object' && service ? service.slug : undefined;

  if (lang !== 'en') {
    return rawDesc;
  }

  if (slug && SERVICE_DESC_SLUG_EN_MAP[slug]) {
    return SERVICE_DESC_SLUG_EN_MAP[slug];
  }

  const trimmed = rawDesc.trim().toLowerCase();
  if (SERVICE_DESC_TEXT_EN_MAP[trimmed]) {
    return SERVICE_DESC_TEXT_EN_MAP[trimmed];
  }

  return rawDesc;
}

// ─── Voucher Description Formatter (Điểm 4) ──────────────────────────────────
export function formatVoucherDescription(
  voucher:
    | {
        code?: string;
        description?: string;
        discount_type?: 'percent' | 'fixed' | string;
        discount_value?: number;
        max_discount_amount?: number;
        min_order_amount?: number;
        scope?: string;
        applicable_services?: string[];
      }
    | null
    | undefined,
  lang: AppLanguage,
): string {
  if (!voucher) return '';

  const { discount_type, discount_value, max_discount_amount, min_order_amount, description } =
    voucher;

  // If essential numeric data is missing, fallback to saved description
  if (discount_value == null || !discount_type) {
    return description || (lang === 'en' ? 'Discount voucher' : 'Mã giảm giá');
  }

  if (lang === 'en') {
    let text = '';
    if (discount_type === 'percent') {
      text = `${discount_value}% off`;
      if (max_discount_amount && max_discount_amount > 0) {
        text += ` up to ${Number(max_discount_amount).toLocaleString('en-US')}₫`;
      }
    } else {
      text = `${Number(discount_value).toLocaleString('en-US')}₫ off`;
    }

    if (min_order_amount && min_order_amount > 0) {
      text += ` · Min order ${Number(min_order_amount).toLocaleString('en-US')}₫`;
    } else {
      text += ' for all services';
    }
    return text;
  }

  // Vietnamese rendering
  if (description) return description;
  let viText = '';
  if (discount_type === 'percent') {
    viText = `Giảm ${discount_value}%`;
    if (max_discount_amount && max_discount_amount > 0) {
      viText += ` tối đa ${Number(max_discount_amount).toLocaleString('vi-VN')}₫`;
    }
  } else {
    viText = `Giảm ${Number(discount_value).toLocaleString('vi-VN')}₫`;
  }

  if (min_order_amount && min_order_amount > 0) {
    viText += ` · Đơn tối thiểu ${Number(min_order_amount).toLocaleString('vi-VN')}₫`;
  } else {
    viText += ' cho mọi dịch vụ';
  }
  return viText;
}

// ─── Loyalty Tier Name Translation (Điểm 6) ──────────────────────────────────
export const LOYALTY_TIER_EN_MAP: Record<string, string> = {
  vàng: 'Gold',
  gold: 'Gold',
  bạc: 'Silver',
  silver: 'Silver',
  thường: 'Standard',
  thưởng: 'Standard',
  regular: 'Standard',
  standard: 'Standard',
  'kim cương': 'Diamond',
  diamond: 'Diamond',
  đồng: 'Bronze',
  bronze: 'Bronze',
};

export function translateLoyaltyTier(tier: string | null | undefined, lang: AppLanguage): string {
  if (!tier) return lang === 'en' ? 'Standard' : 'Thường';
  if (lang !== 'en') return tier;
  const key = String(tier).trim().toLowerCase();
  return LOYALTY_TIER_EN_MAP[key] || tier;
}

// ─── SOS Backup Reasons (Điểm 7) ─────────────────────────────────────────────
export const SOS_BACKUP_REASONS_I18N: Record<string, { vi: string; en: string }> = {
  accident: { vi: 'Tai nạn trên đường', en: 'Traffic accident on the way' },
  vehicle_breakdown: { vi: 'Hỏng xe giữa đường', en: 'Vehicle breakdown' },
  health_emergency: { vi: 'Sự cố sức khỏe đột xuất', en: 'Sudden health emergency' },
  family_emergency: { vi: 'Việc gia đình khẩn cấp', en: 'Urgent family emergency' },
  equipment_failure: {
    vi: 'Hỏng dụng cụ chuyên dụng không thể làm tiếp',
    en: 'Specialized equipment failure',
  },
  other: { vi: 'Lý do bất khả kháng khác', en: 'Other force majeure reason' },
};

// ─── Notification Localization Mapping (Điểm 3) ──────────────────────────────
export function formatNotificationTitle(
  title: string | undefined | null,
  lang: AppLanguage = 'vi',
  type?: string,
  data?: any,
): string {
  if (!title && !type) return '';
  if (lang !== 'en') return title || '';
  const t = (title || '').trim();

  if (type) {
    switch (type) {
      case 'payment_success':
        // F11: map theo type + payload, không theo chuỗi tiêu đề.
        if (data?.payment_method === 'cash') return 'Cash Order Completed!';
        if (data?.payment_method) return 'Earnings Credited to Wallet!';
        // Fallback cho thông báo cũ (chưa có payment_method trong payload).
        if (/tiền mặt/i.test(t) || /phí sàn/i.test(t) || /đối soát/i.test(t))
          return 'Cash Order Completed!';
        if (/ví|thu nhập|tiền công/i.test(t)) return 'Earnings Credited to Wallet!';
        return 'Payment Successful';
      case 'job_confirmed':
        // F11: map theo type + payload, không theo chuỗi tiêu đề.
        if (data?.is_sos) return 'Helper Accepted SOS Rescue!';
        if (data?.is_warranty) return 'Helper Accepted Warranty Job!';
        if (data?.is_fixed_price) return 'Helper Accepted Fixed-Price Job!';
        // Fallback cho thông báo cũ (chưa có cờ trong payload).
        if (/bảo hành/i.test(t)) return 'Helper Accepted Warranty Job!';
        if (/giá cam kết/i.test(t)) return 'Helper Accepted Fixed-Price Job!';
        if (/cứu hộ|sos/i.test(t)) return 'Helper Accepted SOS Rescue!';
        return 'Job Confirmed';
      case 'quote_accepted':
        return 'Quote Accepted!';
      case 'quote_rejected':
        return 'Quote Declined';
      case 'new_quote_received':
        return 'New Quote Received';
      case 'new_job_nearby':
        return 'New job near you';
      case 'job_completed':
        return 'Job Completed';
      case 'helper_on_the_way':
        return 'Helper is on the way';
      case 'helper_arrived':
        return 'Helper has arrived';
      case 'kyc_approved':
        return 'e-KYC Profile Approved';
      case 'kyc_rejected':
        return 'e-KYC Profile Rejected';
      case 'withdrawal_processed':
        return 'Withdrawal Successful';
      case 'new_message':
        return 'New Message';
      case 'support_reply':
        return 'Support Team Replied';
      case 'refund_received':
        return 'Refund Credited to Green House Wallet';
      case 'review_received':
        return 'Review Received';
      case 'job_expired':
        return 'Job Expired';
      case 'job_expiring_soon':
        return 'Job Expiring Soon';
      case 'sos_backup_request':
        return 'Emergency Backup Invitation (SOS)';
      case 'sos_backup_decision_request':
        return 'Helper Emergency Reported';
      case 'sos_backup_decision_reminder':
        return 'Reminder: Action Required for Pending Job';
      case 'sos_backup_job_cancelled':
        return 'Job Cancelled & Refunded under SOS Policy';
      case 'sos_backup_helper_replaced':
        return 'Replacement Helper Assigned';
      case 'sos_backup_expired':
        return 'SOS Backup Expired — Manual Review Required';
      case 'monthly_contract_new':
        return 'New Monthly Contract Offer';
      case 'monthly_contract_accepted':
        return 'Helper Accepted Monthly Contract';
      case 'monthly_contract_rejected':
        return 'Helper Declined Monthly Contract';
      case 'monthly_contract_cancelled':
        return 'Monthly Contract Cancelled';
      case 'monthly_contract_ended':
        return 'Monthly Contract Ended';
      case 'monthly_contract_checkin':
        return 'Helper Checked In Today';
      case 'monthly_contract_attendance':
        return /vắng/i.test(t) ? 'Work Session Marked Absent' : 'Work Session Confirmed';
      case 'monthly_contract_leave_request':
        return 'Helper Requested 1 Day Leave';
      case 'monthly_contract_leave_response':
        return /từ chối/i.test(t) ? 'Leave Request Rejected' : 'Leave Request Approved';
      case 'monthly_contract_settled':
        return 'Monthly Salary Finalized';
      case 'insurance_claim_update':
        if (/từ chối/i.test(t)) return 'Insurance Claim Rejected';
        if (/chi trả|được duyệt/i.test(t)) return 'Insurance Claim Payout Approved';
        return 'Insurance Claim Under Review';
      // B102: nhóm thông báo mới — map theo type
      case 'team_invitation':
        return 'Invitation to Work Team';
      case 'team_invitation_response':
        return /từ chối/i.test(t) ? 'Team Invitation Declined' : 'Team Invitation Accepted';
      case 'dispute_evidence':
        return 'Dispute Case Updated';
      case 'dispute_appealed':
        return 'Dispute Decision Appealed';
      case 'review_appeal':
        if (/chấp nhận/i.test(t)) return 'Review Appeal Accepted';
        if (/từ chối|bị từ chối/i.test(t)) return 'Review Appeal Rejected';
        return 'New Review Appeal';
      case 'loyalty_points_earned':
        return 'Loyalty Points Earned';
      case 'voucher_restored':
        return 'Voucher & Points Restored';
      case 'voucher_expiring_soon':
        return 'Voucher Expiring Soon';
      case 'monthly_contract_started':
        return 'Monthly Contract Started';
      case 'monthly_contract_expiring_soon':
        return 'Monthly Contract Expiring Soon';
      case 'recurring_plan_paused':
        return 'Recurring Plan Paused';
      case 'recurring_plan_resumed':
        return 'Recurring Plan Resumed';
      case 'recurring_plan_cancelled':
        return 'Recurring Plan Cancelled';
      case 'job_private_offer':
        return 'Private Job Offer';
      case 'call_missed':
        return 'Missed Call';
      case 'sos_backup_candidate_withdrawn':
        return 'Replacement Candidate Withdrew';
    }
  }

  if (/^Hoàn tất đơn Tiền mặt!?$/i.test(t)) return 'Cash Order Completed!';
  if (/^Tiền công đã cộng vào ví!?$/i.test(t)) return 'Earnings Credited to Wallet!';
  if (/^\s*Thợ đã nhận việc bảo hành!?$/i.test(t)) return 'Helper Accepted Warranty Job!';
  if (/^\s*Đã có thợ nhận việc giá cam kết!?$/i.test(t)) return 'Helper Accepted Fixed-Price Job!';
  if (/^\s*Khách đã duyệt chi phí phát sinh!?$/i.test(t)) return 'Customer Approved Extra Expenses';
  if (/^\s*Khách từ chối chi phí phát sinh!?$/i.test(t)) return 'Customer Rejected Extra Expenses';
  if (/^\s*Thợ đã nhận hợp đồng theo tháng!?$/i.test(t)) return 'Helper Accepted Monthly Contract';
  if (/^\s*Thợ đã từ chối hợp đồng theo tháng!?$/i.test(t))
    return 'Helper Declined Monthly Contract';

  if (/^Báo giá được chọn!?$/i.test(t)) return 'Quote Accepted!';
  if (/^Công việc bị hủy$/i.test(t)) return 'Job Cancelled';
  if (/^Đơn hàng đã bị hủy bởi Quản trị viên$/i.test(t)) return 'Order Cancelled by Admin';
  if (/^Báo giá mới$/i.test(t)) return 'New Quote Received';
  if (/^Có đơn mới gần bạn\s*(|)?$/i.test(t)) return 'New job near you';
  if (/^\s*Bạn được khách quen gửi việc riêng!$/i.test(t))
    return 'You received a private job from a regular customer!';
  if (/^Hoàn thành công việc$/i.test(t)) return 'Job Completed';
  if (/^Người giúp việc đang trên đường$/i.test(t)) return 'Helper is on the way';
  if (/^Người giúp việc đã đến$/i.test(t)) return 'Helper has arrived';
  if (/^Người giúp việc có sự cố khẩn cấp$/i.test(t)) return 'Helper Emergency Reported';
  if (/^Đã có người giúp việc thay thế$/i.test(t)) return 'Replacement Helper Assigned';
  if (/^Đã có người thay thế bạn$/i.test(t)) return 'You Have Been Replaced';
  if (/^Đơn đã hủy\s*[—–-]\s*bạn được giải phóng$/i.test(t))
    return 'Job Cancelled — You Are Released';
  if (/^Đơn đã hủy & hoàn tiền theo chính sách SOS$/i.test(t))
    return 'Job Cancelled & Refunded under SOS Policy';
  if (/^Đơn đã hủy\s*[—–-]\s*Khoản hoàn tiền đang chờ đối soát$/i.test(t))
    return 'Job Cancelled — Refund Pending Review';
  if (/^Người giúp việc đã thu hồi yêu cầu SOS$/i.test(t)) return 'Helper Retracted SOS Request';
  if (/^Chưa tìm được người thay thế$/i.test(t)) return 'No Replacement Helper Found Yet';
  if (/^Chưa có thợ thay thế phù hợp$/i.test(t)) return 'No Suitable Replacement Helper Yet';
  if (/^SOS backup hết hạn\s*[—–-]\s*cần xử lý thủ công$/i.test(t))
    return 'SOS Backup Expired — Manual Review Required';
  if (/^Nhắc:\s*cần bạn quyết định cho đơn đang chờ$/i.test(t))
    return 'Reminder: Action Required for Pending Job';
  if (/^\s*Lời mời hỗ trợ khẩn cấp\s*\(SOS Backup\)/i.test(t))
    return 'Emergency Backup Invitation (SOS)';
  if (/^\s*CỨU HỘ KHẨN CẤP SOS GẦN BẠN!?$/i.test(t)) return 'URGENT SOS EMERGENCY NEAR YOU!';
  if (/^\s*ĐÃ CÓ THỢ NHẬN CỨU HỘ SOS!?$/i.test(t)) return 'A HELPER ACCEPTED SOS RESCUE!';
  if (/^\s*\[SOS CỨU HỘ\]\s*(.*)$/i.test(t)) {
    const rest = t.replace(/^\s*\[SOS CỨU HỘ\]\s*/i, '');
    return `[SOS RESCUE] ${rest}`;
  }
  if (/^Hồ sơ e-KYC đã được duyệt$/i.test(t)) return 'e-KYC Profile Approved';
  if (/^Hồ sơ e-KYC bị từ chối$/i.test(t)) return 'e-KYC Profile Rejected';
  if (/^Hoàn tiền vào ví Green House$/i.test(t)) return 'Refund Credited to Green House Wallet';
  if (/^Rút tiền thành công$/i.test(t)) return 'Withdrawal Successful';
  if (/^Yêu cầu rút tiền bị từ chối$/i.test(t)) return 'Withdrawal Request Rejected';
  if (/^Tin nhắn mới$/i.test(t)) return 'New Message';
  if (/^Đội hỗ trợ đã phản hồi$/i.test(t)) return 'Support Team Replied';
  if (/^Bạn nhận được đánh giá\s*(\d+)★$/i.test(t)) {
    return t.replace(/^Bạn nhận được đánh giá\s*(\d+)★$/i, 'You received a $1-star review');
  }
  if (/^\s*Đề xuất phát sinh vật tư \/ chi phí$/i.test(t)) return 'Extra Supplies / Costs Proposal';
  if (/^\s*Đơn hàng đang có khiếu nại \/ tranh chấp$/i.test(t))
    return 'Order Has Dispute / Complaint';
  if (/^\s*Kết quả phân xử khiếu nại từ Admin$/i.test(t)) return 'Dispute Resolution from Admin';
  if (/^\s*Hồ sơ tranh chấp có cập nhật$/i.test(t)) return 'Dispute Case Updated';
  if (/^\s*Phán quyết tranh chấp bị kháng cáo$/i.test(t)) return 'Dispute Decision Appealed';
  if (/^\s*Lời mời vào nhóm làm việc$/i.test(t)) return 'Invitation to Work Team';
  if (/^\s*Đề nghị hợp đồng theo tháng mới$/i.test(t)) return 'New Monthly Contract Offer';
  if (/^\s*Hợp đồng theo tháng đã bị hủy$/i.test(t)) return 'Monthly Contract Cancelled';
  if (/^\s*Hợp đồng theo tháng đã kết thúc$/i.test(t)) return 'Monthly Contract Ended';
  if (/^\s*Thợ đã điểm danh hôm nay$/i.test(t)) return 'Helper Checked In Today';
  if (/^\s*Buổi làm đã được xác nhận$/i.test(t)) return 'Work Session Confirmed';
  if (/^\s*Buổi làm bị đánh dấu vắng$/i.test(t)) return 'Work Session Marked Absent';
  if (/^\s*Thợ xin nghỉ 1 buổi$/i.test(t)) return 'Helper Requested 1 Day Leave';
  if (/^\s*Đơn xin nghỉ đã được duyệt$/i.test(t)) return 'Leave Request Approved';
  if (/^\s*Đơn xin nghỉ bị từ chối$/i.test(t)) return 'Leave Request Rejected';
  if (/^\s*Đã chốt lương tháng\s*(.*)$/i.test(t)) {
    return t.replace(/^\s*Đã chốt lương tháng\s*(.*)$/i, 'Monthly Salary Finalized for $1');
  }
  if (/^\s*Yêu cầu bồi thường đang được xem xét$/i.test(t)) return 'Insurance Claim Under Review';
  if (/^\s*Yêu cầu bồi thường bị từ chối$/i.test(t)) return 'Insurance Claim Rejected';
  if (/^\s*Bồi thường bảo hiểm đã được chi trả$/i.test(t)) return 'Insurance Claim Payout Approved';
  if (/^Bảo hành:\s*(.*)$/i.test(t)) {
    return t.replace(/^Bảo hành:\s*/i, 'Warranty: ');
  }

  return title || '';
}

export function formatNotificationBody(
  body: string | undefined | null,
  lang: AppLanguage = 'vi',
  type?: string,
  data?: any,
): string {
  if (!body) return '';
  if (lang !== 'en') return body;
  const b = body.trim();

  // 1. payment_success (cash & escrow) — F11: map theo type + payload trước,
  // chỉ dùng regex bóc tiêu đề VI làm fallback cho thông báo cũ.
  if (type === 'payment_success' && data?.payment_method) {
    const jobName = data?.job_title ? `"${data.job_title}"` : 'Your job';
    if (data.payment_method === 'cash')
      return `Job ${jobName} has been inspected and approved. Platform fee settled.`;
    return `Job ${jobName} is completed. Earnings disbursed to your wallet.`;
  }

  const cashComplete = b.match(
    /^Công việc\s*(".*?"|'.*?'|“.*?”)\s*đã nghiệm thu\.\s*Phí nền tảng đã được đối soát\.?$/i,
  );
  if (cashComplete)
    return `Job ${cashComplete[1]} has been inspected and approved. Platform fee settled.`;

  const escrowComplete = b.match(
    /^Công việc\s*(".*?"|'.*?'|“.*?”)\s*đã hoàn thành\.\s*Thu nhập đã được giải ngân vào ví của bạn\.?$/i,
  );
  if (escrowComplete)
    return `Job ${escrowComplete[1]} is completed. Earnings disbursed to your wallet.`;

  if (type === 'payment_success') {
    return 'Payment has been processed successfully.';
  }

  // B102: nhóm thông báo mới — map body theo type (không đoán theo chuỗi tiếng Việt)
  if (type === 'team_invitation') {
    const m = b.match(/đơn\s*(".*?"|'.*?'|“.*?”).*?(\d+)%/i);
    return m
      ? `You are invited to join job ${m[1]} with a ${m[2]}% earnings split.`
      : 'You are invited to join a work team for a job.';
  }
  if (type === 'team_invitation_response') {
    const m = b.match(/Đơn\s*(".*?"|'.*?'|“.*?”)/i);
    const accepted = /đồng ý/i.test(b);
    return `Job ${m ? m[1] : ''}: a helper just ${accepted ? 'accepted' : 'declined'} the team invitation.`;
  }
  if (type === 'dispute_evidence') {
    const m = b.match(/Đơn\s*(".*?"|'.*?'|“.*?”)/i);
    return `Job ${m ? m[1] : ''}: new evidence or a reply was added to the dispute case.`;
  }
  if (type === 'dispute_appealed') {
    const m = b.match(/Đơn\s*(".*?"|'.*?'|“.*?”)/i);
    return `Job ${m ? m[1] : ''} is under admin review again after an appeal.`;
  }
  if (type === 'review_appeal') {
    if (/đã được ẩn/i.test(b)) return 'The review you appealed has been hidden from the public page.';
    if (/vẫn được giữ/i.test(b)) return 'The review you appealed is still shown.';
    return 'A helper appealed a review. Please review it in the admin panel.';
  }
  if (type === 'loyalty_points_earned') {
    const m = b.match(/cộng\s*(\d+)\s*điểm/i);
    return m ? `You earned ${m[1]} loyalty points.` : 'You earned loyalty points.';
  }
  if (type === 'voucher_restored') {
    return 'Your voucher and loyalty points for the cancelled job have been restored.';
  }
  if (type === 'voucher_expiring_soon') {
    const m = b.match(/Voucher\s*(\S+)\s*sắp hết hạn.*còn\s*(\d+)\s*ngày/i);
    return m
      ? `Voucher ${m[1]} expires in ${m[2]} day(s). Use it before it expires!`
      : 'A voucher of yours is about to expire.';
  }
  if (type === 'monthly_contract_started') {
    const m = b.match(/Hợp đồng\s*(".*?"|'.*?'|“.*?”)/i);
    return `Contract ${m ? m[1] : ''} started today.`;
  }
  if (type === 'monthly_contract_expiring_soon') {
    const m = b.match(/Hợp đồng\s*(".*?"|'.*?'|“.*?”).*?vào\s*(.*?)\.?$/i);
    return `Contract ${m ? m[1] : ''} expires soon${m && m[2] ? ` on ${m[2]}` : ''}.`;
  }
  if (type === 'recurring_plan_paused') {
    const m = b.match(/Gói định kỳ\s*(".*?"|'.*?'|“.*?”)/i);
    return `Recurring plan ${m ? m[1] : ''} has been paused. You can resume it anytime.`;
  }
  if (type === 'recurring_plan_resumed') {
    const m = b.match(/Gói định kỳ\s*(".*?"|'.*?'|“.*?”)/i);
    return `Recurring plan ${m ? m[1] : ''} is active again.`;
  }
  if (type === 'recurring_plan_cancelled') {
    const m = b.match(/Gói định kỳ\s*(".*?"|'.*?'|“.*?”)/i);
    return `Recurring plan ${m ? m[1] : ''} has been cancelled.`;
  }
  if (type === 'job_private_offer') {
    return 'A private job offer has expired.';
  }
  if (type === 'sos_backup_candidate_withdrawn') {
    return 'A replacement candidate withdrew from the SOS request.';
  }


  // 2. job_confirmed (warranty & fixed price) — F11: map theo type + payload
  // trước, chỉ dùng regex bóc tiêu đề VI làm fallback cho thông báo cũ.
  if (type === 'job_confirmed' && (data?.is_sos || data?.is_warranty || data?.is_fixed_price)) {
    const jobName = data?.job_title ? `"${data.job_title}"` : 'your job';
    if (data.is_sos)
      return `A helper accepted your SOS rescue for ${jobName} and is on the way (ETA 15 minutes).`;
    if (data.is_warranty)
      return `Helper accepted warranty order ${jobName} (free of charge) and will contact you shortly.`;
    const price = data?.total_price
      ? ` at fixed price ${Number(data.total_price).toLocaleString('en-US')}₫`
      : '';
    return `Job ${jobName} has been accepted by a helper${price}.`;
  }
  const warrantyAccepted = b.match(
    /^Thợ đã nhận đơn bảo hành\s*(".*?"|'.*?'|“.*?”)\s*\(miễn phí\)\s*và sẽ liên hệ với bạn sớm\.?$/i,
  );
  if (warrantyAccepted)
    return `Helper accepted warranty order ${warrantyAccepted[1]} (free of charge) and will contact you shortly.`;

  const fixedPriceAccepted = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã có thợ nhận với giá cam kết\s*(.*?₫?)\.?$/i,
  );
  if (fixedPriceAccepted)
    return `Job ${fixedPriceAccepted[1]} has been accepted by a helper at fixed price ${fixedPriceAccepted[2]}.`;

  if (type === 'job_confirmed') {
    return 'Your job has been confirmed by the helper.';
  }

  // 3. Extra cost amendment responses
  const amendmentApproved = b.match(/^Tổng giá trị hợp đồng mới:\s*(.*?₫?)\.?$/i);
  if (amendmentApproved) return `New total contract value: ${amendmentApproved[1]}`;

  const amendmentRejected = b.match(/^Khách hàng không đồng ý khoản phát sinh\s*\((.*?)\)\.?$/i);
  if (amendmentRejected) return `Customer did not approve extra cost (${amendmentRejected[1]}).`;

  // 4. monthly_contract_accepted, _rejected, _attendance, _leave_response
  const monthlyAccepted = b.match(
    /^Hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*đã có hiệu lực từ\s*(.*?)\.?$/i,
  );
  if (monthlyAccepted)
    return `Contract ${monthlyAccepted[1]} is effective from ${monthlyAccepted[2]}.`;

  const monthlyRejected = b.match(
    /^Thợ đã từ chối hợp đồng\s*(".*?"|'.*?'|“.*?”)\.\s*Bạn có thể mời thợ khác\.?$/i,
  );
  if (monthlyRejected)
    return `Helper declined contract ${monthlyRejected[1]}. You may invite another helper.`;

  const monthlyAttConfirmed = b.match(
    /^Buổi làm ngày\s*(.*?)\s+của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s+đã được khách xác nhận có mặt\.?$/i,
  );
  if (monthlyAttConfirmed)
    return `Work session on ${monthlyAttConfirmed[1]} for contract ${monthlyAttConfirmed[2]} confirmed present by customer.`;

  const monthlyAttAbsent = b.match(
    /^Buổi làm ngày\s*(.*?)\s+của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s+đã bị khách đánh dấu vắng\.?$/i,
  );
  if (monthlyAttAbsent)
    return `Work session on ${monthlyAttAbsent[1]} for contract ${monthlyAttAbsent[2]} marked absent by customer.`;

  const monthlyLeaveApproved = b.match(
    /^Đơn xin nghỉ ngày\s*(.*?)\s+của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s+đã được khách duyệt\.?$/i,
  );
  if (monthlyLeaveApproved)
    return `Leave request on ${monthlyLeaveApproved[1]} for contract ${monthlyLeaveApproved[2]} approved by customer.`;

  const monthlyLeaveRejected = b.match(
    /^Đơn xin nghỉ ngày\s*(.*?)\s+của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s+đã bị khách từ chối\.?$/i,
  );
  if (monthlyLeaveRejected)
    return `Leave request on ${monthlyLeaveRejected[1]} for contract ${monthlyLeaveRejected[2]} declined by customer.`;

  // 5. Insurance claim reject body
  const claimRejectReason = b.match(/^Lý do:\s*(.*?)$/i);
  if (claimRejectReason) return `Reason: ${claimRejectReason[1]}`;

  // 6. Review fallback body
  const reviewFallback = b.match(/^Công việc\s*(".*?"|'.*?'|“.*?”)\.?$/i);
  if (reviewFallback) return `Job ${reviewFallback[1]}`;

  const quoteAccepted = b.match(
    /^Chúc mừng!\s*Khách hàng đã chọn báo giá của bạn cho\s*(".*?"|'.*?'|“.*?”)$/i,
  );
  if (quoteAccepted)
    return `Congratulations! The customer has selected your quote for ${quoteAccepted[1]}`;

  const quoteRejected = b.match(
    /^Khách hàng đã chọn báo giá khác cho công việc\s*(".*?"|'.*?'|“.*?”)\.?$/i,
  );
  if (quoteRejected) return `The customer has selected another quote for job ${quoteRejected[1]}`;

  if (/^Khách hàng đã chọn báo giá khác cho công việc/i.test(b)) {
    return 'The customer has selected another quote for this job.';
  }

  const custCancel = b.match(/^Khách hàng đã hủy công việc\s*(".*?"|'.*?'|“.*?”)$/i);
  if (custCancel) return `The customer has cancelled the job ${custCancel[1]}`;

  const helperCancel = b.match(/^Người giúp việc đã hủy công việc\s*(".*?"|'.*?'|“.*?”)$/i);
  if (helperCancel) return `The helper has cancelled the job ${helperCancel[1]}`;

  const adminCancel = b.match(/^Công việc\s*(".*?"|'.*?'|“.*?”)\s*đã bị hủy\.\s*Lý do:\s*(.*)$/i);
  if (adminCancel) return `Job ${adminCancel[1]} has been cancelled. Reason: ${adminCancel[2]}`;

  const newQuote = b.match(/^(.*?)\s+đã gửi báo giá cho công việc\s*(".*?"|'.*?'|“.*?”)$/i);
  if (newQuote) return `${newQuote[1]} submitted a quote for job ${newQuote[2]}`;

  const newJobWithLoc = b.match(
    /^(.*?)\s+tại\s+(.*?)\.\s*Mở mục Công việc để xem chi tiết và gửi báo giá\.?$/i,
  );
  if (newJobWithLoc)
    return `${newJobWithLoc[1]} in ${newJobWithLoc[2]}. Open Jobs tab to view details and send quote.`;

  const newJobSimple = b.match(/^(.*?)\.\s*Mở mục Công việc để xem chi tiết và gửi báo giá\.?$/i);
  if (newJobSimple) return `${newJobSimple[1]}. Open Jobs tab to view details and send quote.`;

  const newJobToast = b.match(/^(.*?)\.\s*Mở mục Công việc để xem\.?$/i);
  if (newJobToast) return `${newJobToast[1]}. Open Jobs tab to view.`;

  const privateJob = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đang ưu tiên dành cho bạn\.\s*Hãy gửi báo giá trước khi đơn mở công khai\.?$/i,
  );
  if (privateJob)
    return `Job ${privateJob[1]} is reserved for you. Please submit a quote before it opens publicly.`;

  const jobComplete = b.match(
    /^Công việc\s*(".*?"|'.*?'|“.*?”)\s*đã được hoàn thành\.\s*Vui lòng nghiệm thu\.?$/i,
  );
  if (jobComplete) return `Job ${jobComplete[1]} has been completed. Please inspect and approve.`;

  const sosEmergency = b.match(
    /^Người giúp việc của đơn\s*(".*?"|'.*?'|“.*?”)\s*gặp sự cố và không thể tiếp tục\.\s*Vui lòng chọn đổi người khác \(giữ nguyên giá\) hoặc hủy đơn \(hoàn tiền 100%\)\.?$/i,
  );
  if (sosEmergency)
    return `The helper for job ${sosEmergency[1]} had an emergency and cannot continue. Please choose a replacement helper (price unchanged) or cancel job (100% refund).`;

  const sosReplaced = b.match(
    /^Một người giúp việc khác sẽ tiếp tục đơn\s*(".*?"|'.*?'|“.*?”)\s*của bạn\.\s*Giá và số tiền đang giữ đảm bảo không thay đổi\.?$/i,
  );
  if (sosReplaced)
    return `Another helper will continue your job ${sosReplaced[1]}. Price and escrow deposit remain unchanged.`;

  const sosReleased = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã được bàn giao cho thợ khác\.\s*Bạn được giải phóng và không bị tính phạt\.?$/i,
  );
  if (sosReleased)
    return `Job ${sosReleased[1]} has been transferred to another helper. You are released without penalty.`;

  const sosCustCancelled = b.match(
    /^Khách hàng đã chọn hủy đơn\s*(".*?"|'.*?'|“.*?”)\s*sau yêu cầu SOS của bạn\.\s*Bạn không bị tính phạt cho lần hủy này\.?$/i,
  );
  if (sosCustCancelled)
    return `The customer chose to cancel job ${sosCustCancelled[1]} following your SOS request. You are not penalized.`;

  const sosAutoCancelled = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã tự động hủy do khách không phản hồi yêu cầu SOS trong thời hạn\.\s*Bạn không bị tính phạt cho lần hủy này\.?$/i,
  );
  if (sosAutoCancelled)
    return `Job ${sosAutoCancelled[1]} was auto-cancelled as customer did not respond to SOS in time. You are not penalized.`;

  const sosRefundPending = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã hủy\.\s*Khoản hoàn\s*(.*?₫?)\s*đang chờ quản trị viên đối soát ví thủ công\.?$/i,
  );
  if (sosRefundPending)
    return `Job ${sosRefundPending[1]} has been cancelled. Refund ${sosRefundPending[2]} is pending manual review by admin.`;

  const sosRefunded = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã hủy\.\s*(.*?₫?)\s*đã được hoàn vào ví của bạn\.?$/i,
  );
  if (sosRefunded)
    return `Job ${sosRefunded[1]} has been cancelled. ${sosRefunded[2]} was refunded to your wallet.`;

  const sosPolicyCancel = b.match(/^Đơn\s*(".*?"|'.*?'|“.*?”)\s*đã hủy theo chính sách SOS\.?$/i);
  if (sosPolicyCancel) return `Job ${sosPolicyCancel[1]} has been cancelled under SOS policy.`;

  const sosRetracted = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*vẫn tiếp tục với người giúp việc hiện tại như bình thường\.?$/i,
  );
  if (sosRetracted) return `Job ${sosRetracted[1]} continues with the current helper as normal.`;

  const sosBackupInvite = b.match(
    /^Có đơn SOS\s*(".*?"|'.*?'|“.*?”)\s*tại\s*(.*?)\s*đang cần bạn hỗ trợ thay thế\.\s*Thu nhập:\s*(.*?)\.?$/i,
  );
  if (sosBackupInvite) {
    return `Emergency SOS job ${sosBackupInvite[1]} at ${sosBackupInvite[2]} needs your replacement support. Payout: ${sosBackupInvite[3]}.`;
  }

  const sosNotFound = b.match(
    /^Hiện chưa có người giúp việc khác nhận thay đơn\s*(".*?"|'.*?'|“.*?”)\.\s*Đội ngũ hỗ trợ sẽ liên hệ để xử lý tiếp\.?$/i,
  );
  if (sosNotFound)
    return `Currently no helper has accepted to replace job ${sosNotFound[1]}. Support team will contact you.`;

  const sosNoMatch = b.match(
    /^Khách hàng đã đồng ý đổi người nhưng hệ thống chưa tìm được thợ thay thế phù hợp cho đơn\s*(".*?"|'.*?'|“.*?”)\.\s*Đội ngũ hỗ trợ sẽ liên hệ với khách để hỗ trợ tiếp\.?$/i,
  );
  if (sosNoMatch)
    return `Customer agreed to replacement but system has not found a suitable helper for job ${sosNoMatch[1]}. Support will contact customer.`;

  const sosDecisionWait = b.match(
    /^Người giúp việc của đơn\s*(".*?"|'.*?'|“.*?”)\s*đang chờ bạn chọn đổi người hoặc hủy đơn\.\s*Nếu quá hạn, hệ thống sẽ tự hủy đơn và hoàn tiền 100%\.?$/i,
  );
  if (sosDecisionWait)
    return `The helper for job ${sosDecisionWait[1]} is waiting for your decision to replace or cancel. If expired, the job will be cancelled with 100% refund.`;

  const sosExpiredAdmin = b.match(
    /^Đơn\s*(".*?"|'.*?'|“.*?”)\s*\(SOS của thợ\s*(.*?)\)\s*không tìm được người thay\.\s*Khách:\s*(.*?)\.?$/i,
  );
  if (sosExpiredAdmin)
    return `Job ${sosExpiredAdmin[1]} (SOS by helper ${sosExpiredAdmin[2]}) found no replacement. Customer: ${sosExpiredAdmin[3]}.`;

  const sosBroadcastWithLoc = b.match(/^(.*?)\s+tại\s+(.*?)\.\s*Phụ phí SOS:\s*\+(.*?)$/i);
  if (sosBroadcastWithLoc)
    return `${sosBroadcastWithLoc[1]} in ${sosBroadcastWithLoc[2]}. SOS surcharge: +${sosBroadcastWithLoc[3]}`;

  const sosBroadcastSimple = b.match(/^(.*?)\.\s*Phụ phí SOS:\s*\+(.*?)$/i);
  if (sosBroadcastSimple)
    return `${sosBroadcastSimple[1]}. SOS surcharge: +${sosBroadcastSimple[2]}`;

  if (/^Thợ đang chuẩn bị đồ nghề và di chuyển gấp đến bạn \(Dự kiến 15 phút\)\.?$/i.test(b)) {
    return 'Helper is preparing tools and travelling urgently to you (ETA 15 mins).';
  }
  if (/^Người giúp việc đang di chuyển đến nơi của bạn\.?$/i.test(b)) {
    return 'Helper is travelling to your location.';
  }
  if (/^Người giúp việc đã có mặt tại địa điểm của bạn\.?$/i.test(b)) {
    return 'Helper has arrived at your location.';
  }
  if (/^Bạn đã có thể bật trạng thái sẵn sàng và gửi báo giá cho khách hàng\.?$/i.test(b)) {
    return 'You can now toggle availability and submit quotes to customers.';
  }
  const kycReject = b.match(/^Lý do:\s*(.*?)\.\s*Vui lòng cập nhật và nộp lại hồ sơ\.?$/i);
  if (kycReject) return `Reason: ${kycReject[1]}. Please update and resubmit your profile.`;

  const refundBody = b.match(
    /^Bạn đã nhận được khoản hoàn tiền\s*(.*?₫?)\s*cho đơn hàng\s*#([a-zA-Z0-9]+)\.?$/i,
  );
  if (refundBody) return `You received a refund of ${refundBody[1]} for order #${refundBody[2]}.`;

  const withdrawSuccess = b.match(/^(.*?₫?)\s*đã được chuyển về tài khoản ngân hàng của bạn\.?$/i);
  if (withdrawSuccess) return `${withdrawSuccess[1]} has been transferred to your bank account.`;

  const withdrawFailReason = b.match(/^(.*?₫?)\s*đã được hoàn lại vào ví\.\s*Lý do:\s*(.*?)$/i);
  if (withdrawFailReason)
    return `${withdrawFailReason[1]} was refunded to your wallet. Reason: ${withdrawFailReason[2]}`;

  const withdrawFail = b.match(/^(.*?₫?)\s*đã được hoàn lại vào ví\.?$/i);
  if (withdrawFail) return `${withdrawFail[1]} was refunded to your wallet.`;

  const extraSupply = b.match(
    /^Thợ đề xuất bổ sung\s*\+([0-9.,]+₫?)\s*cho\s*(".*?"|'.*?'|“.*?”)\.\s*Lý do:\s*(.*)$/i,
  );
  if (extraSupply)
    return `Helper proposed an additional +${extraSupply[1]} for ${extraSupply[2]}. Reason: ${extraSupply[3]}`;

  const disputeWait = b.match(
    /^Công việc\s*(".*?"|'.*?'|“.*?”)\s*đã chuyển sang trạng thái chờ Admin phân xử\.\s*Lý do:\s*(.*)$/i,
  );
  if (disputeWait)
    return `Job ${disputeWait[1]} is now awaiting Admin dispute resolution. Reason: ${disputeWait[2]}`;

  const disputeResult = b.match(/^Đơn\s*(".*?"|'.*?'|“.*?”):\s*(.*)$/i);
  if (disputeResult) return `Job ${disputeResult[1]}: ${disputeResult[2]}`;

  if (/^Đội ngũ Green House đang xem xét hồ sơ bồi thường của bạn\.?$/i.test(b)) {
    return 'Green House team is reviewing your insurance claim.';
  }
  const claimApproved = b.match(
    /^Yêu cầu bồi thường cho đơn\s*#([a-zA-Z0-9]+)\s*đã được duyệt:\s*(.*?₫?)\s*đã cộng vào ví của bạn\.?$/i,
  );
  if (claimApproved)
    return `Claim for order #${claimApproved[1]} was approved: ${claimApproved[2]} credited to your wallet.`;

  const teamInvite = b.match(
    /^Bạn được mời tham gia đơn\s*(".*?"|'.*?'|“.*?”)\s*với tỉ lệ chia tiền công\s*(\d+%?)\.?$/i,
  );
  if (teamInvite)
    return `You are invited to join job ${teamInvite[1]} with wage share of ${teamInvite[2]}.`;

  const monthlyOffer = b.match(
    /^Khách hàng mời bạn làm giúp việc theo tháng:\s*(".*?"|'.*?'|“.*?”)\s*[—–-]\s*lương\s*(.*?)\/tháng\.\s*Mở app để xem và phản hồi\.?$/i,
  );
  if (monthlyOffer)
    return `Customer invited you for monthly contract: ${monthlyOffer[1]} — salary ${monthlyOffer[2]}/month. Open app to respond.`;

  const monthlyCancel = b.match(/^Hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*đã bị hủy\.?$/i);
  if (monthlyCancel) return `Monthly contract ${monthlyCancel[1]} has been cancelled.`;

  const monthlyEnded = b.match(/^Hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*đã kết thúc(?::\s*(.*))?\.?$/i);
  if (monthlyEnded)
    return `Monthly contract ${monthlyEnded[1]} has ended${monthlyEnded[2] ? `: ${monthlyEnded[2]}` : ''}.`;

  const monthlyCheckin = b.match(
    /^Thợ của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*đã điểm danh ngày\s*(.*?)\.\s*Vui lòng xác nhận buổi làm\.?$/i,
  );
  if (monthlyCheckin)
    return `Helper of contract ${monthlyCheckin[1]} checked in on ${monthlyCheckin[2]}. Please confirm work session.`;

  const monthlyLeave = b.match(
    /^Thợ của hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*xin nghỉ ngày\s*(.*?):\s*(.*)$/i,
  );
  if (monthlyLeave)
    return `Helper of contract ${monthlyLeave[1]} requested leave on ${monthlyLeave[2]}: ${monthlyLeave[3]}`;

  const monthlySalary = b.match(
    /^Hợp đồng\s*(".*?"|'.*?'|“.*?”):\s*(\d+\/\d+)\s*buổi\s*[—–-]\s*bạn nhận\s*(.*?₫?)\s*vào ví\.?$/i,
  );
  if (monthlySalary)
    return `Contract ${monthlySalary[1]}: ${monthlySalary[2]} sessions — you received ${monthlySalary[3]} into wallet.`;

  if (/^Một khách hàng vừa đăng công việc phù hợp\.?$/i.test(b))
    return 'A customer just posted a matching job.';
  if (/^Một thợ vừa gửi báo giá\.?$/i.test(b)) return 'A helper just submitted a quote.';
  if (/^Bạn có tin nhắn mới từ đối tác\.?$/i.test(b)) return 'You have a new message from partner';
  if (/^Đã có thợ nhận đơn của bạn\. Mở đơn hàng để xem thông tin và theo dõi\.?$/i.test(b)) {
    return 'A helper has accepted your order. Open order to view details and track.';
  }
  if (/^Khách hàng đã chọn báo giá của bạn\. Mở đơn để xem hợp đồng\.?$/i.test(b)) {
    return 'The customer has accepted your quote. Open order to view details.';
  }

  return body;
}

// ─── Transaction Description Localization Mapping (Điểm 4) ────────────────────
export function formatTransactionDescription(
  desc: string | undefined | null,
  lang: AppLanguage = 'vi',
): string {
  if (!desc) return '';
  if (lang !== 'en') return desc;
  const d = desc.trim();

  const feeMatch = d.match(/^Khấu trừ phí sàn\s*\(([^)]+)\)\s*đơn Tiền mặt\s*#([a-zA-Z0-9]+)$/i);
  if (feeMatch) return `Platform fee (${feeMatch[1]}) deducted for Cash job #${feeMatch[2]}`;

  const incomeMatch = d.match(/^Thu nhập từ công việc\s*#([a-zA-Z0-9]+)$/i);
  if (incomeMatch) return `Income from job #${incomeMatch[1]}`;

  const topupMatch = d.match(/^Nạp tiền ví ký quỹ qua\s*([a-zA-Z0-9_]+)$/i);
  if (topupMatch) return `Deposit wallet top-up via ${topupMatch[1]}`;

  const payMatch = d.match(/^Thanh toán cho công việc\s*#([a-zA-Z0-9]+)\s*\(([^)]+)\)(.*)$/i);
  if (payMatch) {
    let suffix = payMatch[3] || '';
    suffix = suffix.replace(
      /—\s*đã áp mã\s*(\S+)\s*giảm\s*([^—]+)/gi,
      '— applied voucher $1 discount $2',
    );
    suffix = suffix.replace(
      /—\s*đổi\s*(\d+)\s*điểm\s*giảm\s*([^—]+)/gi,
      '— redeemed $1 points discount $2',
    );
    return `Payment for job #${payMatch[1]} (${payMatch[2]})${suffix}`;
  }

  const disputeRefund = d.match(/^Hoàn tiền khiếu nại công việc\s*#([a-zA-Z0-9]+):\s*(.*)$/i);
  if (disputeRefund) return `Dispute refund for job #${disputeRefund[1]}: ${disputeRefund[2]}`;

  const adminRefund = d.match(/^Admin hoàn tiền trực tiếp cho đơn\s*#([a-zA-Z0-9]+):\s*(.*)$/i);
  if (adminRefund) return `Admin direct refund for job #${adminRefund[1]}: ${adminRefund[2]}`;

  if (/^Yêu cầu rút tiền$/i.test(d)) return 'Withdrawal request';
  if (/^Hoàn tiền rút thất bại$/i.test(d)) return 'Failed withdrawal refund';

  const salaryMatch = d.match(
    /^Lương tháng\s*(\S+)\s*[—–-]\s*hợp đồng\s*(".*?"|'.*?'|“.*?”)\s*\((.*?)\s*buổi,\s*đã trừ phí sàn\s*([^)]+)\)$/i,
  );
  if (salaryMatch)
    return `Salary for month ${salaryMatch[1]} — contract ${salaryMatch[2]} (${salaryMatch[3]} sessions, after ${salaryMatch[4]} platform fee)`;

  return desc;
}
