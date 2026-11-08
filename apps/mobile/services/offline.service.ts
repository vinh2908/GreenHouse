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
import { queryClient } from '@/services/query-client';
import { useOfflineStore } from '@/stores/offline.store';
import { useSettingsStore } from '@/stores/settings.store';

const KEY_ACTIVE_JOBS = 'gh_offline_active_jobs_v1';
const KEY_JOB_DETAIL = 'gh_offline_job_detail_v1';
const KEY_ACTION_QUEUE = 'gh_offline_action_queue_v1';

export type OfflineActionKind = 'on_the_way' | 'arrived' | 'start' | 'complete';

export interface QueuedAction {
  id: string;
  kind: OfflineActionKind;
  job_id: string;
  previous_status?: string;
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

/** H14 & K6: Phân biệt timeout (mạng chậm/quá giờ, gồm ECONNABORTED & ETIMEDOUT) vs mất mạng thật */
export function isTimeoutError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return (
    e?.code === 'ECONNABORTED' ||
    e?.code === 'ETIMEDOUT' ||
    (typeof e?.message === 'string' && /timeout/i.test(e.message))
  );
}

export function isNetworkLostError(err: unknown): boolean {
  return isNetworkError(err) && !isTimeoutError(err);
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
  // N5: Snapshot trạng thái pre-offline ban đầu: nếu đã có action trước đó trong hàng đợi cho đơn này,
  // giữ nguyên previous_status gốc để các action kế tiếp không rollback nhầm về trạng thái lạc quan.
  const existingJobAction = queue.find(a => a.job_id === jobId && a.previous_status);
  const cachedCurrent = await getCachedJobDetail<Record<string, unknown>>(jobId);
  const prevStatus =
    existingJobAction?.previous_status ?? (cachedCurrent?.status as string) ?? undefined;

  // M-10: Chống trùng lặp hàng đợi offline theo (kind, job_id)
  const existingIdx = queue.findIndex(a => a.kind === kind && a.job_id === jobId);
  const action: QueuedAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    job_id: jobId,
    previous_status: prevStatus,
    payload,
    queued_at: new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    queue[existingIdx] = action; // cập nhật payload mới nhất, không sinh trùng
  } else {
    queue.push(action);
  }
  await writeQueue(queue);

  // H14 & K6: Cập nhật trạng thái lạc quan trong cache chi tiết đơn, danh sách đơn của thợ và React Query cache
  const STATUS_BY_KIND: Record<OfflineActionKind, string> = {
    on_the_way: 'helper_on_the_way',
    arrived: 'helper_arrived',
    start: 'in_progress',
    complete: 'pending_review',
  };
  const optimisticStatus = STATUS_BY_KIND[kind];
  if (optimisticStatus) {
    try {
      const cached = await getCachedJobDetail<Record<string, unknown>>(jobId);
      if (cached) {
        cached.status = optimisticStatus;
        cached.updated_at = new Date().toISOString();
        await cacheJobDetail(cached);
      }
      const activeJobs = await getCachedActiveJobs<any[]>();
      if (Array.isArray(activeJobs)) {
        const idx = activeJobs.findIndex(j => String(j._id) === String(jobId));
        if (idx >= 0) {
          activeJobs[idx] = { ...activeJobs[idx], status: optimisticStatus };
          await cacheActiveJobs(activeJobs);
        }
      }

      // K6 & N5: Cập nhật cả React Query cache của màn hình đã render, bao gồm danh sách đơn đang nhận
      queryClient.setQueryData(['job', jobId], (old: any) => {
        if (!old) return old;
        return { ...old, status: optimisticStatus, updated_at: new Date().toISOString() };
      });
      queryClient.setQueriesData({ queryKey: ['jobs', 'helper'] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map(j =>
            String(j._id) === String(jobId) ? { ...j, status: optimisticStatus } : j,
          );
        }
        if (Array.isArray(old.items)) {
          return {
            ...old,
            items: old.items.map((j: any) =>
              String(j._id) === String(jobId) ? { ...j, status: optimisticStatus } : j,
            ),
          };
        }
        return old;
      });
      queryClient.setQueriesData({ queryKey: ['jobs', 'available'] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map(j =>
            String(j._id) === String(jobId) ? { ...j, status: optimisticStatus } : j,
          );
        }
        if (Array.isArray(old.items)) {
          return {
            ...old,
            items: old.items.map((j: any) =>
              String(j._id) === String(jobId) ? { ...j, status: optimisticStatus } : j,
            ),
          };
        }
        return old;
      });
    } catch {
      /* bỏ qua lỗi cache */
    }
  }
}

/** K6 & N5: Rollback trạng thái lạc quan khi flush gặp xung đột (4xx/409) */
export async function rollbackOptimisticStatus(jobId: string, prevStatus?: string): Promise<void> {
  const targetStatus = prevStatus || 'confirmed';
  try {
    const cached = await getCachedJobDetail<Record<string, unknown>>(jobId);
    if (cached) {
      cached.status = targetStatus;
      cached.updated_at = new Date().toISOString();
      await cacheJobDetail(cached);
    }
    const activeJobs = await getCachedActiveJobs<any[]>();
    if (Array.isArray(activeJobs)) {
      const idx = activeJobs.findIndex(j => String(j._id) === String(jobId));
      if (idx >= 0) {
        activeJobs[idx] = { ...activeJobs[idx], status: targetStatus };
        await cacheActiveJobs(activeJobs);
      }
    }
    queryClient.setQueryData(['job', jobId], (old: any) => {
      if (!old) return old;
      return { ...old, status: targetStatus, updated_at: new Date().toISOString() };
    });
    queryClient.setQueriesData({ queryKey: ['jobs', 'helper'] }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        return old.map(j => (String(j._id) === String(jobId) ? { ...j, status: targetStatus } : j));
      }
      if (Array.isArray(old.items)) {
        return {
          ...old,
          items: old.items.map((j: any) =>
            String(j._id) === String(jobId) ? { ...j, status: targetStatus } : j,
          ),
        };
      }
      return old;
    });
    queryClient.setQueriesData({ queryKey: ['jobs', 'available'] }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        return old.map(j => (String(j._id) === String(jobId) ? { ...j, status: targetStatus } : j));
      }
      if (Array.isArray(old.items)) {
        return {
          ...old,
          items: old.items.map((j: any) =>
            String(j._id) === String(jobId) ? { ...j, status: targetStatus } : j,
          ),
        };
      }
      return old;
    });
    queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
  } catch {
    /* rollback cache error ignored */
  }
}

export async function loadPendingCount(): Promise<number> {
  const queue = await readQueue();
  useOfflineStore.getState().setPendingCount(queue.length);
  return queue.length;
}

/** Toast dùng chung khi 1 thao tác được xếp hàng offline: phân biệt timeout vs mất mạng */
export function toastQueuedOffline(err?: unknown): void {
  const lang = useSettingsStore.getState().language;
  const timeout = isTimeoutError(err);
  Toast.show({
    type: 'info',
    text1: timeout
      ? lang === 'en'
        ? 'Connection slow / timed out — action queued for auto-sync'
        : 'Kết nối mạng chậm / quá giờ — đã lưu thao tác để tự đồng bộ'
      : lang === 'en'
        ? 'Network lost — action queued for auto-sync'
        : 'Mất kết nối mạng — đã lưu thao tác để tự đồng bộ khi có mạng',
  });
}

// ─── Kiểm tra kết nối + đồng bộ hàng đợi ─────────────────────────────────────

/**
 * Ping GET /health (route HealthController, qua global prefix /api/v1 đã có
 * trong baseURL). Dùng fetch thuần thay vì apiClient để tránh interceptor
 * (toast lỗi / refresh token) chạy mỗi 20 giây.
 * Tăng thời gian chờ lên 12s để tránh báo offline giả khi server Render mới tỉnh giấc.
 */
export async function checkOnline(): Promise<boolean> {
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let consecutiveFailures = 0;

/**
 * Cập nhật trạng thái online theo cơ chế chống nhấp nháy:
 * - Khi kết nối thành công: reset đếm lỗi về 0, chuyển ngay sang online.
 * - Khi thất bại: tăng số lần thất bại liên tiếp; CHỈ chuyển sang offline sau 2 lần
 *   thất bại liên tiếp (không đổi trạng thái vì 1 lần kiểm tra chậm hay server Render lúc mới tỉnh).
 */
export function updateOnlineStatus(isHealthy: boolean): boolean {
  if (isHealthy) {
    consecutiveFailures = 0;
    useOfflineStore.getState().setOnline(true);
    return true;
  } else {
    consecutiveFailures += 1;
    if (consecutiveFailures >= 2) {
      useOfflineStore.getState().setOnline(false);
      return false;
    }
    return useOfflineStore.getState().isOnline;
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
    const isHealthy = await checkOnline();
    const online = updateOnlineStatus(isHealthy);
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
          // K6 & N5: Xung đột trạng thái: server thắng → hủy thao tác này, rollback trạng thái lạc quan
          queue = queue.slice(1);
          conflicts += 1;
          await writeQueue(queue);
          await rollbackOptimisticStatus(item.job_id, item.previous_status);
          continue;
        }
        // Mất mạng / server lỗi → dừng, giữ lại phần còn lại.
        break;
      }
    }

    const lang = useSettingsStore.getState().language;
    if (conflicts > 0) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'An offline action could not be applied (job status changed)'
            : 'Một thao tác offline không còn áp dụng được (trạng thái đơn đã thay đổi)',
      });
    }
    if (flushed > 0) {
      Toast.show({
        type: 'success',
        text1:
          lang === 'en'
            ? `Synced ${flushed} offline action(s)`
            : ` Đã đồng bộ ${flushed} thao tác offline`,
      });
    }
    return flushed;
  } finally {
    flushing = false;
  }
}
