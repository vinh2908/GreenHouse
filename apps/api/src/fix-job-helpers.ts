import mongoose from 'mongoose';

async function fixJobHelpers() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const jobsCollection = db.collection('jobs');
  const usersCollection = db.collection('users');

  const customer = await usersCollection.findOne({ phone: '0901111111' });
  const helper = await usersCollection.findOne({ phone: '0902222222' });

  if (!customer || !helper) throw new Error('Customer or Helper not found');

  const customerId = customer._id;
  const helperId = helper._id;

  // 1. Cập nhật tất cả các job mà helper_id đang bị lưu trùng với customer_id
  const invalidJobs = await jobsCollection.find({
    $expr: { $eq: ['$customer_id', '$helper_id'] }
  }).toArray();

  console.log(`Tìm thấy ${invalidJobs.length} đơn hàng bị gán nhầm helper_id = customer_id`);

  for (const j of invalidJobs) {
    if (j.status === 'confirmed' || j.status === 'helper_on_the_way' || j.status === 'helper_arrived' || j.status === 'in_progress' || j.status === 'pending_review' || j.status === 'completed') {
      // Gán lại đúng Thợ Anh Tuấn
      await jobsCollection.updateOne(
        { _id: j._id },
        { $set: { helper_id: helperId } }
      );
      console.log(` -> Đã sửa Job "${j.title}" (${j._id}): gán helper_id -> Anh Tuấn (${helperId})`);
    } else {
      // Nếu là đơn open/receiving_quotes -> set helper_id = null
      await jobsCollection.updateOne(
        { _id: j._id },
        { $set: { helper_id: null } }
      );
      console.log(` -> Đã reset Job "${j.title}" (${j._id}): helper_id -> null`);
    }
  }

  console.log('✅ Đã sửa và làm sạch toàn bộ dữ liệu thợ phụ trách thành công!');
  process.exit(0);
}

fixJobHelpers().catch(console.error);
