import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

/**
 * Bug 1/5/6 — join-token idempotent cho cùng một bên + answered_at chỉ set
 * khi media thật sự connected (markAnswered), không phải lúc fetch token.
 * Trước fix: modal chuông fetch join-token lần 1 đã flip session sang
 * connected + set answered_at; màn hình /call fetch lần 2 thì 400
 * ('Phiên gọi đã kết thúc…') → caller kẹt "đang kết nối", callee báo lỗi.
 */
describe('CallsService.joinSessionToken / markAnswered — re-join idempotent', () => {
  function makeJoinService(overrides: Record<string, unknown> = {}) {
    const callerId = new Types.ObjectId();
    const calleeId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const session: any = {
      _id: sessionId,
      job_id: new Types.ObjectId(),
      caller_id: callerId,
      callee_id: calleeId,
      provider_room_id: 'gh-job-job-id',
      status: 'initiated',
      started_at: new Date(),
      answered_at: undefined,
      save: jest.fn(async () => undefined),
      ...overrides,
    };
    const callSessionModel: any = {
      findById: jest.fn(() => ({ exec: async () => session })),
      create: jest.fn(),
    };
    const provider: any = {
      isConfigured: () => true,
      name: 'stringee',
      createAccessToken: jest.fn(async () => ({
        token: 'tok-join',
        expires_at: new Date(Date.now() + 3600 * 1000),
      })),
    };
    const gateway: any = { emitToUser: jest.fn() };
    const notificationsService: any = { create: jest.fn(async () => ({})) };
    const userModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ exec: async () => ({ full_name: 'Khách Test' }) })),
      })),
    };
    const service = new CallsService(
      callSessionModel,
      {} as never,
      userModel,
      provider,
      gateway,
      {} as never,
      notificationsService,
    );
    return {
      service,
      session,
      callerId,
      calleeId,
      sessionId,
      provider,
      gateway,
      notificationsService,
    };
  }

  it('callee join lần 1 (modal chuông) → 200, initiated → ringing, KHÔNG set answered_at', async () => {
    const { service, session, calleeId } = makeJoinService();
    const result = await service.joinSessionToken(String(calleeId), String(session._id));
    expect(result.token).toBe('tok-join');
    expect(session.status).toBe('ringing');
    expect(session.answered_at).toBeUndefined();
  });

  it('callee join lần 2 (bấm Nhận sau khi modal đã join) → 200, answered_at vẫn unset', async () => {
    const { service, session, calleeId } = makeJoinService();
    await service.joinSessionToken(String(calleeId), String(session._id));
    const result = await service.joinSessionToken(String(calleeId), String(session._id));
    expect(result.token).toBe('tok-join');
    expect(session.status).toBe('ringing');
    expect(session.answered_at).toBeUndefined();
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('callee join khi connected (token refresher sau ~1h) → 200', async () => {
    const answeredAt = new Date();
    const { service, calleeId, sessionId } = makeJoinService({
      status: 'connected',
      answered_at: answeredAt,
    });
    const result = await service.joinSessionToken(String(calleeId), String(sessionId));
    expect(result.token).toBe('tok-join');
    expect(result.session_id).toBe(String(sessionId));
  });

  it('caller re-join khi connected (token refresher) → 200, cấp token mới', async () => {
    const { service, callerId, sessionId, provider } = makeJoinService({
      status: 'connected',
      answered_at: new Date(),
    });
    const result = await service.joinSessionToken(String(callerId), String(sessionId));
    expect(result.token).toBe('tok-join');
    expect(provider.createAccessToken).toHaveBeenCalledWith(String(callerId));
  });

  it.each(['ended', 'missed', 'failed'])('session %s → 400', async status => {
    const { service, calleeId, sessionId } = makeJoinService({ status });
    await expect(
      service.joinSessionToken(String(calleeId), String(sessionId)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('người ngoài phiên join → 403', async () => {
    const { service, sessionId } = makeJoinService();
    await expect(
      service.joinSessionToken(String(new Types.ObjectId()), String(sessionId)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('session không tồn tại → 404', async () => {
    const callerId = new Types.ObjectId();
    const nullModel: any = { findById: jest.fn(() => ({ exec: async () => null })) };
    const nullService = new CallsService(
      nullModel,
      {} as never,
      {} as never,
      {
        isConfigured: () => true,
        name: 'stringee',
        createAccessToken: jest.fn(),
      } as never,
      { emitToUser: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    await expect(
      nullService.joinSessionToken(String(callerId), String(new Types.ObjectId())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAnswered khi ringing → set answered_at + status connected', async () => {
    const { service, session, calleeId, sessionId } = makeJoinService({ status: 'ringing' });
    const result = await service.markAnswered(String(sessionId), String(calleeId));
    expect(session.answered_at).toBeInstanceOf(Date);
    expect(session.status).toBe('connected');
    expect(result.status).toBe('connected');
  });

  it('markAnswered lần 2 → idempotent, answered_at không đổi, không save thêm', async () => {
    const first = new Date(Date.now() - 5000);
    const { service, session, calleeId, sessionId } = makeJoinService({
      status: 'connected',
      answered_at: first,
    });
    await service.markAnswered(String(sessionId), String(calleeId));
    expect(session.answered_at).toBe(first);
    expect(session.save).not.toHaveBeenCalled();
  });

  it('markAnswered khi session đã ended → 400', async () => {
    const { service, calleeId, sessionId } = makeJoinService({ status: 'ended' });
    await expect(
      service.markAnswered(String(sessionId), String(calleeId)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('endCall 2 lần (socket decline + REST end) → chỉ emit CALL_ENDED + notification nhỡ 1 lần', async () => {
    const { service, session, callerId, gateway, notificationsService } = makeJoinService({
      status: 'initiated',
      started_at: new Date(Date.now() - 10_000),
    });
    await service.endCall(String(session._id), String(callerId), 'cancelled');
    // Chờ chuỗi fire-and-forget tạo notification nhỡ chạy xong
    await new Promise(r => setTimeout(r, 0));
    await service.endCall(String(session._id), String(callerId), 'cancelled');
    await new Promise(r => setTimeout(r, 0));
    expect(session.status).toBe('missed');
    // Lần 1: CALL_ENDED + call:missed = 2 emit; lần 2 không emit thêm
    expect(gateway.emitToUser).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });
});
