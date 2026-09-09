import mongoose from 'mongoose';

// Mã hash bcrypt chuẩn của "123456" (salt rounds 10)
const PASSWORD_HASH_123456 = '$2b$10$epRzVl.X3fI4xL2KkWZzOuQY0e1M21V8O.WwM4n3N8e5P0w7Z4q6i';

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  // 1. Seed Services
  const servicesCollection = db.collection('services');
  await servicesCollection.deleteMany({});

  const services = [
    {
      name: 'Giúp việc theo giờ',
      slug: 'housekeeping_hourly',
      icon: '🧹',
      description: 'Dọn dẹp phòng khách, phòng ngủ, lau sàn, rửa chén bát, đổ rác theo yêu cầu',
      base_price_min: 60000,
      base_price_max: 90000,
      pricing_unit: 'hour',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Tổng vệ sinh nhà cửa',
      slug: 'deep_cleaning',
      icon: '✨',
      description: 'Tổng vệ sinh toàn bộ nhà, căn hộ mới xây dựng, chà sàn công nghiệp, lau kính',
      base_price_min: 800000,
      base_price_max: 2500000,
      pricing_unit: 'job',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Sửa điện gia dụng',
      slug: 'electrician',
      icon: '⚡',
      description: 'Sửa chập điện, thay công tắc, ổ cắm, lắp đèn chiếu sáng, đi dây điện an toàn',
      base_price_min: 150000,
      base_price_max: 500000,
      pricing_unit: 'job',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Sửa ống nước & Thông cống',
      slug: 'plumbing',
      icon: '🚰',
      description: 'Thông tắc bồn cầu, chậu rửa, rò rỉ đường ống nước, thay vòi sen, phao bồn',
      base_price_min: 150000,
      base_price_max: 600000,
      pricing_unit: 'job',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Vệ sinh & Bơm gas máy lạnh',
      slug: 'ac_repair',
      icon: '❄️',
      description: 'Vệ sinh lưới lọc, xịt rửa dàn lạnh, dàn nóng, đo áp suất gas và nạp gas chuẩn',
      base_price_min: 150000,
      base_price_max: 350000,
      pricing_unit: 'device',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Nấu ăn gia đình',
      slug: 'cooking',
      icon: '🍳',
      description: 'Đi chợ, chuẩn bị nguyên liệu và nấu các bữa cơm gia đình thơm ngon, vệ sinh',
      base_price_min: 80000,
      base_price_max: 150000,
      pricing_unit: 'hour',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Sửa máy giặt & Tủ lạnh',
      slug: 'appliance',
      icon: '🧺',
      description: 'Sửa máy giặt không vắt, tủ lạnh không đông đá, kêu to, thay linh kiện chính hãng',
      base_price_min: 200000,
      base_price_max: 800000,
      pricing_unit: 'device',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Sửa khóa & Lắp Camera',
      slug: 'locksmith',
      icon: '🔑',
      description: 'Mở khóa cửa, làm chìa mới, lắp đặt hệ thống Camera giám sát an ninh gia đình',
      base_price_min: 150000,
      base_price_max: 1000000,
      pricing_unit: 'job',
      platform_fee_percent: 15,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const insertedServices = await servicesCollection.insertMany(services);
  console.log('Seeded', insertedServices.insertedCount, 'services');

  // 2. Seed Users
  const usersCollection = db.collection('users');
  const helperProfilesCollection = db.collection('helperprofiles');
  const walletsCollection = db.collection('wallets');

  const passwordHash = PASSWORD_HASH_123456;

  // Customer: Chị Mai
  const customerDoc = {
    phone: '0901111111',
    full_name: 'Chị Mai (Khách hàng Quận 1)',
    password_hash: passwordHash,
    roles: ['customer'],
    active_role: 'customer',
    status: 'active',
    is_verified: true,
    is_phone_verified: true,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await usersCollection.deleteOne({ phone: '0901111111' });
  const customer = await usersCollection.insertOne(customerDoc);
  console.log('Customer created with ID:', customer.insertedId);

  // Helper: Anh Tuấn (Thợ chuyên nghiệp)
  const helperDoc = {
    phone: '0902222222',
    full_name: 'Anh Tuấn (Thợ Điện Nước)',
    password_hash: passwordHash,
    roles: ['helper', 'customer'],
    active_role: 'helper',
    status: 'active',
    is_verified: true,
    is_phone_verified: true,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await usersCollection.deleteOne({ phone: '0902222222' });
  const helper = await usersCollection.insertOne(helperDoc);
  console.log('Helper created with ID:', helper.insertedId);

  // Helper Profile
  await helperProfilesCollection.deleteOne({ user_id: helper.insertedId });
  await helperProfilesCollection.insertOne({
    user_id: helper.insertedId,
    status: 'online',
    verification_status: 'approved',
    id_card_number: '079090123456',
    average_rating: 4.9,
    total_completed: 48,
    cancellation_rate: 0,
    service_ids: [insertedServices.insertedIds[0], insertedServices.insertedIds[2], insertedServices.insertedIds[3]],
    verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Helper Wallet
  await walletsCollection.deleteOne({ user_id: helper.insertedId });
  await walletsCollection.insertOne({
    user_id: helper.insertedId,
    balance: 850000,
    total_earned: 4500000,
    total_withdrawn: 3650000,
    created_at: new Date(),
    updated_at: new Date(),
  });

  console.log('Seed completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
