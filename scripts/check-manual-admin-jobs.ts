import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/homemate?authSource=admin';

async function checkManualAdminJobs() {
  console.log('Connecting to MongoDB at:', MONGODB_URI.replace(/:([^:@]+)@/, ':****@'));
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection is not available');
  }

  const jobs = db.collection('jobs');
  const contracts = db.collection('contracts');
  const transactions = db.collection('transactions');
  const users = db.collection('users');

  // Tìm các đơn COMPLETED
  const completedJobs = await jobs.find({ status: 'completed' }).toArray();
  console.log(`Tìm thấy tổng cộng ${completedJobs.length} đơn có status = "completed".`);

  const adminCompletedUnpaidJobs = [];

  for (const job of completedJobs) {
    // Kiểm tra xem trong events có event nào do admin chuyển sang completed không
    const adminCompleteEvent = (job.events || []).find(
      (ev: any) => ev.actor_role === 'admin' && ev.status === 'completed',
    );

    if (!adminCompleteEvent) {
      // Không phải do admin chuyển thủ công
      continue;
    }

    if (!job.helper_id) {
      // Không có helper_id gắn vào đơn
      continue;
    }

    // Kiểm tra xem thợ đã có giao dịch nhận tiền (earning) hay khấu trừ phí (commission) cho job này chưa
    const payoutTx = await transactions.findOne({
      job_id: job._id,
      user_id: job.helper_id,
      type: { $in: ['earning', 'commission'] },
      status: 'success',
    });

    if (!payoutTx) {
      const helperUser = await users.findOne({ _id: job.helper_id });
      const contract = await contracts.findOne({ job_id: job._id });

      adminCompletedUnpaidJobs.push({
        job_id: String(job._id),
        title: job.title,
        helper_id: String(job.helper_id),
        helper_name: helperUser?.full_name || 'Không rõ',
        helper_phone: helperUser?.phone || 'Không rõ',
        payment_method: job.payment_method || 'unknown',
        total_price: job.total_price || contract?.total_price || 0,
        platform_fee: contract?.platform_fee || 0,
        helper_receives: contract?.helper_receives || 0,
        admin_note: adminCompleteEvent.note,
        admin_event_time: adminCompleteEvent.timestamp,
      });
    }
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`KẾT QUẢ KIỂM TRA ĐƠN ADMIN ĐỔI THỦ CÔNG CHƯA NHẬN TIỀN:`);
  console.log(`Số lượng phát hiện: ${adminCompletedUnpaidJobs.length}`);
  if (adminCompletedUnpaidJobs.length > 0) {
    console.table(adminCompletedUnpaidJobs);
  } else {
    console.log('✓ Không phát hiện đơn nào admin đổi thủ công sang hoàn thành mà thợ bị thiếu tiền công.');
  }
  console.log('────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

checkManualAdminJobs().catch(err => {
  console.error('Error checking manual admin jobs:', err);
  process.exit(1);
});
