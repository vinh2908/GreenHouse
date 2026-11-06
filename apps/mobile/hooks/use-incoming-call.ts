// hooks/use-incoming-call.ts — Lắng nghe cuộc gọi đến qua socket (Phase 1, F6)
// Server emit SOCKET_EVENTS.CALL_INCOMING ('call:incoming') tới callee khi
// caller gọi POST /calls/token. Payload (calls.service.ts initiateCall):
//   { job_id, session_id, caller_id, room_id, provider }
// Map defensively cả dạng sessionId/jobId nếu server thay đổi casing.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { useCallStore } from '@/stores/call.store';
import { callkeepService } from '@/services/callkeep.service';
import { ringtoneService } from '@/services/ringtone.service';

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
  const clearIncoming = useCallStore(s => s.clearIncoming);

  useEffect(() => {
    const unsubIncoming = socketService.on<CallIncomingPayload>(
      SOCKET_EVENTS.CALL_INCOMING,
      payload => {
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
        if (Platform.OS !== 'web') {
          callkeepService.displayIncoming({
            sessionId: session_id,
            jobId: job_id,
            callerId: caller_id,
            callerName: 'Đối tác GreenHouse',
          });
        }
      },
    );

    const handleCallEnded = (payload?: { sessionId?: string; session_id?: string }) => {
      const currentIncoming = useCallStore.getState().incoming;
      const targetSession = payload?.sessionId ?? payload?.session_id;
      if (!targetSession || !currentIncoming || currentIncoming.session_id === targetSession) {
        ringtoneService.stop();
        clearIncoming();
        if (Platform.OS !== 'web') {
          try {
            callkeepService.endAllCalls();
          } catch {}
        }
      }
    };

    const unsubEnded = socketService.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    const unsubMissed = socketService.on(SOCKET_EVENTS.CALL_MISSED, handleCallEnded);
    const unsubDeclined = socketService.on(SOCKET_EVENTS.CALL_DECLINED, handleCallEnded);

    return () => {
      unsubIncoming();
      unsubEnded();
      unsubMissed();
      unsubDeclined();
    };
  }, [setIncoming, clearIncoming]);
}
