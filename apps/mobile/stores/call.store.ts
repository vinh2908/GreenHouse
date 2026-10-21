// stores/call.store.ts — Cuộc gọi thoại đến đang chờ nhận (Phase 1, Feature 6)
// Chỉ giữ state UI của cuộc gọi đến (từ socket CALL_INCOMING); phiên gọi
// thật nằm ở server (CallSession) + Stringee SDK qua stringee.service.ts.
import { create } from 'zustand';

export interface IncomingCall {
  session_id: string;
  job_id: string;
  caller_id: string;
  room_id?: string;
  provider?: string;
}

interface CallState {
  incoming: IncomingCall | null;
  setIncoming: (incoming: IncomingCall) => void;
  clearIncoming: () => void;
}

export const useCallStore = create<CallState>(set => ({
  incoming: null,
  setIncoming: incoming => set({ incoming }),
  clearIncoming: () => set({ incoming: null }),
}));
