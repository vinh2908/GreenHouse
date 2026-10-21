// services/offline.service.ts — Chế độ offline cho app thợ (Roadmap Phase 2 — Feature 16)
//
// Thiết kế:
// - Cache (AsyncStorage): snapshot danh sách đơn của thợ + chi tiết từng đơn,
//   để mất mạng vẫn xem được việc đang làm.
// - Hàng đợi thao tác (AsyncStorage): các thao tác cập nhật tiến độ
//   (on_the_way / arrived / start / complete) bấm khi offline được xếp hàng,
//   tự gửi lại FIFO khi có mạng.
// - CHÍNH SÁCH XUNG ĐỘT: last-write-wins, trạng thái server thắng — nếu server
//   trả 4xx/409 (đơn đã đổi trạng thái bởi khách/admin/người khác) thì thao tác
//   trong hàng đợi bị HỦY BỎ, không thử lại, và báo cho thợ 1 lần.
// - LƯU Ý ẢNH: hàng đợi chỉ mang payload ĐÃ CHUẨN BỊ XONG (URL ảnh đã upload).
//   Hoàn thành đơn kèm ảnh MỚI chụp vẫn cần mạng để upload ảnh trước — không
//   upload được thì thao tác không vào hàng đợi (mutation ném lỗi như cũ).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import apiClient from '@/services/api-client';
import { useOfflineStore } from '@/stores/offline.store';

const KEY_ACTIVE_JOBS = 'gh_offline_active_jobs_v1';
const KEY_JOB_DETAIL = 'gh_offline_job_detail_v1';
const KEY_ACTION_QUEUE = 'gh_offline_action_queue_v1';

export type OfflineActionKind = 'on_the_way' | 'arrived' | 'start' | 'complete';

export interface QueuedAction {
  id: string;
  kind: OfflineActionKind;
  job_id: string;
  payload?: Record<string, unknown>;
  queued_at: string;
}

/** Sentinel trả về từ mutationFn khi thao tác đã được xếp hàng offline. */
export const QUEUED_OFFLINE = { queued_offline: true } as const;

/** Lỗi "mất mạng" = axios error không có response (network error / timeout). */
export function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; request?: unknown } | null;
  return !!e && typeof e === 'object' && !e.response;
}

// ─── Cache đơn của thợ ────────────────────────────────────────────────────────

export async function cacheActiveJobs(jobs: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY_ACTIVE_JOBS,
      JSON.stringify({ saved_at: new Date().toISOString(), jobs }),
    );
  } catch {
    /* cache lỗi không được làm hỏng luồng chính */
  }
}

export async function getCachedActiveJobs<T = unknown[]>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ACTIVE_JOBS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { jobs?: T };
    return parsed.jobs ?? null;
  } catch {
    return null;
  }
}

export async function cacheJobDetail(job: { _id?: string } | null | undefined): Promise<void> {
  if (!job?._id) return;
  try {
    const raw = await AsyncStorage.getItem(KEY_JOB_DETAIL);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    map[job._id] = job;
    await AsyncStorage.setItem(KEY_JOB_DETAIL, JSON.stringify(map));
  } catch {
    /* bỏ qua */
  }
}

export async function getCachedJobDetail<T = unknown>(jobId: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_JOB_DETAIL);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, T>;
    return map[jobId] ?? null;
  } catch {
    return null;
  }
}

// ─── Hàng đợi thao tác ────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ACTION_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_ACTION_QUEUE, JSON.stringify(queue));
  } catch {
    /* bỏ qua */
  }
  useOfflineStore.getState().setPendingCount(queue.length);
}

export async function enqueueAction(
  kind: OfflineActionKind,
  jobId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    job_id: jobId,
    payload,
    queued_at: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function loadPendingCount(): Promise<number> {
  const queue = await readQueue();
  useOfflineStore.getState().setPendingCount(queue.length);
  return queue.length;
}

/** Toast dùng chung khi 1 thao tác được xếp hàng offline. */
export function toastQueuedOffline(): void {
  Toast.show({
    type: 'info',
    text1: '📴 Đã lưu thao tác — sẽ tự đồng bộ khi có mạng',
  });
}

// ─── Kiểm tra kết nối + đồng bộ hàng đợi ─────────────────────────────────────

/**
 * Ping GET /health (route HealthController, qua global prefix /api/v1 đã có
 * trong baseURL). Dùng fetch thuần thay vì apiClient để tránh interceptor
 * (toast lỗi / refresh token) chạy mỗi 20 giây.
 */
export async function checkOnline(): Promise<boolean> {
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const ENDPOINT_BY_KIND: Record<OfflineActionKind, string> = {
  on_the_way: 'on-the-way',
  arrived: 'arrived',
  start: 'start',
  complete: 'complete',
};

let flushing = false;

/**
 * Gửi lại hàng đợi theo FIFO. Trả về số thao tác đã đồng bộ thành công.
 * - Thành công → xoá khỏi hàng đợi.
 * - HTTP 4xx/409 → server thắng: xoá, đếm là xung đột, báo 1 lần sau khi flush.
 * - Lỗi mạng / 5xx → dừng ngay, giữ phần còn lại cho lần flush sau.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let flushed = 0;
  try {
    const online = await checkOnline();
    useOfflineStore.getState().setOnline(online);
    if (!online) return 0;

    let queue = await readQueue();
    let conflicts = 0;

    while (queue.length > 0) {
      const item = queue[0];
      try {
        await apiClient.patch(
          `/jobs/${item.job_id}/${ENDPOINT_BY_KIND[item.kind]}`,
          item.payload ?? {},
        );
        queue = queue.slice(1);
        flushed += 1;
        await writeQueue(queue);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) {
          // Xung đột trạng thái: server thắng → hủy thao tác này, đi tiếp.
          queue = queue.slice(1);
          conflicts += 1;
          await writeQueue(queue);
          continue;
        }
        // Mất mạng / server lỗi → dừng, giữ lại phần còn lại.
        break;
      }
    }

    if (conflicts > 0) {
      Toast.show({
        type: 'error',
        text1: 'Một thao tác offline không còn áp dụng được (trạng thái đơn đã thay đổi)',
      });
    }
    if (flushed > 0) {
      Toast.show({
        type: 'success',
        text1: `☁️ Đã đồng bộ ${flushed} thao tác offline`,
      });
    }
    return flushed;
  } finally {
    flushing = false;
  }
}
