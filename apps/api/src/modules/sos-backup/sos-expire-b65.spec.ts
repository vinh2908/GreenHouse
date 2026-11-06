import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';

/** Spec B65: SOS hết hạn gửi notification cho ứng viên đã bấm nhận (state 'accepted'). */
describe('SosBackupService.expireSos (B65)', () => {
  const acceptedHelper = new Types.ObjectId();
  const invitedHelper = new Types.ObjectId();
  const declinedHelper = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const originalHelperId = new Types.ObjectId();

  function makeService() {
    const sosModel: any = {
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => ({ _id: new Types.ObjectId() }) })),
    };
    const jobModel: any = {
      findById: jest.fn(() => ({
        exec: async () => ({
          status: 'confirmed',
          events: [],
          markModified: jest.fn(),
          save: jest.fn(async () => true),
        }),
      })),
    };
    const userModel: any = {
      find: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
      })),
    };
    const dummy = {} as never;
    const gateway = { emitToUser: jest.fn() };
    const notificationsService = { create: jest.fn(async () => ({})) };
    const service = new SosBackupService(
      sosModel,
      jobModel,
      dummy, // contractModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      userModel,
      gateway as never,
      dummy, // chatService
      notificationsService as never,
      dummy, // paymentsService
      dummy, // vouchersService
      dummy, // loyaltyService
      { get: jest.fn(() => undefined) } as never, // configService
    );
    // Không chạy luồng hủy đơn/hoàn tiền thật trong test này
    (service as any).cancelJobWithSosPolicy = jest.fn(async () => undefined);
    return { service, gateway, notificationsService };
  }

  function makeSos() {
    return {
      _id: new Types.ObjectId(),
      job_id: new Types.ObjectId(),
      job_title: 'Dọn nhà SOS',
      customer_id: customerId,
      original_helper_id: originalHelperId,
      candidates: [
        { helper_id: acceptedHelper, state: 'accepted' },
        { helper_id: invitedHelper, state: 'invited' },
        { helper_id: declinedHelper, state: 'declined' },
      ],
    } as any;
  }

  it('ứng viên accepted nhận notification "SOS đã hết hạn"; invited chỉ nhận socket; declined không nhận gì', async () => {
    const { service, gateway, notificationsService } = makeService();
    await (service as any).expireSos(makeSos(), 'ttl');

    const notiCalls = (notificationsService.create as jest.Mock).mock.calls;
    const acceptedNoti = notiCalls.find(c => c[0].userId === String(acceptedHelper));
    expect(acceptedNoti).toBeDefined();
    expect(acceptedNoti[0].title).toBe('SOS đã hết hạn');
    expect(acceptedNoti[0].body).toContain('Cảm ơn bạn đã sẵn sàng hỗ trợ');

    expect(notiCalls.find(c => c[0].userId === String(invitedHelper))).toBeUndefined();
    expect(notiCalls.find(c => c[0].userId === String(declinedHelper))).toBeUndefined();

    // Socket SOS_BACKUP_RESOLVED vẫn bắn cho cả accepted + invited
    const socketCalls = (gateway.emitToUser as jest.Mock).mock.calls;
    expect(socketCalls.some(c => c[0] === String(acceptedHelper))).toBe(true);
    expect(socketCalls.some(c => c[0] === String(invitedHelper))).toBe(true);

    // Khách + thợ gốc vẫn nhận notification như trước
    expect(notiCalls.find(c => c[0].userId === String(customerId))).toBeDefined();
    expect(notiCalls.find(c => c[0].userId === String(originalHelperId))).toBeDefined();
  });
});
