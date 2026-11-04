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
    vi: 'Trung tâm trợ giúp Green House (24/7)',
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
  settings_section: { vi: 'Cài đặt hiển thị', en: 'Display Settings' },
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
  messages_photo: { vi: '📷 Ảnh', en: '📷 Photo' },
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
  home_nearby_helpers_sub: {
    vi: 'Sẵn sàng nhận việc và có mặt nhanh chóng',
    en: 'Ready to take jobs and arrive quickly',
  },
  home_vouchers_title: { vi: 'Ưu đãi dành cho bạn', en: 'Offers for you' },
  home_vouchers_sub: {
    vi: 'Mã giảm giá dịch vụ Green House',
    en: 'Green House service discount codes',
  },
  home_all_services_title: { vi: 'Dịch vụ', en: 'Services' },
  home_all_services_sub: {
    vi: 'Chọn dịch vụ gia đình bạn cần phục vụ hôm nay',
    en: 'Choose the home service you need today',
  },
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
  home_call_now: { vi: 'Gọi thợ ngay', en: 'Call helper' },
  home_choose_service: { vi: 'Chọn dịch vụ này', en: 'Select service' },

  // ─── Profile Extra ────────────────────────────────────────────────────────
  profile_title: { vi: 'Hồ sơ & Tài khoản', en: 'Profile & Account' },
  profile_title_helper: { vi: 'Hồ sơ thợ', en: 'Helper Profile' },
  profile_emergency_contact: { vi: 'Liên hệ khẩn cấp', en: 'Emergency contact' },
  profile_permissions: { vi: 'Quyền ứng dụng', en: 'App permissions' },
  profile_open_settings: { vi: 'Mở Cài đặt', en: 'Open Settings' },
  profile_status_granted: { vi: 'Đã cấp', en: 'Granted' },
  profile_status_denied: { vi: 'Chưa cấp', en: 'Not granted' },

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
  badge_urgent: { vi: 'Khẩn cấp', en: 'Urgent' },

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
  home_ai_callout_title: { vi: 'Không biết thuộc dịch vụ nào?', en: 'Not sure which service you need?' },
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
  home_quick_price_title: { vi: 'Giá bạn muốn trả (giá mở đầu để deal)', en: 'Your target price (starting offer)' },
  home_quick_time_title: { vi: 'Thời gian làm việc', en: 'Working time' },
  home_quick_calendar_hint: { vi: 'Bấm để mở lịch tháng trong bottom sheet', en: 'Tap to open monthly calendar sheet' },
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
  home_benefit_escrow_sub: { vi: 'Chỉ trả khi bạn nghiệm thu xong', en: 'Pay only upon satisfaction' },

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
  picker_err_past_time: { vi: '⚠️ Thời điểm bắt đầu không thể ở quá khứ', en: '⚠️ Start time cannot be in the past' },
  picker_err_end_before_start: { vi: '⚠️ Giờ kết thúc phải lớn hơn giờ bắt đầu', en: '⚠️ End time must be after start time' },
  picker_chips_instruction: { vi: 'bấm là chọn đúng giờ đó', en: 'tap to select exact time' },
  picker_no_chips: { vi: 'Hôm nay đã hết khung giờ gợi ý', en: 'No suggested times left today' },
  picker_select_hour: { vi: 'Chọn Giờ (00 - 23)', en: 'Select Hour (00 - 23)' },
  picker_select_minute: { vi: 'Chọn Phút (00 - 59)', en: 'Select Minute (00 - 59)' },
  picker_duration_title: { vi: 'Thời lượng dự kiến', en: 'Estimated duration' },
  picker_duration_sub: { vi: 'Bấm để chọn số giờ và phút theo ý bạn', en: 'Tap to select hours and minutes' },
  picker_preview_title: { vi: 'Lịch dự kiến', en: 'Schedule preview' },
  picker_date_label: { vi: 'Ngày:', en: 'Date:' },
  picker_time_slot_label: { vi: 'Khung giờ:', en: 'Time frame:' },
  picker_duration_label: { vi: 'Thời lượng:', en: 'Duration:' },
  picker_deal_price: { vi: 'Giá deal:', en: 'Deal price:' },
  picker_next_day: { vi: '(ngày hôm sau)', en: '(next day)' },
  picker_cannot_calc: { vi: 'Chưa tính được', en: 'Unavailable' },
  picker_close: { vi: 'Đóng', en: 'Close' },

  // ─── SOS Backup & Decision Popups ──────────────────────────────────────────
  sos_popup_title: { vi: 'YÊU CẦU NHẬN THAY SOS', en: 'SOS BACKUP REQUEST' },
  sos_popup_desc: {
    vi: 'Thợ trước không thể tiếp tục công việc này. Bạn có muốn nhận thay không?',
    en: 'The previous helper cannot continue this job. Would you like to take over?',
  },
  sos_popup_service_fallback: { vi: 'Dịch vụ tại nhà', en: 'Home service' },
  sos_popup_area: { vi: '📍 Khu vực:', en: '📍 Area:' },
  sos_popup_distance: { vi: '🚗 Cách bạn khoảng {dist} km', en: '🚗 About {dist} km from you' },
  sos_popup_payout: { vi: '💰 Thực nhận:', en: '💰 Net payout:' },
  sos_popup_accept: { vi: '⚡ Nhận thay ngay', en: '⚡ Accept takeover' },
  sos_popup_skip: { vi: 'Bỏ qua', en: 'Skip' },
  sos_popup_auto_skip: { vi: 'Tự động bỏ qua sau {sec}s', en: 'Auto skip in {sec}s' },
  sos_popup_accepted_success: { vi: 'Bạn đã nhận thay đơn này!', en: 'You accepted this takeover!' },
  sos_popup_accepted_sub: { vi: 'Hãy di chuyển đến khách hàng như đơn thường', en: 'Please travel to customer like a standard job' },
  sos_popup_already_taken: { vi: 'Đã có người khác nhận đơn này rồi', en: 'Another helper has already taken this job' },

  sos_customer_popup_title: { vi: 'SỰ CỐ ĐƠN HÀNG SOS', en: 'SOS ORDER INCIDENT' },
  sos_customer_popup_reason_prefix: { vi: 'không thể tiếp tục vì:', en: 'cannot continue due to:' },
  sos_customer_popup_reason_suffix: { vi: '. Bạn muốn xử lý thế nào?', en: '. How would you like to proceed?' },
  sos_customer_popup_replace_desc: {
    vi: '🔄 Đổi người: một thợ khác sẽ tiếp tục đơn - giá và số tiền giữ đảm bảo không thay đổi.',
    en: '🔄 Replace helper: another helper will take over - guaranteed price and escrow deposit remain unchanged.',
  },
  sos_customer_popup_cancel_desc: {
    vi: '❌ Hủy đơn: hoàn 100% số tiền bạn đã thực trả (sau voucher và điểm) vào ví. Đơn chưa thanh toán hoặc trả tiền mặt sẽ không phát sinh hoàn tiền ví.',
    en: '❌ Cancel order: 100% refund of your actual paid amount (after vouchers and points) to wallet. Unpaid or cash orders have no wallet refund.',
  },
  sos_customer_popup_accept_btn: { vi: '🔄 Chấp nhận đổi người', en: '🔄 Accept replacement helper' },
  sos_customer_popup_cancel_btn: { vi: 'Hủy đơn - hoàn tiền thực trả', en: 'Cancel order - refund paid amount' },

  // ─── In-app Voice Call ─────────────────────────────────────────────────────
  call_incoming_title: { vi: 'Cuộc gọi đến', en: 'Incoming call' },
  call_incoming_sub: { vi: 'Đối tác đang gọi cho bạn', en: 'Partner is calling you' },
  call_incoming_sub_job: { vi: 'Đơn {job} — đối tác đang gọi cho bạn', en: 'Job {job} — partner is calling you' },
  call_decline: { vi: 'Từ chối', en: 'Decline' },
  call_answer: { vi: 'Trả lời', en: 'Answer' },
  call_state_preparing: { vi: 'Đang chuẩn bị kết nối...', en: 'Preparing connection...' },
  call_state_connecting: { vi: 'Đang kết nối...', en: 'Connecting...' },
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
  perm_open_settings_desc: { vi: 'Mở Cài đặt hệ thống để thay đổi quyền', en: 'Open system settings to change permissions' },
  perm_notifications_title: { vi: 'Thông báo đẩy', en: 'Push notifications' },
  perm_notifications_desc: { vi: 'Nhận thông báo khi có đơn mới, báo giá hoặc tin nhắn', en: 'Get notified for new jobs, quotes or messages' },
  perm_location_title: { vi: 'Vị trí & GPS', en: 'Location & GPS' },
  perm_location_desc: { vi: 'Tìm thợ xung quanh và hiển thị khoảng cách di chuyển', en: 'Find nearby helpers and show travel distance' },
  perm_camera_title: { vi: 'Máy ảnh', en: 'Camera' },
  perm_camera_desc: { vi: 'Chụp ảnh hiện trường công việc và giấy tờ xác thực KYC', en: 'Capture job photos and KYC verification IDs' },
  perm_microphone_title: { vi: 'Micro thoại', en: 'Microphone' },
  perm_microphone_desc: { vi: 'Gọi điện liên lạc miễn phí che số giữa khách và thợ', en: 'Free masked calling between customers and helpers' },
  perm_photos_title: { vi: 'Thư viện ảnh', en: 'Photo library' },
  perm_photos_desc: { vi: 'Tải ảnh từ máy để gửi tin nhắn hoặc cập nhật ảnh đại diện', en: 'Upload photos for chat or profile avatars' },

  // ─── Common general strings ────────────────────────────────────────────────
  common_back: { vi: 'Quay lại', en: 'Back' },
  common_close: { vi: 'Đóng', en: 'Close' },
  common_confirm: { vi: 'Xác nhận', en: 'Confirm' },
  common_cancel: { vi: 'Hủy', en: 'Cancel' },
  common_yesterday: { vi: 'Hôm qua', en: 'Yesterday' },
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
