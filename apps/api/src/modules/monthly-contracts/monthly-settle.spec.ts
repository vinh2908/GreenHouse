import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { MonthlyContractsService } from './monthly-contracts.service';
import {
  MonthlyContract,
  AttendanceRecord,
  LeaveRequest,
  MonthlySettlement,
} from './schemas/monthly-contract.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { Service } from '../services/schemas/service.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { AppGateway } from '../chat/app.gateway';

describe('MonthlyContractsService - F20 settle transaction', () => {
  let service: MonthlyContractsService;
  let settlementModel: any;
  let paymentsService: any;
  let mockSession: any;

  const contractId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();

  function makeContract() {
    return {
      _id: contractId,
      customer_id: customerId,
      helper_id: helperId,
      title: 'Dọn nhà hàng tháng',
      status: 'active',
      platform_fee_percent: 15,
    };
  }

  beforeEach(async () => {
    mockSession = {
      withTransaction: jest.fn().mockImplementation(async (cb: any) => cb()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    settlementModel = {
      db: { startSession: jest.fn().mockResolvedValue(mockSession) },
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest
        .fn()
        .mockImplementation(async (docs: any[]) => [
          { ...docs[0], _id: new Types.ObjectId(), settled_at: new Date() },
        ]),
    };
    paymentsService = {
      getWallet: jest.fn().mockResolvedValue({ balance: 50_000_000, simulated_balance: 0 }),
      creditWallet: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      deductWallet: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyContractsService,
        { provide: getModelToken(MonthlyContract.name), useValue: {} },
        { provide: getModelToken(AttendanceRecord.name), useValue: {} },
        { provide: getModelToken(LeaveRequest.name), useValue: {} },
        { provide: getModelToken(MonthlySettlement.name), useValue: settlementModel },
        { provide: getModelToken(HelperProfile.name), useValue: {} },
        { provide: getModelToken(Service.name), useValue: {} },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({}) },
        },
        { provide: PaymentsService, useValue: paymentsService },
        {
          provide: AppGateway,
          useValue: { emitToUser: jest.fn(), emitToJob: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MonthlyContractsService>(MonthlyContractsService);
    jest.spyOn(service as any, 'getContractOrFail').mockResolvedValue(makeContract());
    jest.spyOn(service as any, 'computeSummary').mockResolvedValue({
      scheduled_days: 10,
      confirmed_days: 8,
      leave_days: 1,
      absent_days: 1,
      gross_amount: 800000,
      platform_fee: 120000,
      helper_receives: 680000,
      status: 'preview',
    });
  });

  it('F20: settle thành công -> tạo settlement + cộng ví trong cùng transaction (có session)', async () => {
    const res = await service.settle(String(customerId), String(contractId), {
      month: '2026-10',
    } as any);
    expect(res.status).toBe('settled');
    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(settlementModel.create).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ month: '2026-10' })]),
      expect.objectContaining({ session: mockSession }),
    );
    expect(paymentsService.creditWallet).toHaveBeenCalledWith(
      String(helperId),
      680000,
      expect.anything(),
      mockSession,
    );
  });

  it('F20: creditWallet lỗi -> lỗi được trả rõ về client, không nuốt im lặng', async () => {
    paymentsService.creditWallet.mockRejectedValue(new Error('wallet down'));
    await expect(
      service.settle(String(customerId), String(contractId), { month: '2026-10' } as any),
    ).rejects.toThrow('wallet down');
    // Transaction abort: withTransaction đã chạy (rollback do MongoDB),
    // không còn đường rollback tay bằng deductWallet nữa.
    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('F20: chốt trùng tháng (duplicate key) -> 409 Conflict rõ ràng', async () => {
    const dup: any = new Error('duplicate key');
    dup.code = 11000;
    settlementModel.create.mockRejectedValue(dup);
    await expect(
      service.settle(String(customerId), String(contractId), { month: '2026-10' } as any),
    ).rejects.toMatchObject({ status: 409 });
  });
});
