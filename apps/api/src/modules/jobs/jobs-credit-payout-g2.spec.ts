import { Types } from 'mongoose';
import { JobsService } from '../jobs/jobs.service';

/**
 * Spec G2: creditJobPayout bọc toàn bộ lần trả tiền thợ (lead + member) trong
 * 1 transaction qua PaymentsService.runMoneyTransaction, session được truyền
 * xuống từng creditHelper.
 */
describe('JobsService.creditJobPayout (G2)', () => {
  function makeService() {
    const dummy = {} as never;
    const mockSession: any = { id: 'sess-payout' };
    const paymentsService: any = {
      runMoneyTransaction: jest.fn(async (fn: (s: any) => Promise<any>) => fn(mockSession)),
      creditHelper: jest.fn(async () => ({})),
    };
    const service = new JobsService(
      dummy, // jobModel
      dummy, // quoteModel
      dummy, // contractModel
      dummy, // serviceModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      dummy, // userModel
      { emitToJob: jest.fn(), emitToUser: jest.fn() } as never, // gateway
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      dummy, // chatService
      paymentsService,
      dummy, // routingService
      dummy, // favoritesService
      dummy, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );
    return { service, paymentsService, mockSession };
  }

  it('đơn thường: 1 lần creditHelper với đủ tiền, trong transaction, kèm session', async () => {
    const { service, paymentsService, mockSession } = makeService();
    const helperId = new Types.ObjectId();
    const job: any = { _id: new Types.ObjectId(), helper_id: helperId, team: [] };

    await (service as any).creditJobPayout(job, 300000);

    expect(paymentsService.runMoneyTransaction).toHaveBeenCalledTimes(1);
    expect(paymentsService.creditHelper).toHaveBeenCalledTimes(1);
    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(helperId),
      String(job._id),
      300000,
      mockSession,
    );
  });

  it('đơn nhóm: member 30% + lead 70%, cả 2 trong cùng 1 transaction', async () => {
    const { service, paymentsService, mockSession } = makeService();
    const leadId = new Types.ObjectId();
    const memberId = new Types.ObjectId();
    const job: any = {
      _id: new Types.ObjectId(),
      helper_id: leadId,
      team: [{ helper_id: memberId, status: 'accepted', split_percent: 30 }],
    };

    await (service as any).creditJobPayout(job, 300000);

    expect(paymentsService.runMoneyTransaction).toHaveBeenCalledTimes(1);
    expect(paymentsService.creditHelper).toHaveBeenCalledTimes(2);
    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(memberId),
      String(job._id),
      90000,
      mockSession,
    );
    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(leadId),
      String(job._id),
      210000,
      mockSession,
    );
  });

  it('không có helper hoặc tiền <= 0 → không gọi gì', async () => {
    const { service, paymentsService } = makeService();
    await (service as any).creditJobPayout({ _id: new Types.ObjectId(), team: [] }, 300000);
    await (service as any).creditJobPayout(
      { _id: new Types.ObjectId(), helper_id: new Types.ObjectId(), team: [] },
      0,
    );
    expect(paymentsService.runMoneyTransaction).not.toHaveBeenCalled();
    expect(paymentsService.creditHelper).not.toHaveBeenCalled();
  });
});
