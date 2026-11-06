import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { SOCKET_EVENTS } from '@homemate/constants';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);

  // Map userId → Set of socketIds (one user can have multiple connections)
  private userSockets = new Map<string, Set<string>>();

  // B115: refcount phòng chat — conversationId → Set<socketId> đang ở trong room.
  // Rời phòng giảm refcount; còn 0 người thì đánh dấu phòng đã đóng (không xóa tin nhắn).
  private conversationOccupancy = new Map<string, Set<string>>();

  private async trackConversationJoin(conversationId: string, socketId: string) {
    let set = this.conversationOccupancy.get(conversationId);
    if (!set) {
      set = new Set();
      this.conversationOccupancy.set(conversationId, set);
    }
    set.add(socketId);
    await this.chatService.markConversationOpen(conversationId);
  }

  private async trackConversationLeave(conversationId: string, socketId: string) {
    const set = this.conversationOccupancy.get(conversationId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
      this.conversationOccupancy.delete(conversationId);
      await this.chatService.markConversationClosed(conversationId);
    }
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
  ) {}

  // Only the job's customer, its assigned helper or an admin may listen to a job room
  // (status updates, live helper location).
  private async canAccessJob(client: Socket, jobId: string, helperOnly = false): Promise<boolean> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !Types.ObjectId.isValid(jobId)) return false;
    if (!helperOnly && (client.data.roles as string[] | undefined)?.includes('admin')) return true;
    const job = await this.jobModel.findById(jobId).select('customer_id helper_id').lean().exec();
    if (!job) return false;
    if (helperOnly) return String(job.helper_id) === userId;
    return String(job.customer_id) === userId || String(job.helper_id) === userId;
  }

  // ─── Connection handling ───────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      const userId = payload.sub as string;
      client.data.userId = userId;
      client.data.roles = payload.roles;

      // Join personal room
      client.join(`user:${userId}`);

      // A77: Admin tự động tham gia room:admins để nhận thông báo công việc mới tức thì
      if (Array.isArray(payload.roles) && payload.roles.includes('admin')) {
        client.join('room:admins');
      }

      // Track socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      this.logger.warn(`Unauthorized socket connection: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // B115: ngắt kết nối cũng tính là rời phòng — cập nhật refcount cho mọi room đang ở
    for (const conversationId of [...this.conversationOccupancy.keys()]) {
      void this.trackConversationLeave(conversationId, client.id);
    }
    const userId = client.data.userId as string;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Room management ──────────────────────────────────────────────────────

  @SubscribeMessage('join:job')
  async handleJoinJob(@ConnectedSocket() client: Socket, @MessageBody() data: { job_id: string }) {
    if (!(await this.canAccessJob(client, data?.job_id))) throw new WsException('Forbidden');
    await client.join(`job:${data.job_id}`);
    const job = await this.jobModel
      .findById(data.job_id)
      .select('status helper_id live_helper_location')
      .lean()
      .exec();
    const point = job?.live_helper_location;
    if (
      job?.status === 'helper_on_the_way' &&
      point &&
      point.helper_id === String(job.helper_id) &&
      Date.now() - point.recorded_at <= 120_000
    ) {
      client.emit(SOCKET_EVENTS.HELPER_LOCATION_UPDATE, {
        job_id: data.job_id,
        helper_id: point.helper_id,
        location: point,
      });
    }
    return { event: 'joined', room: `job:${data.job_id}` };
  }

  @SubscribeMessage('leave:job')
  handleLeaveJob(@ConnectedSocket() client: Socket, @MessageBody() data: { job_id: string }) {
    client.leave(`job:${data.job_id}`);
  }

  // B113: khách đang xem hồ sơ thợ thì vào room helper:<id> để nhận
  // helper:status_changed (trạng thái thợ là thông tin công khai trên hồ sơ).
  @SubscribeMessage('join:helper')
  handleJoinHelper(@ConnectedSocket() client: Socket, @MessageBody() data: { helper_id: string }) {
    if (!data?.helper_id) throw new WsException('helper_id bắt buộc');
    client.join(`helper:${data.helper_id}`);
    return { event: 'joined', room: `helper:${data.helper_id}` };
  }

  @SubscribeMessage('leave:helper')
  handleLeaveHelper(@ConnectedSocket() client: Socket, @MessageBody() data: { helper_id: string }) {
    client.leave(`helper:${data?.helper_id}`);
  }

  @SubscribeMessage('join:conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    const userId = client.data.userId as string;
    if (!(await this.chatService.isParticipant(data?.conversation_id, userId))) {
      throw new WsException('Forbidden');
    }
    client.join(`chat:${data.conversation_id}`);
    await this.trackConversationJoin(data.conversation_id, client.id);
    return { event: 'joined', room: `chat:${data.conversation_id}` };
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    client.leave(`chat:${data?.conversation_id}`);
    if (data?.conversation_id) {
      void this.trackConversationLeave(data.conversation_id, client.id);
    }
  }

  // ─── Chat messages (REST only — socket send path removed, B40) ─────────────

  @SubscribeMessage('chat:read')
  async handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    const userId = client.data.userId as string;
    if (!(await this.chatService.isParticipant(data?.conversation_id, userId))) return;
    await this.chatService.markRead(data.conversation_id, userId);
  }

  // ─── Helper location update ────────────────────────────────────────────────

  @SubscribeMessage('helper:location')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { job_id: string; lat: number; lng: number; recorded_at: number; accuracy?: number },
  ) {
    const helperId = client.data.userId as string;
    const now = Date.now();
    if (
      !data ||
      !Number.isFinite(data.lat) ||
      Math.abs(data.lat) > 90 ||
      !Number.isFinite(data.lng) ||
      Math.abs(data.lng) > 180 ||
      !Number.isFinite(data.recorded_at) ||
      now - data.recorded_at > 30_000 ||
      data.recorded_at > now + 10_000 ||
      (data.accuracy != null &&
        (!Number.isFinite(data.accuracy) || data.accuracy < 0 || data.accuracy > 100))
    ) {
      throw new WsException('GPS không hợp lệ hoặc đã cũ');
    }
    if (!helperId || !Types.ObjectId.isValid(data.job_id)) throw new WsException('Forbidden');
    const point = {
      lat: data.lat,
      lng: data.lng,
      recorded_at: data.recorded_at,
      accuracy: data.accuracy,
      helper_id: helperId,
    };
    // Atomic assignment/status and timestamp check: reject another helper, a finished job,
    // and out-of-order fixes even when two devices use the same helper account.
    const saved = await this.jobModel
      .findOneAndUpdate(
        {
          _id: data.job_id,
          helper_id: new Types.ObjectId(helperId),
          status: 'helper_on_the_way',
          $or: [
            { 'live_helper_location.recorded_at': { $exists: false } },
            { 'live_helper_location.recorded_at': { $lt: data.recorded_at } },
          ],
        },
        { $set: { live_helper_location: point } },
        { new: true },
      )
      .select('_id')
      .lean()
      .exec();
    if (!saved) throw new WsException('GPS không thuộc chuyến đi hiện tại hoặc đã cũ');
    // Broadcast to job room so customer can see helper moving
    this.server.to(`job:${data.job_id}`).emit(SOCKET_EVENTS.HELPER_LOCATION_UPDATE, {
      helper_id: helperId,
      job_id: data.job_id,
      location: point,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Public emit helpers (called from services) ────────────────────────────

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // A77: Phát sự kiện realtime tới toàn bộ Quản trị viên
  emitToAdmins(event: string, data: unknown) {
    this.server.to('room:admins').emit(event, data);
  }

  emitToJob(jobId: string, event: string, data: unknown) {
    this.server.to(`job:${jobId}`).emit(event, data);
  }

  // B113: phát helper:status_changed cho thợ + khách đang xem hồ sơ thợ
  // (room helper:<id>) + khách có đơn đang hoạt động với thợ đó (room job +
  // phòng riêng của khách). Không phát cho khách không liên quan.
  async broadcastHelperStatus(helperId: string, status: string) {
    const payload = { helper_id: helperId, status };
    this.emitToUser(helperId, SOCKET_EVENTS.HELPER_STATUS_CHANGED, payload);
    this.server.to(`helper:${helperId}`).emit(SOCKET_EVENTS.HELPER_STATUS_CHANGED, payload);
    const jobs = await this.jobModel
      .find({
        helper_id: new Types.ObjectId(helperId),
        status: {
          $in: ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress', 'pending_review'],
        },
      })
      .select('customer_id')
      .lean()
      .exec();
    const customerIds = [...new Set(jobs.map(j => String(j.customer_id)))];
    for (const customerId of customerIds) {
      this.emitToUser(customerId, SOCKET_EVENTS.HELPER_STATUS_CHANGED, payload);
    }
    for (const job of jobs) {
      this.emitToJob(String((job as any)._id), SOCKET_EVENTS.HELPER_STATUS_CHANGED, payload);
    }
  }

  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.server.to(`chat:${conversationId}`).emit(event, data);
  }

  async isUserInRoom(userId: string, room: string): Promise<boolean> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.some(s => s.data?.userId === userId);
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}
