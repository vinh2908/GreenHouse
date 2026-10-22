// hooks/use-sos-backup.ts — Lắng nghe sự kiện SOS Backup qua socket + bắt kịp
// trạng thái khi mở lại app (GET /sos-backup/active cho thợ,
// GET /sos-backup/customer-pending cho khách).
//
// Luồng phía server:
//  - SOS_BACKUP_DECISION_REQUESTED → khách: hiện popup quyết định (đổi người / hủy đơn)
//  - SOS_BACKUP_DECIDED            → đóng popup quyết định, làm mới đơn
//  - SOS_BACKUP_REQUEST            → thợ ứng viên: hiện popup "có người cần backup"
//  - SOS_BACKUP_RESOLVED           → đóng popup ứng viên (đã có người nhận / thu hồi / hết hạn)
//  - SOS_BACKUP_HELPER_REPLACED / SOS_BACKUP_EXPIRED → làm mới đơn liên quan
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useSosBackupStore } from '@/stores/sos-backup.store';

// ─── Bắt kịp trạng thái SOS qua REST ─────────────────────────────────────────
// Socket có thể lỡ sự kiện (app bị đóng, rớt mạng) mà cửa sổ quyết định của
// khách chỉ có 5 phút — nên ngoài lần chạy khi mở app, refreshSosState() còn
// được gọi khi: socket (re)connect, app quay lại foreground, và khi user chạm
// vào thông báo/push SOS. Chống chạy chồng + debounce 1.5s.
let sosRefreshInFlight = false;
let sosLastRefreshAt = 0;

export async function refreshSosState(): Promise<void> {
  if (!useAuthStore.getState().user?._id) return;
  const now = Date.now();
  if (sosRefreshInFlight || now - sosLastRefreshAt < 1500) return;
  sosRefreshInFlight = true;
  sosLastRefreshAt = now;
  try {
    const [activeRes, pendingRes] = await Promise.allSettled([
      apiClient.get('/sos-backup/active'),
      apiClient.get('/sos-backup/customer-pending'),
    ]);
    const { setIncoming, setDecision } = useSosBackupStore.getState();
    if (activeRes.status === 'fulfilled') {
      const incoming = activeRes.value?.data?.data?.incoming;
      if (Array.isArray(incoming) && incoming.length > 0) {
        setIncoming(incoming[0]);
      }
    }
    if (pendingRes.status === 'fulfilled') {
      const items = pendingRes.value?.data?.data?.items;
      if (Array.isArray(items) && items.length > 0) {
        const it = items[0];
        setDecision({
          sos_id: it.sos_id,
          job_id: it.job_id,
          job_title: it.job_title,
          service_name: it.service_name,
          reason: it.reason,
          district: it.district,
          city: it.city,
          decision_expires_at_ms: it.decision_expires_at_ms,
          photo_urls: it.photo_urls ?? [],
        });
      }
    }
  } catch {
    // Bắt kịp thất bại không quan trọng — socket vẫn đẩy sự kiện mới
  } finally {
    sosRefreshInFlight = false;
  }
}

export function useSosBackupListener() {
  const setIncoming = useSosBackupStore(s => s.setIncoming);
  const clearIncoming = useSosBackupStore(s => s.clearIncoming);
  const setDecision = useSosBackupStore(s => s.setDecision);
  const clearDecision = useSosBackupStore(s => s.clearDecision);
  const userId = useAuthStore(s => s.user?._id);
  const qc = useQueryClient();

  // Bắt kịp trạng thái khi đăng nhập / mở lại app (socket có thể đã lỡ sự kiện)
  useEffect(() => {
    if (!userId) return;
    void refreshSosState();
  }, [userId]);

  // Bắt kịp thêm mỗi khi socket nối lại hoặc app quay lại foreground —
  // sự kiện SOS đến trong lúc app nền/đóng sẽ được khôi phục tại đây.
  useEffect(() => {
    const unsubConnect = socketService.on('connect', () => {
      void refreshSosState();
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshSosState();
    });
    return () => {
      unsubConnect();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_REQUEST, payload => {
        if (!payload?.sos_id || !payload?.job_id) return;
        setIncoming({
          sos_id: payload.sos_id,
          job_id: payload.job_id,
          job_title: payload.job_title,
          service_name: payload.service_name,
          district: payload.district,
          city: payload.city,
          distance_km: payload.distance_km ?? null,
          payout: payload.payout ?? null,
          wave: payload.wave,
          expires_at_ms: payload.expires_at_ms,
          photo_urls: payload.photo_urls ?? [],
        });
      }),
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_RESOLVED, payload => {
        const current = useSosBackupStore.getState().incoming;
        if (current && payload?.sos_id === current.sos_id) {
          clearIncoming();
          if (payload?.outcome === 'taken') {
            Toast.show({
              type: 'info',
              text1: 'Đã có người khác nhận đơn backup này',
            });
          }
        }
      }),
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_DECISION_REQUESTED, payload => {
        if (!payload?.sos_id || !payload?.job_id) return;
        setDecision({
          sos_id: payload.sos_id,
          job_id: payload.job_id,
          job_title: payload.job_title,
          service_name: payload.service_name,
          reason: payload.reason,
          district: payload.district,
          city: payload.city,
          decision_expires_at_ms: payload.decision_expires_at_ms,
          photo_urls: payload.photo_urls ?? [],
        });
      }),
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_DECIDED, payload => {
        const current = useSosBackupStore.getState().decision;
        if (current && payload?.sos_id === current.sos_id) clearDecision();
        if (payload?.job_id) {
          qc.invalidateQueries({ queryKey: ['job', payload.job_id] });
          qc.invalidateQueries({
            queryKey: ['sos-backup', 'by-job', payload.job_id],
          });
        }
      }),
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_HELPER_REPLACED, payload => {
        const inc = useSosBackupStore.getState().incoming;
        if (inc && payload?.sos_id === inc.sos_id) clearIncoming();
        if (payload?.job_id) {
          qc.invalidateQueries({ queryKey: ['job', payload.job_id] });
          qc.invalidateQueries({
            queryKey: ['sos-backup', 'by-job', payload.job_id],
          });
        }
      }),
      socketService.on<any>(SOCKET_EVENTS.SOS_BACKUP_EXPIRED, payload => {
        const inc = useSosBackupStore.getState().incoming;
        if (inc && payload?.sos_id === inc.sos_id) clearIncoming();
        const dec = useSosBackupStore.getState().decision;
        if (dec && payload?.sos_id === dec.sos_id) clearDecision();
        if (payload?.job_id) {
          qc.invalidateQueries({ queryKey: ['job', payload.job_id] });
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [setIncoming, clearIncoming, setDecision, clearDecision, qc]);
}
