// hooks/use-offline.ts — Vòng lặp đồng bộ offline (Roadmap Phase 2 — Feature 16)
// Gọi 1 lần ở root layout: kiểm tra kết nối + flush hàng đợi khi app mở,
// mỗi 20 giây, và mỗi khi app quay lại foreground (AppState 'active').
import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  checkOnline,
  flushQueue,
  loadPendingCount,
  updateOnlineStatus,
} from '@/services/offline.service';
import { socketService } from '@/services/socket.service';
import { useOfflineStore } from '@/stores/offline.store';

export function useOfflineSync() {
  const isOnline = useOfflineStore(s => s.isOnline);
  const pendingCount = useOfflineStore(s => s.pendingCount);
  const fromCache = useOfflineStore(s => s.fromCache);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      await loadPendingCount();
      await flushQueue(); // flushQueue tự checkOnline + cập nhật store.isOnline qua updateOnlineStatus
      if (cancelled) return;
    };

    void tick();
    const interval = setInterval(() => {
      void (async () => {
        const isHealthy = await checkOnline();
        const online = updateOnlineStatus(isHealthy);
        if (online) await flushQueue();
      })();
    }, 20_000);

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void tick();
    });

    let lastSocketStatus = socketService.getStatusState().status;
    const unsubSocket = socketService.onStatusChange(st => {
      if (st.status === 'connected' && lastSocketStatus !== 'connected') {
        void tick();
      }
      lastSocketStatus = st.status;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
      unsubSocket();
    };
  }, []);

  return { isOnline, pendingCount, fromCache };
}
