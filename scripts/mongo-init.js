// MongoDB initialization script
// Runs on first container startup

db = db.getSiblingDB('homemate');

// Create app user with limited permissions
db.createUser({
  user: 'homemate_user',
  pwd: 'homemate_pass',
  roles: [{ role: 'readWrite', db: 'homemate' }],
});

// Create initial collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['phone', 'full_name', 'password_hash'],
      properties: {
        phone: { bsonType: 'string' },
        full_name: { bsonType: 'string' },
        password_hash: { bsonType: 'string' },
      },
    },
  },
});

db.createCollection('service_categories');
db.createCollection('services');
db.createCollection('bookings');
db.createCollection('helper_profiles');
db.createCollection('customer_profiles');
db.createCollection('wallets');
db.createCollection('transactions');
db.createCollection('notifications');
db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('reviews');
db.createCollection('promotions');
db.createCollection('disputes');

// Seed service categories for MVP
db.service_categories.insertMany([
  {
    name: 'Giúp việc theo giờ',
    slug: 'giup-viec-theo-gio',
    description: 'Dịch vụ giúp việc theo giờ linh hoạt',
    icon: 'clock',
    status: 'active',
    sort_order: 1,
    created_at: new Date(),
  },
  {
    name: 'Giúp việc theo ngày',
    slug: 'giup-viec-theo-ngay',
    description: 'Dịch vụ giúp việc cả ngày',
    icon: 'calendar',
    status: 'active',
    sort_order: 2,
    created_at: new Date(),
  },
  {
    name: 'Tổng vệ sinh nhà',
    slug: 'tong-ve-sinh-nha',
    description: 'Vệ sinh toàn bộ căn nhà',
    icon: 'home',
    status: 'active',
    sort_order: 3,
    created_at: new Date(),
  },
  {
    name: 'Giúp việc định kỳ',
    slug: 'giup-viec-dinh-ky',
    description: 'Lên lịch giúp việc định kỳ hàng tuần/tháng',
    icon: 'repeat',
    status: 'active',
    sort_order: 4,
    created_at: new Date(),
  },
  {
    name: 'Nấu ăn gia đình',
    slug: 'nau-an-gia-dinh',
    description: 'Dịch vụ nấu ăn cho gia đình',
    icon: 'chef',
    status: 'active',
    sort_order: 5,
    created_at: new Date(),
  },
]);

print('MongoDB initialization completed successfully!');
