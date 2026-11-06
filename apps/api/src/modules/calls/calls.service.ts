import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CallSession, CallSessionDocument } from './schemas/call-session.schema';
import { CallProvider, CALL_PROVIDER } from './call-provider.interface';
import { VoipPushService } from './voip-push.service';
import { SOCKET_EVENTS, NOTIFICATION_TYPES } from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';

export const CALL_NOT_CONFIGURED_MESSAGE =
  'Tính năng gọi thoại trong app chưa được kích hoạt trên hệ thống. Vui lòng liên lạc qua chat hoặc số điện thoại đã xác thực.';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(CALL_PROVIDER) private readonly provider: CallProvider,
    private readonly gateway: AppGateway,
    private readonly voipPush: VoipPushService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Trạng thái tính năng cho mobile (ẩn/disable nút gọi khi chưa cấu hình) */
  getConfig() {
    const enabled = this.provider.isConfigured();
    return {
      enabled,
      provider: enabled ? this.provider.name : null,
      message: enabled ? undefined : CALL_NOT_CONFIGURED_MESSAGE,
    };
  }

  /**
   * Bắt đầu 1 phiên gọi cho job: kiểm tra người gọi là 1 bên của job
   * (khách / thợ chính / thành viên nhóm đã accept), xác định đối tác,
   * cấp token của provider và lưu phiên gọi.
   */
  async initiateCall(jobId: string, callerId: string) {
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(CALL_NOT_CONFIGURED_MESSAGE);
    }
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (!job.helper_id) {
      throw new BadRequestException('Đơn chưa có thợ phụ trách để gọi');
    }

    const isCustomer = String(job.customer_id) === callerId;
    const isLead = String(job.helper_id) === callerId;
    const teamMember = (job.team ?? []).find(
      m => String(m.helper_id) === callerId && m.status === 'accepted',
    );
    if (!isCustomer && !isLead && !teamMember) {
      throw new ForbiddenException('Bạn không thuộc đơn này nên không thể gọi');
    }

    // Đối tác: khách ↔ thợ chính; thành viên nhóm → gọi thợ chính
    const calleeId = isCustomer ? String(job.helper_id) : String(job.customer_id);
    const roomId = `gh-job-${jobId}`;

    const { token, expires_at } = await this.provider.createAccessToken(callerId);
    const session = await this.callSessionModel.create({
      job_id: job._id,
      caller_id: new Types.ObjectId(callerId),
      callee_id: new Types.ObjectId(calleeId),
      provider: this.provider.name,
      provider_room_id: roomId,
      status: 'initiated',
      started_at: new Date(),
    });

    // Báo cho đối tác có cuộc gọi đến (app đang mở sẽ hiện màn hình nhận cuộc gọi)
    this.gateway.emitToUser(calleeId, SOCKET_EVENTS.CALL_INCOMING, {
      job_id: jobId,
      session_id: String(session._id),
      caller_id: callerId,
      room_id: roomId,
      provider: this.provider.name,
    });

    // Đánh thức thiết bị phía nhận khi app chạy nền / đã bị đóng hẳn
    // (VoIP push → CallKeep). Fire-and-forget + best-effort: service này
    // no-op êm khi chưa cấu hình APNS_VOIP_*/FIREBASE_SERVICE_ACCOUNT_JSON
    // và không bao giờ ném lỗi làm hỏng đường gọi chính.
    void this.userModel
      .findById(callerId)
      .select('full_name')
      .exec()
      .then(
        caller =>
          this.voipPush.notifyIncomingCall(calleeId, {
            sessionId: String(session._id),
            callerId,
            callerName: caller?.full_name ?? 'Đối tác GreenHouse',
            jobId,
          }),
        () =>
          this.voipPush.notifyIncomingCall(calleeId, {
            sessionId: String(session._id),
            callerId,
            callerName: 'Đối tác GreenHouse',
            jobId,
          }),
      )
      .catch(() => undefined);

    return {
      session_id: String(session._id),
      provider: this.provider.name,
      token,
      token_expires_at: expires_at,
      room_id: roomId,
      partner_id: calleeId,
      // SDK phía client dùng userId này để connect; không hề lộ số điện thoại thật
      my_user_id: callerId,
    };
  }

  /**
   * Cấp token join cho phía nhận cuộc gọi (callee) — hoặc caller join lại.
   * Callee không đi qua initiateCall nên cần endpoint riêng để lấy token
   * provider cho đúng session đã được tạo.
   */
  async joinSessionToken(userId: string, sessionId: string) {
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(CALL_NOT_CONFIGURED_MESSAGE);
    }
    const session = await this.callSessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Phiên gọi không tồn tại');
    if (session.status !== 'initiated' && session.status !== 'ringing') {
      throw new BadRequestException('Phiên gọi đã kết thúc hoặc không còn khả dụng');
    }
    const callerId = String(session.caller_id);
    const calleeId = String(session.callee_id);
    if (userId !== callerId && userId !== calleeId) {
      throw new ForbiddenException('Bạn không thuộc phiên gọi này');
    }

    // A87: Đánh dấu cuộc gọi đã được trả lời khi callee join
    if (userId === calleeId && !session.answered_at) {
      session.answered_at = new Date();
      session.status = 'connected';
      await session.save();
    }

    const partnerId = userId === callerId ? calleeId : callerId;
    const { token, expires_at } = await this.provider.createAccessToken(userId);
    return {
      session_id: String(session._id),
      job_id: String(session.job_id),
      token,
      token_expires_at: expires_at,
      room_id: session.provider_room_id,
      partner_id: partnerId,
      my_user_id: userId,
    };
  }

  /** Kết thúc phiên gọi (mobile gọi khi cúp máy / bị từ chối) */
  async endCall(sessionId: string, userId: string, reason?: string) {
    const session = await this.callSessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Phiên gọi không tồn tại');
    if (String(session.caller_id) !== userId && String(session.callee_id) !== userId) {
      throw new ForbiddenException('Bạn không thuộc phiên gọi này');
    }

    const callerId = String(session.caller_id);
    const calleeId = String(session.callee_id);
    const partnerId = userId === callerId ? calleeId : callerId;

    // A87: Phát hiện cuộc gọi nhỡ (chưa được trả lời và caller không huỷ trong 3s đầu)
    const startedAt = session.started_at ? new Date(session.started_at).getTime() : 0;
    const durationSeconds = (Date.now() - startedAt) / 1000;
    const isMissed =
      !session.answered_at &&
      (durationSeconds > 3 ||
        reason === 'missed' ||
        reason === 'no_answer' ||
        reason === 'timeout');

    if (session.status !== 'ended') {
      session.status = isMissed ? 'missed' : 'ended';
      session.ended_at = new Date();
      session.end_reason = isMissed ? 'missed' : reason;
      await session.save();
    }

    this.gateway.emitToUser(partnerId, 'call:ended', {
      sessionId: String(session._id),
      reason,
    });

    if (isMissed) {
      // Phát event call:missed cho callee
      this.gateway.emitToUser(calleeId, 'call:missed', {
        sessionId: String(session._id),
        callerId,
        jobId: String(session.job_id),
        timestamp: new Date().toISOString(),
      });

      // Gửi notification cuộc gọi nhỡ
      void this.userModel
        .findById(callerId)
        .select('full_name')
        .exec()
        .then(caller => {
          const callerName = caller?.full_name ?? 'Đối tác';
          const timeStr = new Date(session.started_at || Date.now()).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return this.notificationsService.create({
            userId: calleeId,
            type: NOTIFICATION_TYPES.CALL_MISSED,
            title: 'Cuộc gọi nhỡ',
            body: `Cuộc gọi nhỡ từ ${callerName} lúc ${timeStr}`,
            payload: {
              job_id: String(session.job_id),
              session_id: String(session._id),
              caller_id: callerId,
            },
          });
        })
        .catch(() => undefined);
    }

    return session;
  }
}
