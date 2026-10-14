// services/socket.service.ts
// Singleton Socket.IO client với auto-reconnect và event management
import { io, Socket } from 'socket.io-client';
import * as SecureStore from '@/services/secure-storage';
import Constants from 'expo-constants';
import { SOCKET_EVENTS } from '@homemate/constants';
import apiClient from '@/services/api-client';

const getBaseWsUrl = () => {
  // Fixed URL from apps/mobile/.env; otherwise derived from the API URL or Metro's host.
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const extraWsUrl =
    process.env.EXPO_PUBLIC_WS_URL ||
    Constants.expoConfig?.extra?.wsUrl ||
    (apiUrl ? apiUrl.replace(/\/api\/v1\/?$/, '') : undefined);
  if (extraWsUrl) {
    return extraWsUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:3000`;
    }
  }

  // In a browser the API runs on the same machine that serves the page.
  const webHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (webHost) {
    return `http://${webHost}:3000`;
  }

  // Android emulator alias for the host machine (same fallback as api-client).
  return 'http://10.0.2.2:3000';
};

const WS_URL = getBaseWsUrl();

class SocketService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  // Rooms to re-join after every (re)connect; the server forgets them on disconnect.
  private rooms = new Map<string, { event: string; payload: unknown }>();

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    // Drop a stale disconnected socket so we never end up with two live ones.
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    const token = await SecureStore.getItemAsync('homemate_access_token');
    if (!token) return;

    this.socket = io(WS_URL, {
      // Read the token on every (re)connect so a refreshed token is picked up.
      auth: cb => {
        SecureStore.getItemAsync('homemate_access_token')
          .then(t => cb({ token: t }))
          .catch(() => cb({ token }));
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.rooms.forEach(({ event, payload }) => this.socket?.emit(event, payload));
    });

    this.socket.on('disconnect', reason => {
      console.log('[Socket] Disconnected:', reason);
      // The server drops sockets with an expired token and socket.io will not retry
      // a server-side disconnect. Any authenticated request refreshes the token
      // (api-client interceptor); then reconnect.
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          apiClient
            .get('/notifications/unread-count')
            .catch(() => undefined)
            .finally(() => {
              SecureStore.getItemAsync('homemate_access_token').then(t => {
                if (t && this.socket && !this.socket.connected) this.socket.connect();
              });
            });
        }, 1000);
      }
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
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.rooms.clear();
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

  private join(key: string, event: string, payload: unknown): void {
    this.rooms.set(key, { event, payload });
    this.emit(event, payload);
  }

  joinJob(jobId: string): void {
    this.join(`job:${jobId}`, 'join:job', { job_id: jobId });
  }

  leaveJob(jobId: string): void {
    this.rooms.delete(`job:${jobId}`);
    this.emit('leave:job', { job_id: jobId });
  }

  joinConversation(conversationId: string): void {
    this.join(`chat:${conversationId}`, 'join:conversation', { conversation_id: conversationId });
  }

  leaveConversation(conversationId: string): void {
    this.rooms.delete(`chat:${conversationId}`);
    this.emit('leave:conversation', { conversation_id: conversationId });
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
