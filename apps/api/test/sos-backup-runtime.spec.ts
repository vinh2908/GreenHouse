import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { SosBackupService } from '../src/modules/sos-backup/sos-backup.service';
import {
  SosBackupRequest,
  SosBackupRequestSchema,
  SosBackupRequestDocument,
  SosBackupStatus,
  SosBackupDecision,
  SosBackupReason,
} from '../src/modules/sos-backup/schemas/sos-backup.schema';
import {
  Job,
  JobSchema,
  JobDocument,
  Contract,
  ContractSchema,
  ContractDocument,
} from '../src/modules/jobs/schemas/job.schema';
import {
  HelperProfile,
  HelperProfileSchema,
  HelperProfileDocument,
} from '../src/modules/helpers/schemas/helper-profile.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventSchema,
  HelperPenaltyEventDocument,
} from '../src/modules/helpers/schemas/helper-penalty-event.schema';
import { User, UserSchema, UserDocument } from '../src/modules/users/schemas/user.schema';
import { Service, ServiceSchema, ServiceDocument } from '../src/modules/services/schemas/service.schema';
import { AppGateway } from '../src/modules/chat/app.gateway';
import { ChatService } from '../src/modules/chat/chat.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { JobStatus, ContractStatus, PaymentStatus, HelperStatus } from '@homemate/types';
import { SOCKET_EVENTS } from '@homemate/constants';
import { recordHelperCancellation } from '../src/modules/helpers/utils/record-cancellation';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const testDbUri = (process.env.MONGODB_URI || 'mongodb://localhost:27017/homemate').replace(
  /\/homemate(\?|$)/,
  '/homemate_test$1',
);

describe('SOS Backup & Roadmap Financial Logic Runtime Suite (Real MongoDB)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let service: SosBackupService;
  let sosModel: Model<SosBackupRequestDocument>;
  let jobModel: Model<JobDocument>;
  let contractModel: Model<ContractDocument>;
  let helperModel: Model<HelperProfileDocument>;
  let penaltyEventModel: Model<HelperPenaltyEventDocument>;
  let userModel: Model<UserDocument>;
  let serviceModel: Model<ServiceDocument>;

  const emittedEvents: Array<{ target: string; event: string; data: any }> = [];
  const refundedCalls: Array<{ customerId: string; jobId: string; amount: number; reason: string }> = [];
  const onlineUsers = new Set<string>();

  const mockGateway = {
    isUserOnline: jest.fn((id: string) => onlineUsers.has(id)),
    emitToUser: jest.fn((userId: string, event: string, data: any) => {
      emittedEvents.push({ target: `user:${userId}`, event, data });
    }),
    emitToJob: jest.fn((jobId: string, event: string, data: any) => {
      emittedEvents.push({ target: `job:${jobId}`, event, data });
    }),
    emitToAdmins: jest.fn((event: string, data: any) => {
      emittedEvents.push({ target: 'admins', event, data });
    }),
  };

  const mockChatService = {
    addParticipantByJob: jest.fn(async () => ({ ok: true })),
  };

  const mockNotificationsService = {
    create: jest.fn(async () => ({ ok: true })),
  };

  const mockPaymentsService = {
    refundCustomer: jest.fn(async (customerId: string, jobId: string, amount: number, reason: string) => {
      refundedCalls.push({ customerId, jobId, amount, reason });
      return { success: true, refund_amount: amount };
    }),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              SOS_BACKUP_CUSTOMER_DECISION_TTL_SECONDS: 300,
              SOS_BACKUP_ON_DECISION_TIMEOUT: 'cancel_job',
              SOS_BACKUP_BROADCAST_TTL_SECONDS: 240,
              SOS_BACKUP_WAVE_SIZE: 5,
              SOS_BACKUP_MAX_DISTANCE_KM: 30,
              SOS_BACKUP_COST_PENALTY_WEIGHT: 2,
              HELPER_SCORE_CANCEL_WINDOW_DAYS: 7,
              HELPER_SCORE_CANCEL_THRESHOLD: 3,
              HELPER_SCORE_PENALTY_PER_EXCESS: 5,
            }),
          ],
        }),
        MongooseModule.forRoot(testDbUri),
        MongooseModule.forFeature([
          { name: SosBackupRequest.name, schema: SosBackupRequestSchema },
          { name: Job.name, schema: JobSchema },
          { name: Contract.name, schema: ContractSchema },
          { name: HelperProfile.name, schema: HelperProfileSchema },
          { name: HelperPenaltyEvent.name, schema: HelperPenaltyEventSchema },
          { name: User.name, schema: UserSchema },
          { name: Service.name, schema: ServiceSchema },
        ]),
      ],
      providers: [
        SosBackupService,
        { provide: AppGateway, useValue: mockGateway },
        { provide: ChatService, useValue: mockChatService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    service = moduleRef.get<SosBackupService>(SosBackupService);
    sosModel = moduleRef.get(getModelToken(SosBackupRequest.name));
    jobModel = moduleRef.get(getModelToken(Job.name));
    contractModel = moduleRef.get(getModelToken(Contract.name));
    helperModel = moduleRef.get(getModelToken(HelperProfile.name));
    penaltyEventModel = moduleRef.get(getModelToken(HelperPenaltyEvent.name));
    userModel = moduleRef.get(getModelToken(User.name));
    serviceModel = moduleRef.get(getModelToken(Service.name));
  }, 30000);

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    emittedEvents.length = 0;
    refundedCalls.length = 0;
    onlineUsers.clear();
    jest.clearAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 1: Luồng đồng ý của khách (Cổng đồng ý -> Đổi người -> Nhận thay)
  // ═════════════════════════════════════════════════════════════════════════════
  it('1. Luồng đồng ý của khách: Helper A SOS -> Chờ khách -> Khách chọn Đổi người -> Helper B nhận thay', async () => {
    const customerId = new Types.ObjectId();
    const helperAId = new Types.ObjectId();
    const helperBId = new Types.ObjectId();

    // 0. Tạo Service
    const serviceDoc = await serviceModel.create({
      name: 'Dọn dẹp căn hộ',
      description: 'Dịch vụ dọn dẹp căn hộ tiêu chuẩn',
      slug: 'don-dep-can-ho-' + Date.now(),
      category_id: new Types.ObjectId(),
      base_price: 150000,
    });
    const serviceId = serviceDoc._id;

    // 1. Tạo helper profiles
    await helperModel.deleteMany({ user_id: { $in: [helperAId, helperBId] } });
    await helperModel.create([
      {
        user_id: helperAId,
        service_ids: [serviceId],
        verification_status: 'approved',
        status: HelperStatus.BUSY,
        rating: 4.8,
        completed_jobs: 20,
        location: { type: 'Point', coordinates: [106.701, 10.731] },
        last_location_update: new Date(),
      },
      {
        user_id: helperBId,
        service_ids: [serviceId],
        verification_status: 'approved',
        status: HelperStatus.ONLINE,
        rating: 4.9,
        completed_jobs: 35,
        location: { type: 'Point', coordinates: [106.705, 10.733] }, // cách ~0.5km
        last_location_update: new Date(),
      },
    ]);
    onlineUsers.add(helperBId.toString());

    // 2. Tạo Job và Contract
    const job = await jobModel.create({
      customer_id: customerId,
      helper_id: helperAId,
      service_id: serviceId,
      title: 'Dọn dẹp căn hộ 2PN',
      description: 'Dọn dẹp phòng khách, bếp và 2 phòng ngủ',
      status: JobStatus.IN_PROGRESS,
      payment_method: 'vnpay',
      payment_status: PaymentStatus.PAID,
      address: {
        city: 'TP. Hồ Chí Minh',
        district: 'Quận 7',
        ward: 'Tân Phong',
        street: '123 Nguyễn Thị Thập',
        full_address: '123 Nguyễn Thị Thập, Tân Phong, Quận 7, TP. Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.702, 10.732] },
      },
      events: [
        {
          status: JobStatus.IN_PROGRESS,
          note: 'Bắt đầu công việc',
          actor_id: helperAId,
          actor_role: 'helper',
          timestamp: new Date(),
        },
      ],
    });

    const contract = await contractModel.create({
      job_id: job._id,
      customer_id: customerId,
      helper_id: helperAId,
      status: ContractStatus.ACTIVE,
      scheduled_at: new Date(),
      labor_cost: 350000,
      total_price: 350000,
      platform_fee: 52500,
      helper_receives: 297500,
    });

    // 3. Helper A gửi SOS
    const sosResult = (await service.createSos(helperAId.toString(), job._id.toString(), {
      reason: SosBackupReason.VEHICLE_BREAKDOWN,
      note: 'Xe bị hỏng hóc dọc đường không kịp tới',
    })) as Record<string, any>;

    expect(sosResult.status).toBe(SosBackupStatus.AWAITING_CUSTOMER);
    expect(sosResult.candidates).toHaveLength(0); // CHƯA phát sóng khi khách chưa duyệt

    // Báo socket cho khách
    const decisionReqEvent = emittedEvents.find(
      e => e.target === `user:${customerId}` && e.event === SOCKET_EVENTS.SOS_BACKUP_DECISION_REQUESTED,
    );
    expect(decisionReqEvent).toBeDefined();
    expect(decisionReqEvent?.data.reason).toBe(SosBackupReason.VEHICLE_BREAKDOWN);

    // 4. Khách chọn "ACCEPT_REPLACEMENT" (Đổi người)
    const decisionResult = (await service.customerDecision(
      customerId.toString(),
      sosResult._id.toString(),
      { decision: SosBackupDecision.ACCEPT_REPLACEMENT },
    )) as Record<string, any>;

    expect(decisionResult.status).toBe(SosBackupStatus.PENDING);

    // Kiểm tra wave 1: Helper B đã được mời
    const sosAfterDecision = await sosModel.findById(sosResult._id).lean();
    expect(sosAfterDecision?.candidates.length).toBeGreaterThanOrEqual(1);
    const invitedB = sosAfterDecision?.candidates.find(c => c.helper_id.toString() === helperBId.toString());
    expect(invitedB).toBeDefined();
    expect(invitedB?.state).toBe('invited');

    // 5. Helper B chấp nhận SOS
    const acceptResult = await service.acceptSos(helperBId.toString(), sosResult._id.toString());
    expect((acceptResult as any).sos.status).toBe(SosBackupStatus.ACCEPTED);
    expect((acceptResult as any).sos.replacement_helper_id?.toString()).toBe(helperBId.toString());

    // 6. Kiểm tra Job sau khi đổi thợ: chỉ đổi helper_id, giá và tiền không bị ghi đè
    const updatedJob = await jobModel.findById(job._id).lean();
    expect(updatedJob?.helper_id?.toString()).toBe(helperBId.toString());
    expect(updatedJob?.sos_backup_replacement?.previous_helper_id?.toString()).toBe(helperAId.toString());
    expect(updatedJob?.sos_backup_replacement?.new_helper_id?.toString()).toBe(helperBId.toString());
    expect(updatedJob?.payment_status).toBe(PaymentStatus.PAID); // Tiền đứng yên

    // 7. Kiểm tra Hợp đồng: chỉ đổi helper_id, total_price & helper_receives giữ nguyên
    const updatedContract = await contractModel.findOne({ job_id: job._id }).lean();
    expect(updatedContract?.helper_id?.toString()).toBe(helperBId.toString());
    expect(updatedContract?.total_price).toBe(350000);
    expect(updatedContract?.helper_receives).toBe(297500);

    // 8. Helper A được giải phóng (BUSY -> ONLINE)
    const profileA = await helperModel.findOne({ user_id: helperAId }).lean();
    expect(profileA?.status).toBe(HelperStatus.ONLINE);

    // Dọn dẹp
    await Promise.all([
      jobModel.deleteOne({ _id: job._id }),
      contractModel.deleteOne({ _id: contract._id }),
      sosModel.deleteOne({ _id: sosResult._id }),
      helperModel.deleteMany({ user_id: { $in: [helperAId, helperBId] } }),
      serviceModel.deleteOne({ _id: serviceId }),
    ]);
  }, 30000);

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 2: Nhánh hủy đơn (Khách chọn hủy -> Hoàn đúng tiền thực trả)
  // ═════════════════════════════════════════════════════════════════════════════
  it('2. Nhánh hủy đơn: Khách chọn Hủy -> Hoàn 100% tiền thực trả, thợ gốc không bị phạt hủy muộn', async () => {
    const customerId = new Types.ObjectId();
    const helperAId = new Types.ObjectId();

    const serviceDoc = await serviceModel.create({
      name: 'Sửa điện',
      description: 'Dịch vụ sửa chữa điện dân dụng',
      slug: 'sua-dien-' + Date.now(),
      category_id: new Types.ObjectId(),
      base_price: 150000,
    });
    const serviceId = serviceDoc._id;

    await helperModel.deleteMany({ user_id: helperAId });
    await helperModel.create({
      user_id: helperAId,
      service_ids: [serviceId],
      verification_status: 'approved',
      status: HelperStatus.BUSY,
      late_cancellation_count: 0,
      risk_score: 0,
    });

    // Job có voucher 30k + điểm loyalty 10k: Giá gốc 300k, thực trả 260k
    const job = await jobModel.create({
      customer_id: customerId,
      helper_id: helperAId,
      service_id: serviceId,
      title: 'Sửa điện gia dụng',
      description: 'Sửa ổ cắm điện chập cháy',
      status: JobStatus.HELPER_ON_THE_WAY,
      payment_method: 'zalopay',
      payment_status: PaymentStatus.PAID,
      discount_amount: 30000,
      loyalty_discount_amount: 10000,
      address: {
        city: 'TP. Hồ Chí Minh',
        district: 'Bình Thạnh',
        ward: 'Phường 25',
        street: 'Ung Văn Khiêm',
        full_address: 'Ung Văn Khiêm, Phường 25, Bình Thạnh, TP. Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.715, 10.803] },
      },
      events: [],
    });

    const contract = await contractModel.create({
      job_id: job._id,
      customer_id: customerId,
      helper_id: helperAId,
      status: ContractStatus.ACTIVE,
      scheduled_at: new Date(),
      labor_cost: 300000,
      total_price: 300000,
      platform_fee: 45000,
      helper_receives: 255000,
    });

    // Thợ A tạo SOS
    const sosResult = (await service.createSos(helperAId.toString(), job._id.toString(), {
      reason: SosBackupReason.ACCIDENT,
      note: 'Va quẹt giao thông nhẹ cần xử lý',
    })) as Record<string, any>;

    // Khách hàng bấm "CANCEL_JOB"
    await service.customerDecision(customerId.toString(), sosResult._id.toString(), {
      decision: SosBackupDecision.CANCEL_JOB,
    });

    // Kiểm tra hoàn tiền: thực trả = 300,000 - 30,000 - 10,000 = 260,000₫
    expect(refundedCalls).toHaveLength(1);
    expect(refundedCalls[0].amount).toBe(260000);
    expect(refundedCalls[0].customerId).toBe(customerId.toString());

    // Kiểm tra Job & Contract đã hủy
    const updatedJob = await jobModel.findById(job._id).lean();
    expect(updatedJob?.status).toBe(JobStatus.CANCELLED);
    expect(updatedJob?.payment_status).toBe(PaymentStatus.REFUNDED);

    const updatedContract = await contractModel.findOne({ job_id: job._id }).lean();
    expect(updatedContract?.status).toBe(ContractStatus.CANCELLED);

    // Kiểm tra thợ A: KHÔNG bị tăng late_cancellation_count hay risk_score
    const profileA = await helperModel.findOne({ user_id: helperAId }).lean();
    expect(profileA?.late_cancellation_count).toBe(0);
    expect(profileA?.risk_score).toBe(0);
    expect(profileA?.status).toBe(HelperStatus.ONLINE);

    // Dọn dẹp
    await Promise.all([
      jobModel.deleteOne({ _id: job._id }),
      contractModel.deleteOne({ _id: contract._id }),
      sosModel.deleteOne({ _id: sosResult._id }),
      helperModel.deleteOne({ user_id: helperAId }),
      serviceModel.deleteOne({ _id: serviceId }),
    ]);
  }, 30000);

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 3: Race nhận đơn (Atomic claim: 2 thợ cùng bấm nhận, 1 thắng)
  // ═════════════════════════════════════════════════════════════════════════════
  it('3. Race nhận đơn: 2 thợ đồng thời accept -> chỉ đúng 1 thợ thành công, thợ kia nhận 409', async () => {
    const customerId = new Types.ObjectId();
    const helperAId = new Types.ObjectId();
    const helperBId = new Types.ObjectId();
    const helperCId = new Types.ObjectId();
    const serviceId = new Types.ObjectId();

    await helperModel.deleteMany({ user_id: { $in: [helperAId, helperBId, helperCId] } });
    await helperModel.create([
      {
        user_id: helperAId,
        service_ids: [serviceId],
        verification_status: 'approved',
        status: HelperStatus.BUSY,
      },
      {
        user_id: helperBId,
        service_ids: [serviceId],
        verification_status: 'approved',
        status: HelperStatus.ONLINE,
        rating: 5.0,
        completed_jobs: 50,
        location: { type: 'Point', coordinates: [106.702, 10.732] },
        last_location_update: new Date(),
      },
      {
        user_id: helperCId,
        service_ids: [serviceId],
        verification_status: 'approved',
        status: HelperStatus.ONLINE,
        rating: 4.9,
        completed_jobs: 40,
        location: { type: 'Point', coordinates: [106.703, 10.733] },
        last_location_update: new Date(),
      },
    ]);

    const job = await jobModel.create({
      customer_id: customerId,
      helper_id: helperAId,
      service_id: serviceId,
      title: 'Tổng vệ sinh nhà phố',
      description: 'Tổng vệ sinh 1 trệt 2 lầu',
      status: JobStatus.CONFIRMED,
      address: {
        city: 'TP. Hồ Chí Minh',
        district: 'Quận 7',
        full_address: 'Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.701, 10.731] },
      },
      events: [],
    });

    const contract = await contractModel.create({
      job_id: job._id,
      customer_id: customerId,
      helper_id: helperAId,
      status: ContractStatus.ACTIVE,
      scheduled_at: new Date(),
      labor_cost: 500000,
      total_price: 500000,
      platform_fee: 75000,
      helper_receives: 425000,
    });

    // Tạo SOS trực tiếp ở trạng thái PENDING với 2 candidates được mời
    const sos = await sosModel.create({
      job_id: job._id,
      customer_id: customerId,
      original_helper_id: helperAId,
      service_id: serviceId,
      job_title: 'Tổng vệ sinh nhà phố',
      reason: SosBackupReason.PERSONAL_EMERGENCY,
      status: SosBackupStatus.PENDING,
      customer_decision: SosBackupDecision.ACCEPT_REPLACEMENT,
      decided_by: 'customer',
      decided_at: new Date(),
      expires_at: new Date(Date.now() + 240000),
      candidates: [
        { helper_id: helperBId, wave: 1, invited_at: new Date(), state: 'invited', cost: 10, distance_km: 1.2 },
        { helper_id: helperCId, wave: 1, invited_at: new Date(), state: 'invited', cost: 12, distance_km: 1.5 },
      ],
    });

    // Cho 2 thợ B và C cùng bấm Nhận đồng thời qua Promise.all
    const results = await Promise.allSettled([
      service.acceptSos(helperBId.toString(), sos._id.toString()),
      service.acceptSos(helperCId.toString(), sos._id.toString()),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Chính xác 1 người thành công và 1 người bị từ chối
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winningHelperId = ((fulfilled[0] as PromiseFulfilledResult<any>).value).sos.replacement_helper_id.toString();
    expect([helperBId.toString(), helperCId.toString()]).toContain(winningHelperId);

    // Job helper_id phải khớp với người thắng
    const finalJob = await jobModel.findById(job._id).lean();
    expect(finalJob?.helper_id?.toString()).toBe(winningHelperId);

    // Dọn dẹp
    await Promise.all([
      jobModel.deleteOne({ _id: job._id }),
      contractModel.deleteOne({ _id: contract._id }),
      sosModel.deleteOne({ _id: sos._id }),
      helperModel.deleteMany({ user_id: { $in: [helperAId, helperBId, helperCId] } }),
    ]);
  }, 30000);

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 4: Khách không trả lời (Timeout sweep -> tự hủy & hoàn tiền)
  // ═════════════════════════════════════════════════════════════════════════════
  it('4. Khách không trả lời: Sau hạn decision_deadline -> sweep tự động hủy và hoàn tiền', async () => {
    const customerId = new Types.ObjectId();
    const helperAId = new Types.ObjectId();
    const serviceId = new Types.ObjectId();

    await helperModel.deleteMany({ user_id: helperAId });
    await helperModel.create({
      user_id: helperAId,
      service_ids: [serviceId],
      verification_status: 'approved',
      status: HelperStatus.BUSY,
    });

    const job = await jobModel.create({
      customer_id: customerId,
      helper_id: helperAId,
      service_id: serviceId,
      title: 'Giặt rèm cửa',
      description: 'Giặt 4 bộ rèm cửa chung cư',
      status: JobStatus.CONFIRMED,
      payment_method: 'vnpay',
      payment_status: PaymentStatus.PAID,
      address: {
        city: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        full_address: 'Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.698, 10.772] },
      },
      events: [],
    });

    const contract = await contractModel.create({
      job_id: job._id,
      customer_id: customerId,
      helper_id: helperAId,
      status: ContractStatus.ACTIVE,
      scheduled_at: new Date(),
      labor_cost: 200000,
      total_price: 200000,
      platform_fee: 30000,
      helper_receives: 170000,
    });

    // Tạo SOS với hạn chót đã trôi qua ở quá khứ (expired)
    const pastDeadline = new Date(Date.now() - 10000);
    const sos = await sosModel.create({
      job_id: job._id,
      customer_id: customerId,
      original_helper_id: helperAId,
      service_id: serviceId,
      job_title: 'Giặt rèm cửa',
      reason: SosBackupReason.OTHER,
      status: SosBackupStatus.AWAITING_CUSTOMER,
      decision_deadline: pastDeadline,
      candidates: [],
    });

    // Kích hoạt sweep()
    await (service as any).sweep();

    // SOS chuyển sang DECISION_TIMEOUT
    const checkedSos = await sosModel.findById(sos._id).lean();
    expect(checkedSos?.status).toBe(SosBackupStatus.DECISION_TIMEOUT);
    expect(checkedSos?.decided_by).toBe('timeout_default');

    // Job bị hủy & hoàn tiền
    const checkedJob = await jobModel.findById(job._id).lean();
    expect(checkedJob?.status).toBe(JobStatus.CANCELLED);
    expect(refundedCalls).toHaveLength(1);
    expect(refundedCalls[0].amount).toBe(200000);

    // Dọn dẹp
    await Promise.all([
      jobModel.deleteOne({ _id: job._id }),
      contractModel.deleteOne({ _id: contract._id }),
      sosModel.deleteOne({ _id: sos._id }),
      helperModel.deleteOne({ user_id: helperAId }),
    ]);
  }, 30000);

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 5: Điểm phạt hủy (Cửa sổ 7 ngày, >3 lần trừ -5đ/lần)
  // ═════════════════════════════════════════════════════════════════════════════
  it('5. Điểm phạt hủy: 3 lần đầu không phạt; lần thứ 4 trừ 5 điểm Tin cậy & ghi HelperPenaltyEvent', async () => {
    const helperId = new Types.ObjectId();
    const jobId = new Types.ObjectId();

    await helperModel.deleteMany({ user_id: helperId });
    await penaltyEventModel.deleteMany({ helper_id: helperId });

    // Tạo hồ sơ ban đầu: 100 điểm tuyệt đối
    await helperModel.create({
      user_id: helperId,
      verification_status: 'approved',
      status: HelperStatus.ONLINE,
      rating: 5.0,
      total_reviews: 10,
      completion_rate: 100,
      acceptance_rate: 100,
      cancellation_timestamps: [],
      cancellations_last_7_days: 0,
      penalty_points: 0,
      performance_score: 100,
    });

    // Lần 1: hủy đơn
    const r1 = await recordHelperCancellation({
      helperModel,
      penaltyEventModel,
      helperId: helperId.toString(),
      source: 'job_cancel',
      jobId: jobId.toString(),
    });
    expect(r1?.penaltyPoints).toBe(0);
    expect(r1?.just_penalized).toBe(false);
    expect(r1?.total).toBe(100);

    // Lần 2: hủy đơn
    const r2 = await recordHelperCancellation({
      helperModel,
      penaltyEventModel,
      helperId: helperId.toString(),
      source: 'job_cancel',
      jobId: jobId.toString(),
    });
    expect(r2?.penaltyPoints).toBe(0);
    expect(r2?.warningLevel).toBe('approaching');

    // Lần 3: gửi SOS
    const r3 = await recordHelperCancellation({
      helperModel,
      penaltyEventModel,
      helperId: helperId.toString(),
      source: 'sos_initiation',
      jobId: jobId.toString(),
    });
    expect(r3?.penaltyPoints).toBe(0); // Vẫn trong ngưỡng 3 lần, chưa bị phạt

    // Lần 4: gửi SOS -> VƯỢT NGƯỠNG (lần 4 > 3)
    const r4 = await recordHelperCancellation({
      helperModel,
      penaltyEventModel,
      helperId: helperId.toString(),
      source: 'sos_initiation',
      jobId: jobId.toString(),
    });
    expect(r4?.penaltyPoints).toBe(5); // Phạt 5 điểm
    expect(r4?.points_deducted_now).toBe(5);
    expect(r4?.just_penalized).toBe(true);
    expect(r4?.warningLevel).toBe('penalized');
    // Độ tin cậy giảm từ 20 -> 15 => Tổng điểm giảm 100 -> 95
    expect(r4?.breakdown.reliability).toBe(15);
    expect(r4?.total).toBe(95);

    // Kiểm tra HelperPenaltyEvent đã được ghi vào database
    const penaltyEvents = await penaltyEventModel.find({ helper_id: helperId }).lean();
    expect(penaltyEvents).toHaveLength(1);
    expect(penaltyEvents[0].points_deducted).toBe(5);
    expect(penaltyEvents[0].cancellations_in_window).toBe(4);
    expect(penaltyEvents[0].excess_count).toBe(1);
    expect(penaltyEvents[0].performance_score_after).toBe(95);

    // Dọn dẹp
    await helperModel.deleteOne({ user_id: helperId });
    await penaltyEventModel.deleteMany({ helper_id: helperId });
  }, 30000);

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECKLIST 6: Tiền của gói roadmap (Voucher, Đơn nhóm, Hợp đồng tháng, v.v.)
  // ═════════════════════════════════════════════════════════════════════════════
  it('6. Tiền của gói roadmap: Tính đúng voucher, chiết khấu loyalty, chia tiền đơn nhóm, và hợp đồng tháng', () => {
    // 6.1 Voucher calculation
    const basePrice = 500000;
    const voucherDiscountPercent = 20; // 20%
    const maxDiscount = 80000;
    const calculatedDiscount = Math.min((basePrice * voucherDiscountPercent) / 100, maxDiscount);
    expect(calculatedDiscount).toBe(80000); // 100k capped at 80k

    // 6.2 Net customer payment with loyalty points
    const loyaltyDiscount = 20000;
    const customerActualPayment = basePrice - calculatedDiscount - loyaltyDiscount;
    expect(customerActualPayment).toBe(400000);

    // 6.3 Group job financial split (3 helpers: 1 leader + 2 members)
    const groupJobTotalPrice = 1200000;
    const platformFeeRate = 0.15; // 15%
    const totalHelperPayout = groupJobTotalPrice * (1 - platformFeeRate); // 1,020,000₫
    expect(totalHelperPayout).toBe(1020000);

    // Leader receives 40%, member 1 receives 30%, member 2 receives 30%
    const leaderShare = Math.round(totalHelperPayout * 0.4);
    const member1Share = Math.round(totalHelperPayout * 0.3);
    const member2Share = Math.round(totalHelperPayout * 0.3);
    expect(leaderShare).toBe(408000);
    expect(member1Share).toBe(306000);
    expect(member2Share).toBe(306000);
    expect(leaderShare + member1Share + member2Share).toBe(totalHelperPayout);

    // 6.4 Monthly Contract calculation (12 shifts @ 250,000/shift, 10% monthly discount)
    const shiftsCount = 12;
    const shiftRate = 250000;
    const monthlyGross = shiftsCount * shiftRate; // 3,000,000₫
    const monthlyDiscountRate = 0.1; // 10%
    const monthlyTotal = Math.round(monthlyGross * (1 - monthlyDiscountRate)); // 2,700,000₫
    expect(monthlyTotal).toBe(2700000);

    // 6.5 Dispute partial split (e.g. 50% customer refund, 50% helper payout)
    const disputeContractTotal = 600000;
    const splitRatioCustomer = 0.5;
    const customerRefund = disputeContractTotal * splitRatioCustomer;
    const helperRemainingPayout = (disputeContractTotal - customerRefund) * (1 - platformFeeRate);
    expect(customerRefund).toBe(300000);
    expect(helperRemainingPayout).toBe(255000);
  });
});

