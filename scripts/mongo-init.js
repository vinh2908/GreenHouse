// MongoDB initialization script — HomeMate (Vua Thợ model)
// Runs on first container startup

db = db.getSiblingDB('homemate');

// Create app user
db.createUser({
  user: 'homemate_user',
  pwd: 'homemate_pass',
  roles: [{ role: 'readWrite', db: 'homemate' }],
});

// ─── Collections ──────────────────────────────────────────────────────────────
db.createCollection('users');
db.createCollection('customer_profiles');
db.createCollection('helper_profiles');
db.createCollection('service_categories');
db.createCollection('services');
db.createCollection('jobs'); // thay booking
db.createCollection('quotes'); // báo giá từ helpers
db.createCollection('contracts'); // hợp đồng số
db.createCollection('wallets');
db.createCollection('transactions');
db.createCollection('withdrawals');
db.createCollection('reviews');
db.createCollection('notifications');
db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('promotions');
db.createCollection('disputes');

// ─── Seed: Service Categories ─────────────────────────────────────────────────
const categories = db.service_categories.insertMany([
  {
    name: 'Giúp việc theo giờ',
    slug: 'giup-viec-theo-gio',
    description: 'Dịch vụ giúp việc linh hoạt theo giờ',
    icon: 'clock',
    status: 'active',
    sort_order: 1,
    created_at: new Date(),
  },
  {
    name: 'Giúp việc theo ngày',
    slug: 'giup-viec-theo-ngay',
    description: 'Dịch vụ giúp việc trọn ngày',
    icon: 'calendar',
    status: 'active',
    sort_order: 2,
    created_at: new Date(),
  },
  {
    name: 'Tổng vệ sinh nhà',
    slug: 'tong-ve-sinh-nha',
    description: 'Vệ sinh toàn diện căn nhà, bao gồm tủ, bếp, phòng tắm',
    icon: 'home',
    status: 'active',
    sort_order: 3,
    created_at: new Date(),
  },
  {
    name: 'Giúp việc định kỳ',
    slug: 'giup-viec-dinh-ky',
    description: 'Lên lịch giúp việc hàng tuần hoặc hàng tháng',
    icon: 'repeat',
    status: 'active',
    sort_order: 4,
    created_at: new Date(),
  },
  {
    name: 'Nấu ăn gia đình',
    slug: 'nau-an-gia-dinh',
    description: 'Dịch vụ nấu bữa ăn cho gia đình',
    icon: 'chef-hat',
    status: 'active',
    sort_order: 5,
    created_at: new Date(),
  },
]);

const catIds = categories.insertedIds;

// ─── Seed: Services ──────────────────────────────────────────────────────────
// Lưu ý: KHÔNG có giá cố định — helper tự báo giá
// price_range_min/max chỉ là gợi ý thị trường
db.services.insertMany([
  {
    category_id: catIds[0],
    name: 'Giúp việc theo giờ',
    slug: 'giup-viec-theo-gio',
    description:
      'Thuê người giúp việc theo số giờ bạn cần. Phù hợp dọn dẹp nhanh, chuẩn bị bữa tiệc hoặc công việc đột xuất.',
    icon: 'clock',
    status: 'active',
    price_range_min: 50000, // 50k/giờ
    price_range_max: 120000, // 120k/giờ
    estimated_duration_min: 2,
    estimated_duration_max: 8,
    platform_fee_percent: 15,
    requires_site_visit: false,
    allows_video_upload: true,
    tags: ['giup-viec', 'theo-gio', 'linh-hoat'],
    keywords: ['giúp việc', 'dọn nhà', 'theo giờ'],
    total_jobs: 0,
    total_helpers: 0,
    avg_rating: 0,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    category_id: catIds[1],
    name: 'Giúp việc theo ngày',
    slug: 'giup-viec-theo-ngay',
    description:
      'Thuê người giúp việc trọn ngày (8 tiếng). Lý tưởng cho dọn dẹp tổng thể hoặc chuyển nhà.',
    icon: 'calendar-day',
    status: 'active',
    price_range_min: 350000,
    price_range_max: 700000,
    estimated_duration_min: 8,
    estimated_duration_max: 10,
    platform_fee_percent: 15,
    requires_site_visit: false,
    allows_video_upload: true,
    tags: ['giup-viec', 'theo-ngay', 'tron-ngay'],
    keywords: ['giúp việc', 'dọn nhà', 'theo ngày', 'trọn ngày'],
    total_jobs: 0,
    total_helpers: 0,
    avg_rating: 0,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    category_id: catIds[2],
    name: 'Tổng vệ sinh nhà',
    slug: 'tong-ve-sinh-nha',
    description:
      'Vệ sinh toàn diện: lau kính, dọn tủ, cọ bếp, vệ sinh phòng tắm, hút bụi thảm. Ảnh hiện trạng giúp báo giá chính xác hơn.',
    icon: 'sparkles',
    status: 'active',
    price_range_min: 500000,
    price_range_max: 3000000,
    estimated_duration_min: 4,
    estimated_duration_max: 16,
    platform_fee_percent: 20,
    requires_site_visit: false,
    allows_video_upload: true,
    tags: ['ve-sinh', 'tong-ve-sinh', 'don-dep'],
    keywords: ['tổng vệ sinh', 'dọn dẹp', 'vệ sinh nhà', 'lau kính'],
    total_jobs: 0,
    total_helpers: 0,
    avg_rating: 0,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    category_id: catIds[3],
    name: 'Giúp việc định kỳ',
    slug: 'giup-viec-dinh-ky',
    description:
      'Đặt lịch giúp việc hàng tuần hoặc hàng tháng với người giúp việc quen thuộc. Giá ưu đãi hơn theo hợp đồng dài hạn.',
    icon: 'calendar-repeat',
    status: 'active',
    price_range_min: 40000, // giá/giờ ưu đãi hơn
    price_range_max: 100000,
    estimated_duration_min: 2,
    estimated_duration_max: 8,
    platform_fee_percent: 15,
    requires_site_visit: false,
    allows_video_upload: false,
    tags: ['dinh-ky', 'hang-tuan', 'hang-thang'],
    keywords: ['giúp việc định kỳ', 'hàng tuần', 'hàng tháng', 'dài hạn'],
    total_jobs: 0,
    total_helpers: 0,
    avg_rating: 0,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    category_id: catIds[4],
    name: 'Nấu ăn gia đình',
    slug: 'nau-an-gia-dinh',
    description:
      'Thuê người nấu bữa ăn tại nhà. Có thể chỉ định món ăn hoặc để người nấu tự lên thực đơn theo ngân sách.',
    icon: 'chef-hat',
    status: 'active',
    price_range_min: 80000,
    price_range_max: 200000,
    estimated_duration_min: 1,
    estimated_duration_max: 4,
    platform_fee_percent: 15,
    requires_site_visit: false,
    allows_video_upload: false,
    tags: ['nau-an', 'bep', 'thuc-pham'],
    keywords: ['nấu ăn', 'đầu bếp', 'nấu cơm', 'thực đơn'],
    total_jobs: 0,
    total_helpers: 0,
    avg_rating: 0,
    created_at: new Date(),
    updated_at: new Date(),
  },
]);

// ─── Indexes ─────────────────────────────────────────────────────────────────
db.users.createIndex({ phone: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { sparse: true });

db.helper_profiles.createIndex({ user_id: 1 }, { unique: true });
db.helper_profiles.createIndex({ location: '2dsphere' });
db.helper_profiles.createIndex({ status: 1, verification_status: 1 });

db.jobs.createIndex({ customer_id: 1, status: 1 });
db.jobs.createIndex({ helper_id: 1, status: 1 });
db.jobs.createIndex({ 'address.location': '2dsphere' });
db.jobs.createIndex({ status: 1, created_at: -1 });
db.jobs.createIndex({ status: 1, expires_at: 1 });

db.quotes.createIndex({ job_id: 1, helper_id: 1 }, { unique: true });
db.quotes.createIndex({ job_id: 1, status: 1 });
db.quotes.createIndex({ helper_id: 1, status: 1 });

db.conversations.createIndex({ participants: 1 });
db.messages.createIndex({ conversation_id: 1, created_at: -1 });
db.notifications.createIndex({ user_id: 1, is_read: 1, created_at: -1 });

print('✅ MongoDB HomeMate initialized successfully!');
print('✅ Collections: ' + db.getCollectionNames().join(', '));
