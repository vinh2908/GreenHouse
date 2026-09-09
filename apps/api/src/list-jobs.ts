import mongoose from 'mongoose';

async function listJobsAndConvs() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');
  const jobs = await db.collection('jobs').find({}).toArray();
  console.log('=== DANH SÁCH JOBS TRONG DB ===');
  jobs.forEach(j => console.log(`Job ID: ${j._id} | Title: ${j.title} | Helper ID: ${j.helper_id}`));

  const convs = await db.collection('conversations').find({}).toArray();
  console.log('\n=== DANH SÁCH CONVERSATIONS ===');
  convs.forEach(c => console.log(`Conv ID: ${c._id} | Job ID: ${c.job_id} | Last msg: "${c.last_message}"`));

  process.exit(0);
}

listJobsAndConvs().catch(console.error);
