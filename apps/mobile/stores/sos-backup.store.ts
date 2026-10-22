// stores/sos-backup.store.ts — State UI của SOS Backup (popup toàn cục)
//  - incoming: lời mời nhận thay đơn gửi tới THỢ ứng viên (socket SOS_BACKUP_REQUEST)
//  - decision: yêu cầu quyết định gửi tới KHÁCH (socket SOS_BACKUP_DECISION_REQUESTED)
// Dữ liệu thật nằm ở server (SosBackupRequest); store chỉ giữ popup đang mở.
import { create } from 'zustand';

export type SosBackupReasonCode =
  'personal_emergency' | 'accident' | 'vehicle_breakdown' | 'family_emergency' | 'other';

/** Nhãn hiển thị cho khách/thợ — server chỉ gửi MÃ lý do, không chi tiết riêng tư */
export const SOS_BACKUP_REASON_LABELS: Record<string, string> = {
  personal_emergency: 'Việc cá nhân khẩn cấp',
  accident: 'Tai nạn',
  vehicle_breakdown: 'Xe hỏng / sự cố phương tiện',
  family_emergency: 'Việc gia đình khẩn cấp',
  other: 'Lý do khẩn cấp khác',
};

export interface SosBackupIncoming {
  sos_id: string;
  job_id: string;
  job_title?: string;
  service_name?: string;
  district?: string;
  city?: string;
  distance_km?: number | null;
  payout?: number | null;
  wave?: number;
  expires_at_ms?: number;
  /** Ảnh minh chứng sự cố của thợ gặp nạn (xe hư, tai nạn…) */
  photo_urls?: string[];
}

export interface SosDecisionRequest {
  sos_id: string;
  job_id: string;
  job_title?: string;
  service_name?: string;
  reason?: string;
  district?: string;
  city?: string;
  decision_expires_at_ms?: number;
  /** Ảnh minh chứng sự cố do thợ đính kèm — khách xem trước khi quyết định */
  photo_urls?: string[];
}

interface SosBackupState {
  incoming: SosBackupIncoming | null;
  decision: SosDecisionRequest | null;
  setIncoming: (incoming: SosBackupIncoming) => void;
  clearIncoming: () => void;
  setDecision: (decision: SosDecisionRequest) => void;
  clearDecision: () => void;
}

export const useSosBackupStore = create<SosBackupState>(set => ({
  incoming: null,
  decision: null,
  setIncoming: incoming => set({ incoming }),
  clearIncoming: () => set({ incoming: null }),
  setDecision: decision => set({ decision }),
  clearDecision: () => set({ decision: null }),
}));
