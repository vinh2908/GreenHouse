/**
 * R12-26: classify a job-detail fetch failure so the screen can say what
 * actually happened instead of collapsing every failure into one message.
 *
 * Live bug: the customer detail screen ignored useJobDetail's error entirely
 * — ANY failure (410 Gone for a cancelled job, a transient network/timeout
 * failure, a real 404) rendered "Không tìm thấy thông tin đơn hàng". The
 * helper screen did distinguish 410, but only with the generic
 * "Đơn này không còn khả dụng" and never the server's reason.
 *
 * API error shape (HttpExceptionFilter): { success: false, message, error:
 * { code, details } }. A cancelled job answers 410 Gone with message
 * 'Đơn này đã bị hủy' (jobs.service.ts getJobForUser, R8-B); other
 * non-browsable jobs answer 410 with 'Đơn này không còn khả dụng'. A
 * missing job answers 404. No `response` at all means the request never
 * reached the API (offline / timeout / Render asleep) — retryable, and
 * must never be presented as "not found".
 *
 * Pure TS, zero imports (same pattern as utils/job-unavailable.ts) so the
 * API jest harness can import it via `@/utils/job-detail-error`.
 */

export type JobDetailErrorKind =
  | 'not_found' // 404 — the job does not exist (any more).
  | 'gone_cancelled' // 410 + server says the job was cancelled.
  | 'gone_other' // 410 — expired / assigned elsewhere / completed, ...
  | 'forbidden' // 403 — private offer for another helper / unverified.
  | 'network' // No response: offline, timeout, API asleep — retryable.
  | 'server'; // 5xx / anything else.

export interface JobDetailErrorState {
  kind: JobDetailErrorKind;
  /** Server message when present (e.g. 'Đơn này đã bị hủy'). */
  serverMessage?: string;
}

function readMessage(error: unknown): string | undefined {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  }
  return undefined;
}

function readStatus(error: unknown): number | undefined {
  const err = error as { response?: { status?: unknown }; status?: unknown };
  const raw = err?.response?.status ?? err?.status;
  return typeof raw === 'number' ? raw : undefined;
}

function readCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { error?: { code?: unknown } } } })?.response
    ?.data;
  const code = data?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

export function resolveJobDetailErrorState(error: unknown): JobDetailErrorState {
  const status = readStatus(error);
  const serverMessage = readMessage(error);
  const code = readCode(error)?.toLowerCase();

  // HTTP status wins when present: the API's error `code` is a fallback
  // field (it can be a generic 'Gone' on a non-410), so a code match must
  // never override an explicit status — a 500 with a stray 'Gone' code
  // is a server failure, not a gone job.
  if (status === 404) return { kind: 'not_found', serverMessage };
  if (status === 410) {
    const msg = (serverMessage ?? '').toLowerCase();
    // The server distinguishes the two 410s by message (getJobForUser):
    // cancelled → 'Đơn này đã bị hủy', anything else → 'Đơn này không còn
    // khả dụng'. Match the message, not the language of the client.
    const cancelled =
      msg.includes('đã bị hủy') || msg.includes('cancelled') || msg.includes('canceled');
    return { kind: cancelled ? 'gone_cancelled' : 'gone_other', serverMessage };
  }
  if (status === 403) return { kind: 'forbidden', serverMessage };
  if (status !== undefined && status >= 500) {
    return { kind: 'server', serverMessage };
  }
  if (status !== undefined) {
    return { kind: 'server', serverMessage };
  }
  // No HTTP status: fall back to the API error code, if any.
  if (code === 'not_found') return { kind: 'not_found', serverMessage };
  if (code === 'gone') {
    const msg = (serverMessage ?? '').toLowerCase();
    const cancelled =
      msg.includes('đã bị hủy') || msg.includes('cancelled') || msg.includes('canceled');
    return { kind: cancelled ? 'gone_cancelled' : 'gone_other', serverMessage };
  }
  if (code === 'forbidden') return { kind: 'forbidden', serverMessage };
  // No HTTP status at all — the request never got an answer.
  return { kind: 'network', serverMessage };
}
