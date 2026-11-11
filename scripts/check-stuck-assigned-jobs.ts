import mongoose, { Types } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/src/app.module';
import { JobsService, setHelperBusyWithModels } from '../apps/api/src/modules/jobs/jobs.service';

// Q5: entry point chạy bằng JobsService THẬT qua Nest DI (AppModule) thay vì
// object literal tự chế. Nhờ đó đường giải phóng thợ đi qua đúng code production:
// model Mongoose thật + AppGateway thật (broadcast helper:status_changed).
// LƯU Ý broadcast: script chạy trong process riêng, không có socket server
// (AppGateway.server undefined) nên emit tới client đang kết nối KHÔNG thể xảy
// ra từ process này — chỉ API server đang chạy mới phát tới client live được.
// DB (helper -> ONLINE, đơn -> open) là nguồn thật duy nhất sau khi script chạy;
// client sẽ thấy ONLINE ở lần đọc API tiếp theo. Xem thêm chú thích ở
// setHelperBusyWithModels (jobs.service.ts).

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/homemate?authSource=admin';

export async function checkAndFixStuckAssignedJobs(options?: {
  dbUri?: string;
  autoFix?: boolean;
  jobsService?: { setHelperBusy: (helperId: any, busy: boolean) => Promise<any> };
  disconnectOnFinish?: boolean;
}) {
  const dbUri = options?.dbUri || MONGODB_URI;
  console.log('Connecting to MongoDB at:', dbUri.replace(/:([^:@]+)@/, ':****@'));
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(dbUri);
  }
  console.log('Connected to MongoDB.\n');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection is not available');
  }

  const jobsCol = db.collection('jobs');
  const contractsCol = db.collection('contracts');
  const hasHelperProfiles =
    typeof db.listCollections === 'function'
      ? await db.listCollections({ name: 'helperprofiles' }).hasNext()
      : false;
  const helpersCol = hasHelperProfiles ? db.collection('helperprofiles') : db.collection('helpers');

  // Tìm các đơn có helper_id != null và trạng thái chưa hoàn thành/hủy
  const assignedJobs = await jobsCol
    .find({
      helper_id: { $ne: null },
      status: { $in: ['confirmed', 'quote_selected', 'in_progress', 'pending_review'] },
    })
    .toArray();

  console.log(`Tìm thấy ${assignedJobs.length} đơn có thợ phụ trách đang hoạt động.`);

  const stuckJobs: any[] = [];

  for (const job of assignedJobs) {
    const contract = await contractsCol.findOne({ job_id: job._id });
    if (!contract) {
      stuckJobs.push(job);
    }
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`KẾT QUẢ RÀ SOÁT ĐƠN KẸT CÓ THỢ NHƯNG THIẾU HỢP ĐỒNG:`);
  console.log(`Số lượng phát hiện: ${stuckJobs.length}`);

  if (stuckJobs.length === 0) {
    console.log('✓ Không có đơn hàng nào bị kẹt ở trạng thái có thợ nhưng thiếu hợp đồng.');
  } else {
    console.table(
      stuckJobs.map(j => ({
        job_id: String(j._id),
        title: j.title,
        status: j.status,
        helper_id: String(j.helper_id),
        payment_status: j.payment_status,
      })),
    );

    console.log('\nTiến hành sửa các đơn kẹt (hủy gán về OPEN để có thể gán lại chuẩn)...');
    for (const job of stuckJobs) {
      if (job.status !== 'confirmed' && job.status !== 'quote_selected') {
        console.warn(
          `⚠️ Bỏ qua đơn ${job._id} vì đang ở trạng thái ${job.status}. Chỉ tự động unassign đơn ở trạng thái confirmed/quote_selected.`,
        );
        continue;
      }
      const helperId = job.helper_id;
      await jobsCol.updateOne(
        { _id: job._id },
        {
          $set: {
            helper_id: null,
            status: 'open',
          },
          $push: {
            events: {
              status: 'open',
              note: 'Script check-stuck-assigned-jobs: Hủy gán về OPEN do đơn kẹt thiếu hợp đồng',
              actor_role: 'system',
              timestamp: new Date(),
            },
          } as any,
        },
      );

      // L3(c) & N6: Giải phóng trạng thái thợ qua JobsService.setHelperBusy thật
      if (options?.jobsService?.setHelperBusy) {
        await options.jobsService.setHelperBusy(helperId, false);
      } else {
        await setHelperBusyWithModels(helpersCol, jobsCol, helperId, false);
      }
      console.log(`✓ Đã sửa đơn ${job._id}: hủy gán về OPEN, giải phóng thợ ${helperId}.`);
    }
  }
  console.log('────────────────────────────────────────────────────────\n');

  if (options?.disconnectOnFinish !== false) {
    await mongoose.disconnect();
  }
}

export async function runScriptEntryPoint(options?: {
  dbUri?: string;
  autoFix?: boolean;
  disconnectOnFinish?: boolean;
  // Seam cho test: truyền sẵn service (thường là JobsService thật dựng từ
  // model Mongoose thật) để không phải boot cả AppModule trong unit test.
  jobsService?: { setHelperBusy: (helperId: any, busy: boolean) => Promise<any> };
  // Seam cho test: factory trả về service thật; entry point vẫn là nơi gọi
  // factory để lấy service (kiểm chứng được đường nối ở entry point).
  createJobsService?: () => Promise<{
    setHelperBusy: (helperId: any, busy: boolean) => Promise<any>;
  }>;
}) {
  // Production: boot Nest application context thật và lấy JobsService từ DI.
  // Không dùng object literal { setHelperBusy: ... } nữa (Q5).
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  let jobsService = options?.jobsService;
  if (!jobsService && options?.createJobsService) {
    jobsService = await options.createJobsService();
  }
  if (!jobsService) {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    jobsService = app.get(JobsService);
  }

  try {
    return await checkAndFixStuckAssignedJobs({
      ...options,
      jobsService,
    });
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
  }
}

if (require.main === module) {
  runScriptEntryPoint().catch(err => {
    console.error('Lỗi khi chạy script check-stuck-assigned-jobs:', err);
    process.exit(1);
  });
}
