// services/socket.service.ts
// Singleton Socket.IO client với auto-reconnect và event management
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { SOCKET_EVENTS } from '@homemate/constants';

const WS_URL = Constants.expoConfig?.extra?.wsUrl || 'http://localhost:3000';

class SocketService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    const token = await SecureStore.getItemAsync('homemate_access_token');
    if (!token) return;

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      // Re-subscribe all listeners
    });

    this.socket.on('disconnect', reason => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', err => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Forward all tracked events
    this.listeners.forEach((_, event) => {
      this.socket?.on(event, (data: unknown) => {
        this.listeners.get(event)?.forEach(cb => cb(data));
      });
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on<T = unknown>(event: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      // Attach to socket if already connected
      this.socket?.on(event, (data: unknown) => {
        this.listeners.get(event)?.forEach(cb => cb(data));
      });
    }
    this.listeners.get(event)!.add(callback as (data: unknown) => void);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as (data: unknown) => void);
    };
  }

  emit(event: string, data?: unknown): void {
    this.socket?.emit(event, data);
  }

  joinJob(jobId: string): void {
    this.emit('join:job', { job_id: jobId });
  }

  leaveJob(jobId: string): void {
    this.emit('leave:job', { job_id: jobId });
  }

  joinConversation(conversationId: string): void {
    this.emit('join:conversation', { conversation_id: conversationId });
  }

  sendMessage(conversationId: string, content: string): void {
    this.emit('chat:send', { conversation_id: conversationId, content });
  }

  markRead(conversationId: string): void {
    this.emit('chat:read', { conversation_id: conversationId });
  }

  updateLocation(jobId: string, lat: number, lng: number): void {
    this.emit('helper:location', { job_id: jobId, lat, lng });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
export { SOCKET_EVENTS };
