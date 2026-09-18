import mongoose from 'mongoose';

async function checkJobDetailData() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const jobs = await db.collection('jobs').find({}).toArray();
  console.log('=== DANH SÁCH JOBS VÀ THÔNG TIN ID TRONG DB ===');
  for (const j of jobs) {
    const cust = await db.collection('users').findOne({ _id: j.customer_id });
    const help = j.helper_id ? await db.collection('users').findOne({ _id: j.helper_id }) : null;
    console.log(`\nJob ID: ${j._id} | Title: "${j.title}"`);
    console.log(`  -> Status: [${j.status}]`);
    console.log(`  -> customer_id trong DB: ${j.customer_id} (Tên: ${cust?.full_name}, Phone: ${cust?.phone})`);
    console.log(`  -> helper_id trong DB:   ${j.helper_id || 'null'} (Tên: ${help?.full_name || 'chưa có'}, Phone: ${help?.phone || 'null'})`);
  }

  process.exit(0);
}

checkJobDetailData().catch(console.error);
