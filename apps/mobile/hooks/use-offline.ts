// hooks/use-offline.ts — Vòng lặp đồng bộ offline (Roadmap Phase 2 — Feature 16)
// Gọi 1 lần ở root layout: kiểm tra kết nối + flush hàng đợi khi app mở,
// mỗi 20 giây, và mỗi khi app quay lại foreground (AppState 'active').
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { checkOnline, flushQueue, loadPendingCount } from '@/services/offline.service';
import { useOfflineStore } from '@/stores/offline.store';

export function useOfflineSync() {
  const isOnline = useOfflineStore(s => s.isOnline);
  const pendingCount = useOfflineStore(s => s.pendingCount);
  const fromCache = useOfflineStore(s => s.fromCache);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      await loadPendingCount();
      await flushQueue(); // flushQueue tự checkOnline + cập nhật store.isOnline
      if (cancelled) return;
    };

    void tick();
    const interval = setInterval(() => {
      void (async () => {
        const online = await checkOnline();
        useOfflineStore.getState().setOnline(online);
        if (online) await flushQueue();
      })();
    }, 20_000);

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void tick();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return { isOnline, pendingCount, fromCache };
}
