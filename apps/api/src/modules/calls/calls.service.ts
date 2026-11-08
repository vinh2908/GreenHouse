import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CallSession, CallSessionDocument } from './schemas/call-session.schema';
import { CallProvider, CALL_PROVIDER } from './call-provider.interface';
import { VoipPushService } from './voip-push.service';
import {
  SOCKET_EVENTS,
  NOTIFICATION_TYPES,
  normalizeCallEndReason,
  CALL_END_REASONS,
} from '@homemate/constants';
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
    // forwardRef: AppGateway cũng inject CallsService (handler call:declined)
    @Inject(forwardRef(() => AppGateway)) private readonly gateway: AppGateway,
    private readonly voipPush: VoipPushService,
    // forwardRef (không dùng design:paramtypes): chu trình ChatModule ↔
    // CallsModule có thể khiến module này chạy body khi NotificationsService
    // còn đang dở (undefined) tùy thứ tự require — callback lazy tránh lỗi
    // "argument at index [6] is undefined" khi Nest resolve dependency.
    @Inject(forwardRef(() => NotificationsService))
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
    // G10/R2 (quyết định của chủ 2026-11-07): CHO PHÉP gọi sau khi đơn hoàn
    // thành (khách/thợ hỏi bảo hành); vẫn chặn đơn đã hủy/hết hạn/hoàn tiền.
    if (['cancelled', 'expired', 'refunded'].includes(job.status)) {
      throw new BadRequestException('Đơn đã hủy/hết hạn/hoàn tiền nên không thể gọi điện');
    }
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

    // P2-9: Đối tác: khách ↔ thợ chính; thành viên nhóm → gọi thợ chính (lead)
    const calleeId = isCustomer
      ? String(job.helper_id)
      : isLead
        ? String(job.customer_id)
        : String(job.helper_id);
    const roomId = `gh-job-${jobId}`;

    // P2-8: Nếu đã có session đang mở cho job thì trả lại session đó, tránh tạo cuộc gọi trùng
    const existingActiveSession = this.callSessionModel?.findOne
      ? await this.callSessionModel
          .findOne({
            job_id: job._id,
            status: { $in: ['initiated', 'ringing', 'connected'] },
          })
          .sort({ started_at: -1 })
          .exec()
      : null;

    if (existingActiveSession) {
      const { token, expires_at } = await this.provider.createAccessToken(callerId);
      const partnerId =
        String(existingActiveSession.caller_id) === callerId
          ? String(existingActiveSession.callee_id)
          : String(existingActiveSession.caller_id);
      return {
        session_id: String(existingActiveSession._id),
        provider: existingActiveSession.provider,
        room_id: existingActiveSession.provider_room_id,
        token,
        token_expires_at: expires_at,
        expires_at,
        partner_id: partnerId,
        callee_id: partnerId,
        my_user_id: callerId,
      };
    }

    const { token, expires_at } = await this.provider.createAccessToken(callerId);
    let session: CallSessionDocument;
    try {
      session = await this.callSessionModel.create({
        job_id: job._id,
        caller_id: new Types.ObjectId(callerId),
        callee_id: new Types.ObjectId(calleeId),
        provider: this.provider.name,
        provider_room_id: roomId,
        status: 'initiated',
        started_at: new Date(),
      });
    } catch (err: any) {
      // H21 & K13(g): Race condition: 2 cuộc gọi cùng lúc tới cùng 1 đơn (E11000 duplicate key error)
      // Thu hẹp đúng lỗi trùng khóa (code 11000), không nuốt các lỗi MongoDB khác
      if (err?.code === 11000) {
        const racedSession = await this.callSessionModel
          .findOne({
            job_id: job._id,
            status: { $in: ['initiated', 'ringing', 'connected'] },
          })
          .sort({ started_at: -1 })
          .exec();
        if (racedSession) {
          const partnerId =
            String(racedSession.caller_id) === callerId
              ? String(racedSession.callee_id)
              : String(racedSession.caller_id);
          return {
            session_id: String(racedSession._id),
            provider: racedSession.provider,
            room_id: racedSession.provider_room_id,
            token,
            token_expires_at: expires_at,
            expires_at,
            partner_id: partnerId,
            callee_id: partnerId,
            my_user_id: callerId,
          };
        }
      }
      throw err;
    }

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
      callee_id: calleeId,
      // SDK phía client dùng userId này để connect; không hề lộ số điện thoại thật
      my_user_id: callerId,
    };
  }

  /**
   * Cấp token join cho phía nhận cuộc gọi (callee) — hoặc caller join lại.
   * Callee không đi qua initiateCall nên cần endpoint riêng để lấy token
   * provider cho đúng session đã được tạo.
   *
   * Idempotent cho cùng một bên (fix Bug 1): token join KHÔNG còn single-use.
   * Modal cuộc gọi đến fetch join-token ngay khi chuông reo, rồi màn hình
   * /call lại fetch lần nữa khi user bấm Nhận — cả hai lần đều phải thành
   * công. Token refresher (Stringee SDK, TTL 1h) cũng đi qua đây cho phiên
   * đang connected. Vì vậy join được phép khi session còn initiated /
   * ringing / connected; chỉ session đã kết thúc mới 400.
   *
   * Join KHÔNG đánh dấu đã trả lời (fix Bug 5): answered_at chỉ được set
   * bởi markAnswered(), khi media/signaling thật sự connected. Callee join
   * lần đầu chỉ chuyển initiated → ringing.
   */
  async joinSessionToken(userId: string, sessionId: string) {
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(CALL_NOT_CONFIGURED_MESSAGE);
    }
    const session = await this.callSessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Phiên gọi không tồn tại');
    if (
      session.status !== 'initiated' &&
      session.status !== 'ringing' &&
      session.status !== 'connected'
    ) {
      throw new BadRequestException('Phiên gọi đã kết thúc hoặc không còn khả dụng');
    }
    const callerId = String(session.caller_id);
    const calleeId = String(session.callee_id);
    if (userId !== callerId && userId !== calleeId) {
      throw new ForbiddenException('Bạn không thuộc phiên gọi này');
    }

    // Callee join lần đầu = chuông đang reo (chưa trả lời): initiated → ringing.
    // Không chạm answered_at ở đây — xem markAnswered().
    if (userId === calleeId && session.status === 'initiated') {
      session.status = 'ringing';
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

  /**
   * Đánh dấu cuộc gọi ĐÃ ĐƯỢC TRẢ LỜI (fix Bug 5): chỉ gọi khi media /
   * signaling của Stringee thật sự connected (màn hình /call nhận
   * onConnected), KHÔNG phải lúc fetch token. Nhờ vậy endCall mới phân
   * biệt được cuộc gọi nhỡ (chưa ai trả lời) với cuộc gọi đã nối máy.
   * Idempotent: gọi lại sau khi đã answered thì no-op.
   */
  async markAnswered(sessionId: string, userId: string) {
    const session = await this.callSessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Phiên gọi không tồn tại');
    if (String(session.caller_id) !== userId && String(session.callee_id) !== userId) {
      throw new ForbiddenException('Bạn không thuộc phiên gọi này');
    }
    if (session.status === 'ended' || session.status === 'missed' || session.status === 'failed') {
      throw new BadRequestException('Phiên gọi đã kết thúc hoặc không còn khả dụng');
    }
    if (!session.answered_at) {
      session.answered_at = new Date();
      session.status = 'connected';
      await session.save();
    }
    return {
      session_id: String(session._id),
      status: session.status,
      answered_at: session.answered_at,
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

    // B112: chuẩn hoá lý do về một enum duy nhất (declined/cancelled/ended/missed)
    const normalizedReason = normalizeCallEndReason(reason);

    // A87: Phát hiện cuộc gọi nhỡ (chưa được trả lời và caller không huỷ trong 3s đầu)
    const startedAt = session.started_at ? new Date(session.started_at).getTime() : 0;
    const durationSeconds = (Date.now() - startedAt) / 1000;
    const isMissed =
      !session.answered_at && (durationSeconds > 3 || normalizedReason === CALL_END_REASONS.MISSED);

    // Chỉ chuyển trạng thái / phát sự kiện / gửi thông báo nhỡ ở lần end đầu
    // tiên. endCall có thể tới 2 lần cho cùng 1 phiên (socket call:declined
    // + REST end, hoặc màn hình lỗi + cleanup unmount) — lần 2 là no-op để
    // không spam CALL_ENDED và notification cuộc gọi nhỡ.
    const wasActive = session.status !== 'ended' && session.status !== 'missed';
    if (!wasActive) return session;

    session.status = isMissed ? 'missed' : 'ended';
    session.ended_at = new Date();
    session.end_reason = isMissed ? CALL_END_REASONS.MISSED : normalizedReason;
    await session.save();

    this.gateway.emitToUser(partnerId, SOCKET_EVENTS.CALL_ENDED, {
      sessionId: String(session._id),
      reason: isMissed ? CALL_END_REASONS.MISSED : normalizedReason,
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
            timeZone: 'Asia/Ho_Chi_Minh',
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
