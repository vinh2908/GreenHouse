import { Types } from 'mongoose';
import { JobsService, ACTIVE_HELPER_JOB_STATUSES } from './jobs.service';
import { AdminService } from '../admin/admin.service';
import { ContractStatus, HelperStatus, JobStatus, PaymentStatus } from '@homemate/types';

type Doc = Record<string, unknown>;

function createMockEnvironment() {
  const helperUserId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const adminId = new Types.ObjectId();

  const helperProfile: Doc = {
    _id: new Types.ObjectId(),
    user_id: helperUserId,
    status: HelperStatus.ONLINE,
    completed_jobs: 0,
    risk_score: 0,
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const jobsStore: Doc[] = [];
  const contractsStore: Doc[] = [];

  const helperModel = {
    findOne: jest.fn((filter: Record<string, unknown>) => ({
      populate: jest.fn().mockReturnThis(),
      exec: async () => {
        if (filter['user_id'] && String(filter['user_id']) === String(helperUserId)) {
          return helperProfile;
        }
        return null;
      },
    })),
    find: jest.fn((filter: Record<string, unknown>) => ({
      populate: jest.fn().mockReturnThis(),
      exec: async () => {
        if (filter['status'] === helperProfile['status']) {
          return [helperProfile];
        }
        return [];
      },
    })),
    updateOne: jest.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const apply = () => {
        if (filter['user_id'] && String(filter['user_id']) === String(helperUserId)) {
          if (
            filter['status'] &&
            typeof filter['status'] === 'object' &&
            '$ne' in (filter['status'] as any)
          ) {
            if (helperProfile['status'] === (filter['status'] as any).$ne) {
              return { modifiedCount: 0 };
            }
          }
          if (filter['status'] && typeof filter['status'] === 'string') {
            if (helperProfile['status'] !== filter['status']) {
              return { modifiedCount: 0 };
            }
          }
          if (update['status']) helperProfile['status'] = update['status'];
          if (update['$set']) Object.assign(helperProfile, update['$set']);
          if (update['$inc']) {
            const inc = update['$inc'] as Record<string, number>;
            for (const [k, v] of Object.entries(inc)) {
              (helperProfile as any)[k] = ((helperProfile as any)[k] || 0) + v;
            }
          }
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      };
      return {
        exec: async () => apply(),
        then: (resolve: any) => Promise.resolve(apply()).then(resolve),
      };
    }),
  };

  const jobModel = {
    findById: jest.fn((id: string | Types.ObjectId) => ({
      exec: async () => jobsStore.find(j => String(j['_id']) === String(id)) || null,
    })),
    findOneAndUpdate: jest.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>, _opts?: any) => ({
        exec: async () => {
          const target = jobsStore.find(j => String(j['_id']) === String(filter['_id']));
          if (!target) return null;
          if (update['$set']) Object.assign(target, update['$set']);
          if (update['$push']) {
            for (const [k, v] of Object.entries(update['$push'] as Record<string, any>)) {
              if (!Array.isArray(target[k])) target[k] = [];
              (target[k] as any[]).push(v);
            }
          }
          return target;
        },
      }),
    ),
    countDocuments: jest.fn(async (filter: Record<string, unknown>) => {
      let count = 0;
      for (const j of jobsStore) {
        if (filter['helper_id'] && String(j['helper_id']) !== String(filter['helper_id'])) {
          continue;
        }
        if (filter['status']) {
          const sFilter = filter['status'] as any;
          if (sFilter.$in && !sFilter.$in.includes(j['status'])) continue;
          if (sFilter.$nin && sFilter.$nin.includes(j['status'])) continue;
          if (typeof sFilter === 'string' && j['status'] !== sFilter) continue;
        }
        count++;
      }
      return count;
    }),
    updateOne: jest.fn(() => ({
      exec: async () => ({ modifiedCount: 1 }),
    })),
  };

  const contractModel = {
    findOne: jest.fn((filter: Record<string, unknown>) => ({
      exec: async () => {
        return contractsStore.find(c => String(c['job_id']) === String(filter['job_id'])) || null;
      },
    })),
    findOneAndUpdate: jest.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
        exec: async () => {
          const c = contractsStore.find(
            item => String(item['job_id']) === String(filter['job_id']),
          );
          if (!c) return null;
          Object.assign(c, update);
          return c;
        },
      }),
    ),
  };

  const gateway = {
    emitToJob: jest.fn(),
    emitToUser: jest.fn(),
  };

  const notificationsService = {
    create: jest.fn().mockResolvedValue({}),
    notifyJobCompleted: jest.fn().mockResolvedValue({}),
  };

  const paymentsService = {
    creditHelper: jest.fn().mockResolvedValue({}),
    refundCustomer: jest.fn().mockResolvedValue({}),
    deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
  };

  const disputesService = {
    recordResolution: jest.fn().mockResolvedValue({}),
  };

  const jobsService = new (JobsService as any)(
    jobModel,
    {}, // quoteModel
    contractModel,
    {}, // serviceModel
    helperModel,
    {}, // penaltyEventModel
    {}, // userModel
    gateway,
    notificationsService,
    {}, // chatService
    paymentsService,
    {}, // routingService
    {}, // favoritesService
    {}, // vouchersService
    { awardLoyaltyOnJobCompletion: jest.fn().mockResolvedValue({}) },
    disputesService,
  );

  const adminService = new (AdminService as any)(
    {}, // userModel
    helperModel,
    jobModel,
    contractModel,
    {}, // notificationModel
    {}, // walletModel
    {}, // transactionModel
    {}, // withdrawalModel
    { exists: jest.fn().mockResolvedValue(false) }, // reviewModel
    {}, // customerModel
    {}, // sosModel
    {}, // penaltyEventModel
    notificationsService,
    jobsService,
  );

  function createTestJob(status: JobStatus = JobStatus.CONFIRMED, overrideHelperId = helperUserId) {
    const jobId = new Types.ObjectId();
    const jobDoc: Doc = {
      _id: jobId,
      title: 'Dọn dẹp căn hộ test',
      customer_id: customerId,
      helper_id: overrideHelperId,
      status,
      payment_method: 'vietqr',
      payment_status: PaymentStatus.PAID,
      // B57: nghiệm thu yêu cầu ít nhất 1 ảnh bằng chứng hoàn thành
      completion_photos: ['https://cdn.example.com/evidence.jpg'],
      events: [],
      save: jest.fn(async function (this: Doc) {
        return this;
      }),
    };
    jobsStore.push(jobDoc);

    const contractDoc: Doc = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      customer_id: customerId,
      helper_id: overrideHelperId,
      status: ContractStatus.ACTIVE,
      total_price: 200000,
      platform_fee: 30000,
      helper_receives: 170000,
      save: jest.fn(async function (this: Doc) {
        return this;
      }),
    };
    contractsStore.push(contractDoc);

    return { jobDoc, contractDoc };
  }

  return {
    helperUserId,
    customerId,
    adminId,
    helperProfile,
    jobsStore,
    contractsStore,
    jobModel,
    contractModel,
    helperModel,
    gateway,
    paymentsService,
    jobsService,
    adminService,
    createTestJob,
  };
}

describe('Đồng bộ trạng thái bận của Thợ & Hợp đồng (Helper Busy Status & Contract Sync)', () => {
  it('1. Khách nghiệm thu đơn: đơn completed, thợ được giải ngân, thợ về online, hợp đồng sang completed và ghi completed_at', async () => {
    const env = createMockEnvironment();
    const { jobDoc, contractDoc } = env.createTestJob(JobStatus.PENDING_REVIEW);
    env.helperProfile['status'] = HelperStatus.BUSY;

    // Khách nghiệm thu đơn
    await env.jobsService.approveCompletion(String(env.customerId), String(jobDoc['_id']), {
      rating: 5,
      review: 'Thợ làm rất sạch sẽ!',
    });

    // 1. Đơn sang completed
    expect(jobDoc['status']).toBe(JobStatus.COMPLETED);
    // 2. Thợ được giải ngân
    expect(env.paymentsService.creditHelper).toHaveBeenCalledWith(
      String(env.helperUserId),
      String(jobDoc['_id']),
      170000,
    );
    // 3. Thợ chuyển về online
    expect(env.helperProfile['status']).toBe(HelperStatus.ONLINE);
    // 4. Hợp đồng chuyển sang completed và ghi completed_at
    expect(contractDoc['status']).toBe(ContractStatus.COMPLETED);
    expect(contractDoc['completed_at']).toBeInstanceOf(Date);
  });

  it('2. Thợ hoàn thành công việc gửi kết quả (PENDING_REVIEW): thợ VẪN GIỮ BẬN (chưa được về online)', async () => {
    const env = createMockEnvironment();
    const { jobDoc } = env.createTestJob(JobStatus.IN_PROGRESS);
    env.helperProfile['status'] = HelperStatus.BUSY;

    // Thợ upload kết quả hoàn thành
    await env.jobsService.completeByHelper(String(env.helperUserId), String(jobDoc['_id']), {
      completion_photos: ['https://example.com/done.jpg'],
      completion_notes: 'Đã hoàn thành',
    });

    // Đơn chuyển sang PENDING_REVIEW
    expect(jobDoc['status']).toBe(JobStatus.PENDING_REVIEW);
    // Thợ VẪN PHẢI GIỮ BẬN vì đơn chờ nghiệm thu vẫn tính là đơn đang hoạt động
    expect(env.helperProfile['status']).toBe(HelperStatus.BUSY);
  });

  it('3. Từ PENDING_REVIEW, Admin đổi trạng thái sang COMPLETED: hồ sơ thợ về ONLINE, hợp đồng sang COMPLETED, phát socket', async () => {
    const env = createMockEnvironment();
    const { jobDoc, contractDoc } = env.createTestJob(JobStatus.PENDING_REVIEW);
    env.helperProfile['status'] = HelperStatus.BUSY;

    // Admin can thiệp đổi sang completed
    await env.adminService.updateJobStatus(
      String(jobDoc['_id']),
      JobStatus.COMPLETED,
      'Admin đối soát hoàn tất',
      String(env.adminId),
    );

    expect(jobDoc['status']).toBe(JobStatus.COMPLETED);
    // Thợ được trả về online
    expect(env.helperProfile['status']).toBe(HelperStatus.ONLINE);
    // Hợp đồng sang completed kèm mốc completed_at
    expect(contractDoc['status']).toBe(ContractStatus.COMPLETED);
    expect(contractDoc['completed_at']).toBeInstanceOf(Date);
    // Gửi realtime socket
    expect(env.gateway.emitToJob).toHaveBeenCalledWith(
      String(jobDoc['_id']),
      'job:status_changed',
      expect.objectContaining({ status: JobStatus.COMPLETED }),
    );
    expect(env.gateway.emitToJob).toHaveBeenCalledWith(
      String(jobDoc['_id']),
      'job:completed',
      expect.any(Object),
    );
  });

  it('4a. Admin phân xử tranh chấp sang COMPLETED (refund_partial hoặc release_to_helper): thợ về ONLINE, hợp đồng COMPLETED', async () => {
    const env = createMockEnvironment();
    const { jobDoc, contractDoc } = env.createTestJob(JobStatus.DISPUTED);
    env.helperProfile['status'] = HelperStatus.BUSY;

    await env.jobsService.resolveDispute(String(env.adminId), true, String(jobDoc['_id']), {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại, giải ngân cho thợ',
    });

    expect(jobDoc['status']).toBe(JobStatus.COMPLETED);
    expect(env.helperProfile['status']).toBe(HelperStatus.ONLINE);
    expect(contractDoc['status']).toBe(ContractStatus.COMPLETED);
    expect(contractDoc['completed_at']).toBeInstanceOf(Date);
  });

  it('4b. Admin phân xử tranh chấp sang REFUNDED (refund_full): thợ về ONLINE, hợp đồng CANCELLED', async () => {
    const env = createMockEnvironment();
    const { jobDoc, contractDoc } = env.createTestJob(JobStatus.DISPUTED);
    env.helperProfile['status'] = HelperStatus.BUSY;

    await env.jobsService.resolveDispute(String(env.adminId), true, String(jobDoc['_id']), {
      action: 'refund_full',
      admin_note: 'Hoàn tiền 100% cho khách hàng',
    });

    expect(jobDoc['status']).toBe(JobStatus.REFUNDED);
    expect(env.helperProfile['status']).toBe(HelperStatus.ONLINE);
    expect(contractDoc['status']).toBe(ContractStatus.CANCELLED);
  });

  it('5. Thợ VẪN GIỮ BUSY nếu còn 1 đơn đang hoạt động khác', async () => {
    const env = createMockEnvironment();
    // Tạo 2 đơn cho cùng 1 thợ
    const { jobDoc: job1 } = env.createTestJob(JobStatus.PENDING_REVIEW);
    const { jobDoc: job2 } = env.createTestJob(JobStatus.IN_PROGRESS);
    env.helperProfile['status'] = HelperStatus.BUSY;

    // Admin đổi Job 1 sang COMPLETED
    await env.adminService.updateJobStatus(
      String(job1['_id']),
      JobStatus.COMPLETED,
      'Admin duyệt đơn 1',
      String(env.adminId),
    );

    // Job 1 hoàn thành nhưng Job 2 vẫn đang IN_PROGRESS
    expect(job1['status']).toBe(JobStatus.COMPLETED);
    expect(job2['status']).toBe(JobStatus.IN_PROGRESS);
    // Thợ PHẢI TIẾP TỤC GIỮ BUSY
    expect(env.helperProfile['status']).toBe(HelperStatus.BUSY);
  });

  it('6. Admin syncAllHelpersBusyStatus: giải phóng thợ kẹt bận không có đơn, giữ nguyên thợ thực sự đang có đơn', async () => {
    const env = createMockEnvironment();
    // Thợ 1 đang BUSY nhưng không có đơn nào
    env.helperProfile['status'] = HelperStatus.BUSY;

    const result = await env.adminService.syncAllHelpersBusyStatus();
    expect(result.total_checked).toBe(1);
    expect(result.released_to_online).toBe(1);
    expect(result.remained_busy).toBe(0);
    expect(env.helperProfile['status']).toBe(HelperStatus.ONLINE);
  });
});
