import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CallsService } from './calls.service';

/**
 * G10/R2 — cho phép gọi điện sau khi đơn hoàn thành (hỏi bảo hành);
 * vẫn chặn 400 với đơn cancelled/expired/refunded.
 */
describe('CallsService.initiateCall — gate theo trạng thái đơn (G10/R2)', () => {
  function makeService(jobStatus: string) {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    const job = {
      _id: jobId,
      status: jobStatus,
      customer_id: customerId,
      helper_id: helperId,
      team: [],
    };
    const jobModel: any = {
      findById: jest.fn(() => ({ exec: async () => job })),
    };
    const createdSessions: Record<string, unknown>[] = [];
    const callSessionModel: any = {
      create: jest.fn(async (doc: Record<string, unknown>) => {
        const session = { _id: new Types.ObjectId(), ...doc };
        createdSessions.push(session);
        return session;
      }),
    };
    const userModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ exec: async () => ({ full_name: 'Khách Test' }) })),
      })),
    };
    const provider: any = {
      isConfigured: () => true,
      name: 'stringee',
      createAccessToken: jest.fn(async () => ({
        token: 'tok-test',
        expires_at: new Date(Date.now() + 3600 * 1000),
      })),
    };
    const gateway: any = { emitToUser: jest.fn() };
    const voipPush: any = { notifyIncomingCall: jest.fn(async () => undefined) };
    const service = new CallsService(
      callSessionModel,
      jobModel,
      userModel,
      provider,
      gateway,
      voipPush,
      {} as never,
    );
    return { service, customerId, helperId, jobId, createdSessions, callSessionModel, gateway };
  }

  it('đơn completed → gọi được (khách gọi thợ để hỏi bảo hành)', async () => {
    const { service, customerId, helperId, createdSessions, gateway } = makeService('completed');
    const result = await service.initiateCall('job-id', String(customerId));
    expect(createdSessions).toHaveLength(1);
    expect(result.partner_id).toBe(String(helperId));
    expect(result.room_id).toBe('gh-job-job-id');
    expect(gateway.emitToUser).toHaveBeenCalled();
  });

  it('đơn completed → thợ gọi lại khách cũng được', async () => {
    const { service, customerId, helperId } = makeService('completed');
    const result = await service.initiateCall('job-id', String(helperId));
    expect(result.partner_id).toBe(String(customerId));
  });

  it.each(['cancelled', 'expired', 'refunded'])(
    'đơn %s → 400, không tạo phiên gọi',
    async status => {
      const { service, customerId, createdSessions } = makeService(status);
      await expect(service.initiateCall('job-id', String(customerId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(createdSessions).toHaveLength(0);
    },
  );

  it('đơn đang làm (in_progress) → vẫn gọi được như trước', async () => {
    const { service, customerId } = makeService('in_progress');
    const result = await service.initiateCall('job-id', String(customerId));
    expect(result.session_id).toBeDefined();
  });
});
