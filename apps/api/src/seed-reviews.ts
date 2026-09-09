import mongoose from 'mongoose';

async function seedHelperReviews() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const reviewsCollection = db.collection('reviews');
  const usersCollection = db.collection('users');
  const jobsCollection = db.collection('jobs');

  const customer = await usersCollection.findOne({ phone: '0901111111' });
  const helper = await usersCollection.findOne({ phone: '0902222222' });
  const jobs = await jobsCollection.find({}).toArray();

  if (!customer || !helper) throw new Error('Customer or Helper not found');

  await reviewsCollection.deleteMany({ helper_id: helper._id });

  const sampleReviews = [
    {
      job_id: jobs[0]?._id || new mongoose.Types.ObjectId(),
      customer_id: customer._id,
      helper_id: helper._id,
      rating: 5,
      comment: 'Anh Tuấn làm việc rất chuyên nghiệp, đến đúng giờ hẹn. Sửa điện dứt điểm không còn mùi khét, dụng cụ mang theo rất đầy đủ và dọn dẹp sạch sẽ sau khi sửa.',
      rating_punctuality: 5,
      rating_quality: 5,
      rating_attitude: 5,
      tags: ['Đúng giờ', 'Tay nghề cao', 'Nhiệt tình', 'Đầy đủ đồ nghề'],
      helper_reply: 'Cảm ơn chị Mai đã tin tưởng và ủng hộ dịch vụ! Chúc chị và gia đình nhiều sức khỏe ạ.',
      helper_replied_at: new Date(Date.now() - 3600 * 1000 * 2),
      created_at: new Date(Date.now() - 3600 * 1000 * 5),
    },
    {
      job_id: new mongoose.Types.ObjectId(),
      customer_id: new mongoose.Types.ObjectId(),
      helper_id: helper._id,
      rating: 5,
      comment: 'Vệ sinh máy lạnh rất kỹ, tháo dàn lạnh bọc bạt cẩn thận không để nước bắn ra tường. Giá cả hợp lý và báo giá trước rõ ràng.',
      rating_punctuality: 5,
      rating_quality: 5,
      rating_attitude: 5,
      tags: ['Cẩn thận', 'Sạch sẽ', 'Giá tốt'],
      created_at: new Date(Date.now() - 86400 * 1000 * 2),
    },
    {
      job_id: new mongoose.Types.ObjectId(),
      customer_id: new mongoose.Types.ObjectId(),
      helper_id: helper._id,
      rating: 5,
      comment: 'Rất hài lòng! Bồn rửa chén bị nghẹt nhiều ngày gọi thợ khác không xong, anh Tuấn qua dùng máy lò xo thông trong 20 phút là nước thoát ào ào.',
      rating_punctuality: 5,
      rating_quality: 5,
      rating_attitude: 5,
      tags: ['Nhanh chóng', 'Uy tín'],
      created_at: new Date(Date.now() - 86400 * 1000 * 5),
    },
  ];

  await reviewsCollection.insertMany(sampleReviews);
  console.log('Seeded sample reviews successfully!');
  process.exit(0);
}

seedHelperReviews().catch(console.error);
