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
import { UseGuards, Logger } from '@nestjs/common';
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
    return { event: 'joined', room: `chat:${data.conversation_id}` };
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    client.leave(`chat:${data?.conversation_id}`);
  }

  // ─── Chat messages ────────────────────────────────────────────────────────

  @SubscribeMessage('chat:send')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string; content: string; type?: string },
  ) {
    const senderId = client.data.userId as string;
    if (!senderId) throw new WsException('Unauthorized');

    try {
      const message = await this.chatService.sendMessage(
        data.conversation_id,
        senderId,
        data.content,
        data.type ?? 'text',
      );

      // Broadcast to all in conversation room
      this.server.to(`chat:${data.conversation_id}`).emit(SOCKET_EVENTS.CHAT_NEW_MESSAGE, {
        message,
        conversation_id: data.conversation_id,
      });

      return { success: true, message_id: String(message._id) };
    } catch (err) {
      throw new WsException((err as Error).message);
    }
  }

  @SubscribeMessage('chat:read')
  async handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    const userId = client.data.userId as string;
    if (!(await this.chatService.isParticipant(data?.conversation_id, userId))) return;
    await this.chatService.markRead(data.conversation_id, userId);
    this.server.to(`chat:${data.conversation_id}`).emit(SOCKET_EVENTS.CHAT_MESSAGE_READ, {
      conversation_id: data.conversation_id,
      user_id: userId,
    });
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

  emitToJob(jobId: string, event: string, data: unknown) {
    this.server.to(`job:${jobId}`).emit(event, data);
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
