import mongoose, { Types } from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/homemate?authSource=admin';

const ACTIVE_HELPER_JOB_STATUSES = [
  'confirmed',
  'helper_on_the_way',
  'helper_arrived',
  'in_progress',
  'pending_review',
];

async function run() {
  console.log('Connecting to MongoDB at:', MONGODB_URI.replace(/:([^:@]+)@/, ':****@'));
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection is not available');
  }

  const helperProfiles = db.collection('helperprofiles');
  const jobs = db.collection('jobs');
  const users = db.collection('users');

  const busyHelpers = await helperProfiles.find({ status: 'busy' }).toArray();
  console.log(`Found ${busyHelpers.length} helpers with status = "busy".\n`);

  let releasedCount = 0;
  let remainedCount = 0;

  for (const helper of busyHelpers) {
    const helperUserId = helper.user_id;
    const user = await users.findOne({ _id: helperUserId });
    const name = user?.full_name || 'Không rõ';
    const phone = user?.phone || 'Không rõ';

    const activeCount = await jobs.countDocuments({
      helper_id: helperUserId,
      status: { $in: ACTIVE_HELPER_JOB_STATUSES },
    });

    if (activeCount === 0) {
      await helperProfiles.updateOne(
        { _id: helper._id },
        { $set: { status: 'online', updated_at: new Date() } },
      );
      releasedCount++;
      console.log(
        `[RELEASED] Thợ: ${name} (${phone}) - UserID: ${helperUserId} | Có 0 đơn hoạt động -> Đã chuyển về ONLINE`,
      );
    } else {
      remainedCount++;
      console.log(
        `[BUSY] Thợ: ${name} (${phone}) - UserID: ${helperUserId} | Còn ${activeCount} đơn đang hoạt động -> Giữ nguyên BUSY`,
      );
    }
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`Tổng kết: Đã kiểm tra ${busyHelpers.length} thợ bận.`);
  console.log(`- Đã giải phóng về ONLINE: ${releasedCount}`);
  console.log(`- Tiếp tục giữ BUSY (có đơn thực tế): ${remainedCount}`);
  console.log('────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error syncing helper status:', err);
  process.exit(1);
});
