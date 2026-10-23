// hooks/use-incoming-call.ts — Lắng nghe cuộc gọi đến qua socket (Phase 1, F6)
// Server emit SOCKET_EVENTS.CALL_INCOMING ('call:incoming') tới callee khi
// caller gọi POST /calls/token. Payload (calls.service.ts initiateCall):
//   { job_id, session_id, caller_id, room_id, provider }
// Map defensively cả dạng sessionId/jobId nếu server thay đổi casing.
import { useEffect } from 'react';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { useCallStore } from '@/stores/call.store';

interface CallIncomingPayload {
  job_id?: string;
  jobId?: string;
  session_id?: string;
  sessionId?: string;
  caller_id?: string;
  callerId?: string;
  room_id?: string;
  roomId?: string;
  provider?: string;
}

export function useIncomingCallListener() {
  const setIncoming = useCallStore(s => s.setIncoming);

  useEffect(() => {
    const unsub = socketService.on<CallIncomingPayload>(SOCKET_EVENTS.CALL_INCOMING, payload => {
      const session_id = payload?.session_id ?? payload?.sessionId;
      const job_id = payload?.job_id ?? payload?.jobId;
      const caller_id = payload?.caller_id ?? payload?.callerId ?? '';
      if (!session_id || !job_id) return;
      setIncoming({
        session_id,
        job_id,
        caller_id,
        room_id: payload?.room_id ?? payload?.roomId,
        provider: payload?.provider,
      });
    });
    return unsub;
  }, [setIncoming]);
}
