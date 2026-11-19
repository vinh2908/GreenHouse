import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';
import { SosBackupStatus } from './schemas/sos-backup.schema';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * R13-B1 — SOS withdrawal doesn't clear the rematch state (live 2026-11-18).
 *
 * Job 6afba6fb914ecfff7b2ff54f (B7-1b): SOS history says the 10:25 SOS was
 * withdrawn ('Thợ đã thu hồi SOS', 'Đã xử lý'), but the helper job detail
 * still showed 'Đang tìm người thay thế…' + a 'Thu hồi yêu cầu SOS' button.
 *
 * Root cause (derivation, not stored state): `getByJob` fell back to
 * `serialized[0]` — the newest SOS of ANY status — as `sos` when no active
 * SOS existed, so a terminal `cancelled` record kept being served as the
 * "current" SOS and the helper card (which never checked status) rendered
 * the "searching" banner forever. After the fix `sos` is only ever an
 * active SOS (`pending` | `awaiting_customer`); history stays in `sos_list`.
 *
 * FAILS on base d06aa9c: getByJob returns the cancelled SOS as `sos`.
 */
describe('SosBackupService.getByJob / cancelSos — R13-B1 withdrawn SOS banner', () => {
  const customerId = new Types.ObjectId();
  const originalHelperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const sosId = new Types.ObjectId();

  let sosModel: any;
  let jobModel: any;
  let gateway: any;
  let notificationsService: any;

  function makeSosDoc(over: Record<string, unknown> = {}): any {
    const fields: Record<string, unknown> = {
      _id: sosId,
      job_id: jobId,
      job_title: 'Dọn nhà SOS',
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.PENDING,
      candidates: [],
      ...over,
    };
    return {
      ...fields,
      toObject: () => ({ ...fields }),
    };
  }

  function makeService() {
    sosModel = {
      findById: jest.fn(() => ({ exec: async () => null })),
      find: jest.fn(() => ({ sort: jest.fn(() => ({ exec: async () => [] })) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
    };
    jobModel = {
      findById: jest.fn(() => ({ exec: async () => null })),
      countDocuments: jest.fn(() => ({ exec: async () => 0 })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    };
    gateway = { emitToUser: jest.fn(), emitToJob: jest.fn() };
    notificationsService = { create: jest.fn(async () => ({})) };
    const dummy = {} as never;
    const service = new SosBackupService(
      sosModel,
      jobModel,
      { findOne: jest.fn(() => ({ exec: async () => null })) } as never,
      { updateOne: jest.fn(() => ({ exec: async () => ({}) })) } as never,
      dummy, // penaltyEventModel
      {
        find: jest.fn(() => ({
          select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
        })),
      } as never,
      gateway as never,
      dummy, // chatService
      notificationsService as never,
      {
        refundCustomer: jest.fn(async () => ({})),
        getTotalPaidForJob: jest.fn(async () => 0),
      } as never,
      { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
      { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
      { get: jest.fn(() => undefined) } as never, // configService
    );
    return service;
  }

  function mockSosList(list: any[]) {
    (sosModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn(() => ({ exec: async () => list })),
    });
  }

  function makeJobDoc(over: Record<string, unknown> = {}): any {
    return {
      _id: jobId,
      customer_id: customerId,
      helper_id: originalHelperId,
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.UNPAID,
      payment_method: 'vietqr',
      title: 'Dọn nhà SOS',
      events: [],
      markModified: jest.fn(),
      save: jest.fn(async () => true),
      ...over,
    };
  }

  it('withdrawn (cancelled) SOS is NOT served as the current sos — sos is null, history keeps it', async () => {
    const service = makeService();
    mockSosList([makeSosDoc({ status: SosBackupStatus.CANCELLED })]);

    const res = await service.getByJob(String(originalHelperId), String(jobId));

    expect(res.sos).toBeNull();
    expect((res.sos_list as any[])[0].status).toBe(SosBackupStatus.CANCELLED);
  });

  it('active PENDING SOS is still served as sos (no overcorrection)', async () => {
    const service = makeService();
    mockSosList([
      makeSosDoc({ status: SosBackupStatus.CANCELLED }),
      makeSosDoc({ status: SosBackupStatus.PENDING }),
    ]);

    const res = await service.getByJob(String(originalHelperId), String(jobId));

    expect((res.sos as any)?.status).toBe(SosBackupStatus.PENDING);
  });

  it('?status=cancelled filter still returns the matching SOS as sos', async () => {
    const service = makeService();
    mockSosList([makeSosDoc({ status: SosBackupStatus.CANCELLED })]);

    const res = await service.getByJob(
      String(originalHelperId),
      String(jobId),
      SosBackupStatus.CANCELLED,
    );

    expect((res.sos as any)?.status).toBe(SosBackupStatus.CANCELLED);
  });

  it('full flow: helper withdraws a PENDING SOS → getByJob then returns sos: null', async () => {
    const service = makeService();
    const jobDoc = makeJobDoc();
    (jobModel.findById as jest.Mock).mockReturnValue({ exec: async () => jobDoc });
    const pendingSos = makeSosDoc({ status: SosBackupStatus.PENDING });
    (sosModel.findById as jest.Mock).mockReturnValue({ exec: async () => pendingSos });
    const claimedSos = makeSosDoc({ status: SosBackupStatus.CANCELLED });
    (sosModel.findOneAndUpdate as jest.Mock).mockReturnValue({
      exec: async () => claimedSos,
    });

    const withdrawn = await service.cancelSos(String(originalHelperId), String(sosId));
    expect((withdrawn as any).status).toBe(SosBackupStatus.CANCELLED);

    mockSosList([makeSosDoc({ status: SosBackupStatus.CANCELLED })]);
    const res = await service.getByJob(String(originalHelperId), String(jobId));
    expect(res.sos).toBeNull();
    expect((res.sos_list as any[])[0].status).toBe(SosBackupStatus.CANCELLED);
  });
});
