import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Mic, MicOff, PhoneOff, Volume2, ShieldCheck } from 'lucide-react-native';
import { Avatar, Button, COLORS, LoadingSpinner } from '@/components/ui';
import {
  useCallConfig,
  useInitiateCall,
  useEndCall,
  useJoinCallToken,
  useMarkCallAnswered,
  type CallSessionInit,
} from '@/hooks/use-api';
import { stringeeService, type StringeeCallEvents } from '@/services/stringee.service';
import { callkeepService } from '@/services/callkeep.service';
import { socketService } from '@/services/socket.service';
import { SOCKET_EVENTS, CALL_END_REASONS, normalizeCallEndReason } from '@homemate/constants';
import { useTranslation } from '@/hooks/use-i18n';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MÀN HÌNH CUỘC GỌI THOẠI TRONG APP (CHE SỐ THẬT) — Roadmap Phase 1, Feature 6
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Thiết kế đã triển khai:
 *    1. GET  /calls/config  → tính năng có bật không (chưa cấu hình Stringee
 *       trên server thì màn hình báo "chưa kích hoạt").
 *    2a. Gọi đi (mặc định): POST /calls/token { job_id } → server tạo
 *        CallSession, cấp JWT Stringee + room_id, bắn socket CALL_INCOMING
 *        cho đối tác. Sau đó stringeeService.ensureConnected(token) +
 *        makeOutgoingCall(partner_id).
 *    2b. Nhận cuộc gọi (mode='answer' + sessionId): POST
 *        /calls/sessions/:sessionId/join-token → token join cho callee,
 *        ensureConnected, chờ SDK báo incoming call (tối đa 20s) rồi
 *        answerPending(). Join-token là idempotent cho cùng một bên nên
 *        modal chuông (fetch trước khi bấm Nhận) + màn hình này (fetch
 *        sau khi bấm Nhận) + token refresher đều dùng chung 1 phiên.
 *    2c. Khi media/signaling thật sự connected: POST
 *        /calls/sessions/:sessionId/answered (chỉ lúc này mới tính là
 *        "đã trả lời" để phát hiện cuộc gọi nhỡ). Caller chờ trả lời tối
 *        đa 40s rồi kết thúc thành nhỡ.
 *    3. POST /calls/sessions/:id/end khi cúp máy / kết thúc từ xa.
 *
 *  Tầng media qua adapter duy nhất `services/stringee.service.ts` — file đó
 *  là nơi duy nhất require `stringee-react-native`; các component SDK được
 *  render bởi `components/common/stringee-host.tsx` (gắn ở app/_layout.tsx).
 *  Adapter là no-op an toàn khi SDK không có (web / Expo Go): màn hình giữ
 *  hành vi cũ (vào thẳng UI cuộc gọi ở mức session, media không hoạt động
 *  trong bản build đó).
 *
 *  Adapter + types/stringee-react-native.d.ts đã được viết lại theo API thật
 *  của stringee-react-native@1.5.8 (đối chiếu trực tiếp mã nguồn package:
 *  StringeeClient/StringeeCall là component React, sự kiện qua prop
 *  eventHandlers, mọi thao tác cuộc gọi theo callId).
 *
 *   Caveat còn lại: runtime thật cần dev build (expo prebuild / EAS,
 *    KHÔNG chạy Expo Go) + tài khoản Stringee thật với API Key SID/Secret
 *    cấu hình trên server, và 2 thiết bị để test cuộc gọi thật.
 * ════════════════════════════════════════════════════════════════════════════
 */

type CallUiState =
  'preparing' | 'connecting' | 'in_call' | 'ended' | 'rejected' | 'unavailable' | 'error';

// Caller chờ đối tác trả lời tối đa 40s rồi kết thúc thành cuộc gọi nhỡ
// (fix Bug 4). Ngắn hơn TTL token Stringee (1h) rất nhiều nên không liên
// quan tới refresh token.
const RING_TIMEOUT_MS = 40_000;

export default function CallScreen() {
  const { jobId, partnerName, sessionId, mode } = useLocalSearchParams<{
    jobId: string;
    partnerName?: string;
    sessionId?: string;
    mode?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();

  const isAnswerMode = mode === 'answer' && !!sessionId;

  const { data: config, isLoading: configLoading } = useCallConfig();
  const initiate = useInitiateCall();
  const joinToken = useJoinCallToken();
  const endCall = useEndCall();
  const markAnswered = useMarkCallAnswered();

  const [session, setSession] = useState<CallSessionInit | null>(null);
  const [uiState, setUiState] = useState<CallUiState>('preparing');
  const [endReason, setEndReason] = useState('');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  // fix Bug 2: retry tăng counter này để effect khởi động chạy lại thật sự
  // (deps cũ không đổi khi retry nên effect không bao giờ chạy lại).
  const [retryAttempt, setRetryAttempt] = useState(0);
  const startedRef = useRef(false);
  const sessionRef = useRef<CallSessionInit | null>(null);
  const endedRef = useRef(false);
  const connectedRef = useRef(false);
  // fix Bug 3: endCall chỉ gửi tối đa 1 lần cho 1 phiên trên màn hình này
  // (lỗi join + rời màn hình + cleanup unmount đều đi qua đây).
  const endSentRef = useRef(false);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubIncomingRef = useRef<(() => void) | null>(null);

  const setSessionBoth = (s: CallSessionInit | null) => {
    sessionRef.current = s;
    setSession(s);
    // Phiên mới = vòng đời end mới (retry của caller tạo session mới).
    if (s) endSentRef.current = false;
  };

  // Kết thúc phiên trên server tối đa 1 lần — để phía bên kia nhận
  // CALL_ENDED và thoát, thay vì kẹt ở "Đang kết nối…" (fix Bug 3).
  const endSessionOnce = (sessionId: string, reason: string) => {
    if (endSentRef.current) return;
    endSentRef.current = true;
    void endCall.mutateAsync({ sessionId, reason }).catch(() => undefined);
  };

  const clearCallTimers = () => {
    if (answerTimerRef.current) {
      clearTimeout(answerTimerRef.current);
      answerTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  };

  // fix Bug 2: retry chạy lại toàn bộ flow lấy token. Caller: kết thúc phiên
  // cũ rồi initiate phiên mới (tránh 2 phiên cùng reo). Callee: join lại
  // cùng session (join-token đã idempotent sau fix Bug 1).
  const handleRetry = () => {
    clearCallTimers();
    if (!isAnswerMode && sessionRef.current) {
      const old = sessionRef.current;
      setSessionBoth(null);
      void endCall
        .mutateAsync({ sessionId: old.session_id, reason: 'cancelled' })
        .catch(() => undefined);
    }
    endedRef.current = false;
    connectedRef.current = false;
    startedRef.current = false;
    setErrorMsg('');
    setUiState('connecting');
    setRetryAttempt(a => a + 1);
  };

  // fix Bug 3: rời màn hình lỗi thì kết thúc phiên để phía bên kia thoát.
  // Chỉ khi đang ở trạng thái lỗi (đã có phiên) — màn 'unavailable'
  // (tính năng chưa bật) thì chưa từng tạo/join phiên nào.
  const handleBackFromError = () => {
    if (uiState === 'error') {
      const s = sessionRef.current;
      if (s) {
        endSessionOnce(s.session_id, 'cancelled');
      } else if (isAnswerMode && sessionId) {
        endSessionOnce(sessionId, 'cancelled');
      }
    }
    router.back();
  };

  // Bắt đầu phiên gọi ngay khi mở màn hình (và tính năng đang bật)
  useEffect(() => {
    if (!jobId || configLoading || startedRef.current) return;
    if (config && !config.enabled) {
      setUiState('unavailable');
      return;
    }
    if (!config) return;
    startedRef.current = true;
    setUiState('connecting');

    const events: StringeeCallEvents = {
      onConnected: () => {
        connectedRef.current = true;
        // Đã nối máy thật: huỷ cả 2 timer chờ (trả lời / chờ chuông) — trước
        // đây timer 25s của callee không được huỷ nên có thể giết cuộc gọi
        // đang nói ở giây 25. Đồng thời đánh dấu answered trên server để
        // endCall phân biệt được cuộc gọi nhỡ (fix Bug 5).
        clearCallTimers();
        setUiState('in_call');
        const sid = sessionRef.current?.session_id;
        if (sid) {
          void markAnswered.mutateAsync(sid).catch(() => undefined);
        }
      },
      onBusyOrRejected: (reason?: string) => {
        if (endedRef.current) return;
        endedRef.current = true;
        setEndReason(
          reason ||
            (lang === 'en' ? 'The other party declined the call' : 'Người kia đã từ chối cuộc gọi'),
        );
        setUiState('rejected');
        const s = sessionRef.current;
        if (s) {
          callkeepService.reportSessionEnded(s.session_id);
          endSessionOnce(s.session_id, 'rejected');
        }
      },
      onEnded: () => {
        if (endedRef.current) return;
        endedRef.current = true;
        const s = sessionRef.current;
        if (s) {
          // Nếu cuộc gọi này đến qua CallKit (app bị đánh thức bởi VoIP
          // push) thì báo lại để hệ thống dọn giao diện cuộc gọi native.
          callkeepService.reportSessionEnded(s.session_id);
          endSessionOnce(s.session_id, 'ended');
        }
        setUiState('ended');
      },
      onError: (message: string) => {
        setErrorMsg(
          message ||
            (lang === 'en'
              ? 'Could not connect the call. Please try again.'
              : 'Không kết nối được cuộc gọi. Vui lòng thử lại.'),
        );
        setUiState('error');
      },
    };

    if (isAnswerMode && sessionId) {
      // Đăng ký token refresher cho callee
      stringeeService.setTokenRefresher(async () => {
        try {
          const fresh = await joinToken.mutateAsync(sessionId);
          return fresh.token;
        } catch {
          return null;
        }
      });

      joinToken
        .mutateAsync(sessionId)
        .then(s => {
          setSessionBoth(s);
          console.log(
            `[CallScreen] Callee fetched token for userId: ${s.my_user_id}, partner: ${s.partner_id}`,
          );
          const connected = stringeeService.ensureConnected(s.token, s.my_user_id);
          if (!connected) {
            setErrorMsg(
              lang === 'en'
                ? 'Could not connect to the call system. Please check microphone permissions and network connection.'
                : 'Không thể kết nối đến hệ thống cuộc gọi. Vui lòng kiểm tra quyền micro và kết nối mạng.',
            );
            setUiState('error');
            return;
          }

          // Gọi answerPending: cơ chế flushAnswer tự động đệm chờ client kết nối
          // và chờ SDK event onIncomingCall, sau đó tự động gọi initAnswer + answer.
          stringeeService.answerPending(events);

          answerTimerRef.current = setTimeout(() => {
            if (endedRef.current) return;
            const diag = stringeeService.getDiagnostics();
            console.warn('[CallScreen] Answer timeout diagnostics:', diag);
            const userMsg =
              lang === 'en'
                ? 'Call ended or no signal received from the connection'
                : 'Cuộc gọi đã kết thúc hoặc không nhận được tín hiệu kết nối';
            setErrorMsg(userMsg);
            setUiState('error');
            endSentRef.current = true;
            void endCall.mutateAsync({ sessionId, reason: 'missed' }).catch(() => undefined);
          }, 25_000);
        })
        .catch((err: any) => {
          const serverMsg =
            err?.response?.data?.message ||
            err?.message ||
            (lang === 'en' ? 'Could not start call' : 'Không bắt đầu được cuộc gọi');
          const diag = `${lang === 'en' ? 'Call token fetch error' : 'Lỗi lấy token cuộc gọi'} (${serverMsg})`;
          console.warn('[CallScreen] joinToken error:', diag);
          // fix Bug 3: lấy token thất bại thì kết thúc phiên để caller nhận
          // CALL_ENDED và thoát, thay vì kẹt ở "Đang kết nối…".
          endSessionOnce(sessionId, 'cancelled');
          setErrorMsg(diag);
          setUiState('error');
        });
      return;
    }

    // Đăng ký token refresher cho caller (fix Bug 6): refresh phải cấp
    // token cho PHIÊN HIỆN TẠI qua join-token (idempotent), không được
    // initiate phiên mới — initiate tạo CallSession mới + bắn CALL_INCOMING
    // lần nữa, callee sẽ nhận thêm 1 modal trong lúc đang nói.
    stringeeService.setTokenRefresher(async () => {
      try {
        const sid = sessionRef.current?.session_id;
        if (!sid) return null;
        const fresh = await joinToken.mutateAsync(sid);
        return fresh.token;
      } catch {
        return null;
      }
    });

    initiate
      .mutateAsync(jobId)
      .then(s => {
        setSessionBoth(s);
        console.log(
          `[CallScreen] Caller fetched token for userId: ${s.my_user_id}, partner: ${s.partner_id}`,
        );
        const connected = stringeeService.ensureConnected(s.token, s.my_user_id);
        if (!connected) {
          setErrorMsg(
            lang === 'en'
              ? 'Could not connect to the call system. Please check microphone permissions and network connection.'
              : 'Không thể kết nối đến hệ thống cuộc gọi. Vui lòng kiểm tra quyền micro và kết nối mạng.',
          );
          setUiState('error');
          return;
        }
        const started = stringeeService.makeOutgoingCall({
          myUserId: s.my_user_id,
          partnerId: s.partner_id,
          events,
        });
        if (!started) {
          setErrorMsg(
            lang === 'en'
              ? 'Could not initiate outgoing call. Please try again.'
              : 'Không thể khởi tạo cuộc gọi đi. Vui lòng thử lại.',
          );
          setUiState('error');
          return;
        }
        // fix Bug 4: caller chờ trả lời tối đa RING_TIMEOUT_MS — trước đây
        // không có timer nào phía caller nên đối tác không nghe máy thì
        // màn hình kẹt ở "Đang kết nối…" mãi. Hết giờ: kết thúc thành
        // cuộc gọi nhỡ (server gửi notification nhỡ cho callee) + hiện
        // "không trả lời". onConnected huỷ timer này.
        ringTimerRef.current = setTimeout(() => {
          if (endedRef.current || connectedRef.current) return;
          endSessionOnce(s.session_id, 'missed');
          setErrorMsg(t('call_no_answer'));
          setUiState('error');
        }, RING_TIMEOUT_MS);
      })
      .catch((err: any) => {
        const serverMsg =
          err?.response?.data?.message ||
          err?.message ||
          (lang === 'en' ? 'Could not start call' : 'Không bắt đầu được cuộc gọi');
        const diag = `${lang === 'en' ? 'Call initiation error' : 'Lỗi khởi tạo cuộc gọi'} (${serverMsg})`;
        console.warn('[CallScreen] initiate error:', diag);
        setErrorMsg(diag);
        setUiState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, config, configLoading, retryAttempt]);

  // Lắng nghe socket CALL_ENDED từ đối phương (hỗ trợ cả Web lẫn Native)
  useEffect(() => {
    const unsub = socketService.on(SOCKET_EVENTS.CALL_ENDED, (payload: any) => {
      const s = sessionRef.current;
      if (!s || (payload?.sessionId && payload.sessionId !== s.session_id)) return;
      if (endedRef.current) return;
      endedRef.current = true;
      // B112: lý do kết thúc dùng chung một enum — hiển thị cùng một lý do ở cả hai bên
      const reason = normalizeCallEndReason(payload?.reason);
      const reasonText: Record<string, string> =
        lang === 'en'
          ? {
              [CALL_END_REASONS.DECLINED]: 'The other party declined the call',
              [CALL_END_REASONS.CANCELLED]: 'The other party cancelled the call',
              [CALL_END_REASONS.MISSED]: 'Missed call',
              [CALL_END_REASONS.ENDED]: 'Call ended',
            }
          : {
              [CALL_END_REASONS.DECLINED]: 'Người kia đã từ chối cuộc gọi',
              [CALL_END_REASONS.CANCELLED]: 'Người kia đã hủy cuộc gọi',
              [CALL_END_REASONS.MISSED]: 'Cuộc gọi nhỡ',
              [CALL_END_REASONS.ENDED]: 'Cuộc gọi đã kết thúc',
            };
      setEndReason(reasonText[reason] ?? reasonText[CALL_END_REASONS.ENDED]);
      setUiState(reason === CALL_END_REASONS.DECLINED ? 'rejected' : 'ended');
    });
    return () => unsub();
  }, []);

  // Cleanup: clear timers / listener, hang up SDK call on unmount.
  // fix Bug 3: rời màn hình khi phiên còn sống thì kết thúc phiên trên
  // server để phía bên kia nhận CALL_ENDED (rời màn hình lỗi, vuốt back
  // giữa chừng…). Đã kết thúc rồi (endedRef / endSessionOnce) thì không
  // gửi lần nữa.
  useEffect(() => {
    return () => {
      clearCallTimers();
      unsubIncomingRef.current?.();
      stringeeService.setTokenRefresher(null);
      stringeeService.hangupCurrent();
      const s = sessionRef.current;
      if (s && !endedRef.current) {
        endSessionOnce(s.session_id, connectedRef.current ? 'ended' : 'cancelled');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng hồ đếm thời lượng (chạy khi đang trong cuộc gọi)
  useEffect(() => {
    if (uiState !== 'in_call') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [uiState]);

  // Tự động thoát màn hình sau khi cuộc gọi kết thúc hoặc bị từ chối
  useEffect(() => {
    if (uiState === 'ended' || uiState === 'rejected') {
      const t = setTimeout(() => {
        router.back();
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [uiState, router]);

  const handleEnd = async () => {
    stringeeService.hangupCurrent();
    stringeeService.rejectPending();
    endSentRef.current = true;
    if (session) {
      await endCall
        .mutateAsync({ sessionId: session.session_id, reason: 'ended' })
        .catch(() => undefined);
    } else if (isAnswerMode && sessionId) {
      await endCall.mutateAsync({ sessionId, reason: 'ended' }).catch(() => undefined);
    }
    endedRef.current = true;
    setUiState('ended');
    router.back();
  };

  const handleToggleMute = () => {
    setMuted(m => {
      const next = !m;
      stringeeService.setMute(next);
      return next;
    });
  };

  const handleToggleSpeaker = () => {
    setSpeaker(s => {
      const next = !s;
      stringeeService.setSpeakerphoneOn(next);
      return next;
    });
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const displayName = partnerName ?? (lang === 'en' ? 'Job Partner' : 'Đối tác của đơn');

  if (configLoading || uiState === 'preparing') return <LoadingSpinner />;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0B3D24',
        paddingTop: Math.max(insets.top + 16, 32),
        paddingBottom: Math.max(insets.bottom + 16, 28),
        paddingHorizontal: 24,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(255,255,255,0.12)',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
        }}
      >
        <ShieldCheck size={14} color="#A7F3C7" />
        <Text style={{ color: '#D1FAE5', fontSize: fs(12), fontWeight: '700' }}>
          {lang === 'en'
            ? 'GreenHouse call — your real phone number is masked'
            : 'Cuộc gọi qua GreenHouse — số thật của bạn được ẩn'}
        </Text>
      </View>

      <View style={{ alignItems: 'center', marginTop: 56, gap: 14 }}>
        <Avatar name={displayName} size={110} />
        <Text style={{ color: '#fff', fontSize: fs(24), fontWeight: '800', textAlign: 'center' }}>
          {displayName}
        </Text>
        <Text style={{ color: '#A7F3C7', fontSize: fs(15), fontWeight: '600' }}>
          {uiState === 'connecting' && (lang === 'en' ? 'Connecting…' : 'Đang kết nối…')}
          {uiState === 'in_call' && mmss}
          {uiState === 'unavailable' &&
            (lang === 'en' ? 'Feature unavailable' : 'Tính năng chưa kích hoạt')}
          {uiState === 'error' && (lang === 'en' ? 'Could not connect' : 'Không kết nối được')}
          {uiState === 'rejected' &&
            (lang === 'en' ? 'The other party declined the call' : 'Người kia đã từ chối cuộc gọi')}
          {uiState === 'ended' && (lang === 'en' ? 'Call ended' : 'Cuộc gọi đã kết thúc')}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      {(uiState === 'ended' || uiState === 'rejected') && (
        <View style={{ width: '100%', gap: 14, alignItems: 'center', paddingHorizontal: 16 }}>
          <View
            style={{
              backgroundColor:
                uiState === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.1)',
              borderColor:
                uiState === 'rejected' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1,
              borderRadius: 14,
              padding: 16,
              width: '100%',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: uiState === 'rejected' ? '#FCA5A5' : '#D1FAE5',
                fontSize: fs(15),
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {uiState === 'rejected'
                ? endReason || t('call_state_rejected')
                : seconds > 0
                  ? `${t('call_state_ended')} (${mmss})`
                  : t('call_state_ended')}
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: fs(12.5),
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {uiState === 'rejected' ? t('call_rejected_hint') : t('call_thank_you')}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={{
              backgroundColor: '#16A34A',
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 14,
              marginTop: 6,
              minWidth: 180,
              alignItems: 'center',
              shadowColor: '#16A34A',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(15) }}>
              {t('common_back')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(uiState === 'unavailable' || uiState === 'error') && (
        <View style={{ width: '100%', gap: 14, alignItems: 'center', paddingHorizontal: 16 }}>
          <View
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              borderWidth: 1,
              borderRadius: 14,
              padding: 14,
              width: '100%',
            }}
          >
            <Text
              style={{
                color: '#FCA5A5',
                fontSize: fs(13),
                fontWeight: '600',
                textAlign: 'center',
                lineHeight: Math.round(fs(19)),
              }}
            >
              {uiState === 'unavailable'
                ? (config?.message ??
                  (lang === 'en'
                    ? 'Voice call feature is not yet enabled on the system. Both parties please communicate via the in-app job chat.'
                    : 'Tính năng gọi thoại chưa được kích hoạt trên hệ thống. Hai bên vui lòng trao đổi qua khung chat của đơn.'))
                : errorMsg ||
                  (lang === 'en'
                    ? 'Could not connect the call. Please try again.'
                    : 'Không kết nối được cuộc gọi. Vui lòng thử lại.')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            {uiState === 'error' && (
              <TouchableOpacity
                onPress={handleRetry}
                style={{
                  backgroundColor: '#16A34A',
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13.5) }}>
                  {t('call_retry')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleBackFromError}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: fs(13.5) }}>
                {t('common_back')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(uiState === 'connecting' || uiState === 'in_call') && (
        <View style={{ alignItems: 'center', gap: 28 }}>
          <View style={{ flexDirection: 'row', gap: 22 }}>
            <TouchableOpacity
              onPress={handleToggleMute}
              style={{
                width: 62,
                height: 62,
                borderRadius: 999,
                backgroundColor: muted ? '#fff' : 'rgba(255,255,255,0.16)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {muted ? (
                <MicOff size={24} color={COLORS.gray[800]} />
              ) : (
                <Mic size={24} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleSpeaker}
              style={{
                width: 62,
                height: 62,
                borderRadius: 999,
                backgroundColor: speaker ? '#fff' : 'rgba(255,255,255,0.16)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Volume2 size={24} color={speaker ? COLORS.gray[800] : '#fff'} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleEnd}
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              backgroundColor: '#EF4444',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PhoneOff size={30} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fs(12.5) }}>
            {muted ? t('call_muted_notice') : t('call_end_hint')}
          </Text>
        </View>
      )}
    </View>
  );
}
