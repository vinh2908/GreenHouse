import mongoose from 'mongoose';

async function seedRichJobs() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const jobsCollection = db.collection('jobs');
  const quotesCollection = db.collection('quotes');
  const contractsCollection = db.collection('contracts');
  const servicesCollection = db.collection('services');
  const usersCollection = db.collection('users');

  const customer = await usersCollection.findOne({ phone: '0901111111' });
  const helper = await usersCollection.findOne({ phone: '0902222222' });
  const services = await servicesCollection.find({}).toArray();

  if (!customer || !helper || services.length === 0) {
    throw new Error('Customer or Helper or Services not found');
  }

  const sCleaning = services.find(s => s.slug === 'housekeeping_hourly') || services[0];
  const sAc = services.find(s => s.slug === 'ac_repair') || services[1];
  const sPlumbing = services.find(s => s.slug === 'plumbing') || services[2];
  const sCooking = services.find(s => s.slug === 'cooking') || services[3];

  // 1. Job 1: Đang tìm thợ (OPEN - có 2 báo giá)
  const job1Id = new mongoose.Types.ObjectId();
  await jobsCollection.insertOne({
    _id: job1Id,
    customer_id: customer._id,
    service_id: sAc._id,
    status: 'receiving_quotes',
    title: 'Vệ sinh 2 máy lạnh Daikin Inverter & kiểm tra gas',
    description: '2 máy lạnh Daikin 1.5HP ở phòng khách và phòng ngủ chính chạy yếu lạnh, có mùi ẩm mốc. Cần thợ chuyên nghiệp mang theo bạt hứng nước và máy xịt áp lực cao.',
    photos: [],
    videos: [],
    address: {
      full_address: 'Căn hộ 12.04 Tòa Landmark 3, Vinhomes Central Park',
      ward: 'Phường 22',
      district: 'Quận Bình Thạnh',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.7218, 10.7951] },
    },
    preferred_date: new Date(),
    preferred_time_start: '09:00',
    total_quotes_count: 2,
    created_at: new Date(Date.now() - 3600 * 1000 * 2),
    updated_at: new Date(),
  });

  await quotesCollection.insertMany([
    {
      job_id: job1Id,
      helper_id: helper._id,
      labor_cost: 300000,
      materials_cost: 50000,
      total_price: 350000,
      platform_fee: 52500,
      helper_receives: 297500,
      estimated_duration: 2,
      notes: 'Bao gồm vệ sinh dàn nóng lạnh và kiểm tra gas miễn phí. Bảo hành chảy nước 30 ngày.',
      status: 'pending',
      created_at: new Date(Date.now() - 3600 * 1000),
    },
    {
      job_id: job1Id,
      helper_id: new mongoose.Types.ObjectId(),
      labor_cost: 400000,
      materials_cost: 0,
      total_price: 400000,
      platform_fee: 60000,
      helper_receives: 340000,
      estimated_duration: 2.5,
      notes: 'Thợ điện lạnh 5 năm kinh nghiệm, có mặt sau 30 phút.',
      status: 'pending',
      created_at: new Date(Date.now() - 1800 * 1000),
    },
  ]);

  // 2. Job 2: Đang làm việc (IN_PROGRESS)
  const job2Id = new mongoose.Types.ObjectId();
  await jobsCollection.insertOne({
    _id: job2Id,
    customer_id: customer._id,
    helper_id: helper._id,
    service_id: sPlumbing._id,
    status: 'in_progress',
    title: 'Thông tắc bồn rửa chén bát & thay xi-phông thoát nước',
    description: 'Bồn rửa chén thoát nước rất chậm và bị rỉ nước dưới đáy tủ bếp. Cần thợ xử lý triệt để.',
    address: {
      full_address: '45/2 Nguyễn Thị Minh Khai',
      ward: 'Phường Đa Kao',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.6992, 10.7876] },
    },
    preferred_date: new Date(),
    preferred_time_start: '10:30',
    total_quotes_count: 1,
    created_at: new Date(Date.now() - 3600 * 1000 * 4),
    updated_at: new Date(),
  });

  await contractsCollection.insertOne({
    job_id: job2Id,
    customer_id: customer._id,
    helper_id: helper._id,
    labor_cost: 250000,
    materials_cost: 100000,
    total_price: 350000,
    platform_fee: 52500,
    helper_receives: 297500,
    status: 'active',
    created_at: new Date(),
  });

  // 3. Job 3: Chờ nghiệm thu (PENDING_REVIEW)
  const job3Id = new mongoose.Types.ObjectId();
  await jobsCollection.insertOne({
    _id: job3Id,
    customer_id: customer._id,
    helper_id: helper._id,
    service_id: sCleaning._id,
    status: 'pending_review',
    title: 'Dọn dẹp nhà 3 tầng & giặt rèm cửa phòng khách (4 tiếng)',
    description: 'Lau sàn 3 tầng, hút bụi thảm, cọ rửa 3 nhà vệ sinh và phơi đồ.',
    completion_photos: ['https://images.unsplash.com/photo-1581578731548-c64695cc6952'],
    address: {
      full_address: '88 Hai Bà Trưng',
      ward: 'Phường Bến Nghé',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.7025, 10.7786] },
    },
    preferred_date: new Date(),
    preferred_time_start: '08:00',
    total_quotes_count: 1,
    created_at: new Date(Date.now() - 3600 * 1000 * 6),
    updated_at: new Date(),
  });

  console.log('Seeded rich jobs data successfully!');
  process.exit(0);
}

seedRichJobs().catch(console.error);
