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
import { CallSession, CallSessionDocument } from './schemas/call-session.schema';
import { CallProvider, CALL_PROVIDER } from './call-provider.interface';
import { SOCKET_EVENTS } from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';

export const CALL_NOT_CONFIGURED_MESSAGE =
  'Tính năng gọi thoại trong app chưa được kích hoạt trên hệ thống. Vui lòng liên lạc qua chat hoặc số điện thoại đã xác thực.';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @Inject(CALL_PROVIDER) private readonly provider: CallProvider,
    private readonly gateway: AppGateway,
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

  /** Kết thúc phiên gọi (mobile gọi khi cúp máy / bị từ chối) */
  async endCall(sessionId: string, userId: string, reason?: string) {
    const session = await this.callSessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Phiên gọi không tồn tại');
    if (
      String(session.caller_id) !== userId &&
      String(session.callee_id) !== userId
    ) {
      throw new ForbiddenException('Bạn không thuộc phiên gọi này');
    }
    if (session.status !== 'ended') {
      session.status = reason === 'missed' ? 'missed' : 'ended';
      session.ended_at = new Date();
      session.end_reason = reason;
      await session.save();
    }
    return session;
  }
}
