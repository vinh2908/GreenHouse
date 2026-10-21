// stores/offline.store.ts — Trạng thái chế độ offline của thợ (Feature 16)
// Chỉ giữ state UI (online?, số thao tác chờ đồng bộ, đang xem dữ liệu cache?);
// dữ liệu thật (cache + hàng đợi) nằm ở AsyncStorage qua offline.service.ts.
import { create } from 'zustand';

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  fromCache: boolean;
  setOnline: (v: boolean) => void;
  setPendingCount: (n: number) => void;
  setFromCache: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>(set => ({
  isOnline: true,
  pendingCount: 0,
  fromCache: false,
  setOnline: v => set({ isOnline: v }),
  setPendingCount: n => set({ pendingCount: n }),
  setFromCache: v => set({ fromCache: v }),
}));
