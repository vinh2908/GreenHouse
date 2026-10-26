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
  type CallSessionInit,
} from '@/hooks/use-api';
import { stringeeService, type StringeeCallEvents } from '@/services/stringee.service';
import { callkeepService } from '@/services/callkeep.service';

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
 *        answerPending().
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
 *  ⚠️ Caveat còn lại: runtime thật cần dev build (expo prebuild / EAS,
 *    KHÔNG chạy Expo Go) + tài khoản Stringee thật với API Key SID/Secret
 *    cấu hình trên server, và 2 thiết bị để test cuộc gọi thật.
 * ════════════════════════════════════════════════════════════════════════════
 */

type CallUiState = 'preparing' | 'connecting' | 'in_call' | 'ended' | 'unavailable' | 'error';

export default function CallScreen() {
  const { jobId, partnerName, sessionId, mode } = useLocalSearchParams<{
    jobId: string;
    partnerName?: string;
    sessionId?: string;
    mode?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isAnswerMode = mode === 'answer' && !!sessionId;

  const { data: config, isLoading: configLoading } = useCallConfig();
  const initiate = useInitiateCall();
  const joinToken = useJoinCallToken();
  const endCall = useEndCall();

  const [session, setSession] = useState<CallSessionInit | null>(null);
  const [uiState, setUiState] = useState<CallUiState>('preparing');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const startedRef = useRef(false);
  const sessionRef = useRef<CallSessionInit | null>(null);
  const endedRef = useRef(false);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubIncomingRef = useRef<(() => void) | null>(null);

  const setSessionBoth = (s: CallSessionInit | null) => {
    sessionRef.current = s;
    setSession(s);
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
      onConnected: () => setUiState('in_call'),
      onEnded: () => {
        if (endedRef.current) return;
        endedRef.current = true;
        const s = sessionRef.current;
        if (s) {
          // Nếu cuộc gọi này đến qua CallKit (app bị đánh thức bởi VoIP
          // push) thì báo lại để hệ thống dọn giao diện cuộc gọi native.
          callkeepService.reportSessionEnded(s.session_id);
          void endCall
            .mutateAsync({ sessionId: s.session_id, reason: 'ended' })
            .catch(() => undefined);
        }
        setUiState('ended');
      },
      onError: (message: string) => {
        setErrorMsg(message || 'Không kết nối được cuộc gọi. Vui lòng thử lại.');
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
            // Media inactive in this build (web / Expo Go / SDK not installed):
            // keep the previous session-only UI behaviour.
            setUiState('in_call');
            return;
          }

          // Gọi answerPending: cơ chế flushAnswer tự động đệm chờ client kết nối
          // và chờ SDK event onIncomingCall, sau đó tự động gọi initAnswer + answer.
          stringeeService.answerPending(events);

          answerTimerRef.current = setTimeout(() => {
            if (endedRef.current) return;
            const diag = stringeeService.getDiagnostics();
            const diagMsg =
              `Cuộc gọi đã kết thúc hoặc không nhận được tín hiệu từ SDK ` +
              `[Chẩn đoán: clientReady=${diag.clientReady}, callRef=${diag.hasCallRef}, incoming=${diag.pendingIncoming || 'null'}]`;
            console.warn('[CallScreen] Answer timeout:', diagMsg);
            setErrorMsg(diagMsg);
            setUiState('error');
            void endCall.mutateAsync({ sessionId, reason: 'missed' }).catch(() => undefined);
          }, 25_000);
        })
        .catch((err: any) => {
          const serverMsg =
            err?.response?.data?.message || err?.message || 'Không bắt đầu được cuộc gọi';
          const diag = `Lỗi lấy token cuộc gọi (${serverMsg})`;
          console.warn('[CallScreen] joinToken error:', diag);
          setErrorMsg(diag);
          setUiState('error');
        });
      return;
    }

    // Đăng ký token refresher cho caller
    stringeeService.setTokenRefresher(async () => {
      try {
        const fresh = await initiate.mutateAsync(jobId);
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
          // Media inactive in this build (web / Expo Go / SDK not installed):
          // keep today's behaviour — go straight to the in-call session UI.
          setUiState('in_call');
          return;
        }
        const started = stringeeService.makeOutgoingCall({
          myUserId: s.my_user_id,
          partnerId: s.partner_id,
          events,
        });
        if (!started) {
          console.warn('[CallScreen] makeOutgoingCall returned false');
        }
      })
      .catch((err: any) => {
        const serverMsg =
          err?.response?.data?.message || err?.message || 'Không bắt đầu được cuộc gọi';
        const diag = `Lỗi khởi tạo cuộc gọi (${serverMsg})`;
        console.warn('[CallScreen] initiate error:', diag);
        setErrorMsg(diag);
        setUiState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, config, configLoading]);

  // Cleanup: clear answer timer / listener, hang up SDK call on unmount.
  useEffect(() => {
    return () => {
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
      unsubIncomingRef.current?.();
      stringeeService.setTokenRefresher(null);
      stringeeService.hangupCurrent();
    };
  }, []);

  // Đồng hồ đếm thời lượng (chạy khi đang trong cuộc gọi)
  useEffect(() => {
    if (uiState !== 'in_call') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [uiState]);

  const handleEnd = async () => {
    stringeeService.hangupCurrent();
    stringeeService.rejectPending();
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
  const displayName = partnerName ?? 'Đối tác của đơn';

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
        <Text style={{ color: '#D1FAE5', fontSize: 12, fontWeight: '700' }}>
          Cuộc gọi qua GreenHouse — số thật của bạn được ẩn
        </Text>
      </View>

      <View style={{ alignItems: 'center', marginTop: 56, gap: 14 }}>
        <Avatar name={displayName} size={110} />
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' }}>
          {displayName}
        </Text>
        <Text style={{ color: '#A7F3C7', fontSize: 15, fontWeight: '600' }}>
          {uiState === 'connecting' && 'Đang kết nối…'}
          {uiState === 'in_call' && mmss}
          {uiState === 'unavailable' && 'Tính năng chưa kích hoạt'}
          {uiState === 'error' && 'Không kết nối được'}
          {uiState === 'ended' && 'Cuộc gọi đã kết thúc'}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      {(uiState === 'unavailable' || uiState === 'error') && (
        <View style={{ width: '100%', gap: 14, alignItems: 'center', paddingHorizontal: 16 }}>
          <View
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              borderWidth: 1,
              borderRadius: 12,
              padding: 14,
              width: '100%',
            }}
          >
            <Text
              style={{
                color: '#FCA5A5',
                fontSize: 13,
                fontWeight: '600',
                textAlign: 'center',
                lineHeight: 19,
              }}
            >
              {uiState === 'unavailable'
                ? (config?.message ??
                  'Tính năng gọi thoại chưa được kích hoạt trên hệ thống. Hai bên vui lòng trao đổi qua khung chat của đơn.')
                : (errorMsg || 'Không kết nối được cuộc gọi. Vui lòng thử lại.')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            {isAnswerMode && (
              <TouchableOpacity
                onPress={() => {
                  setErrorMsg('');
                  setUiState('connecting');
                  startedRef.current = false;
                }}
                style={{
                  backgroundColor: '#16A34A',
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>
                  Thử kết nối lại
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13.5 }}>Quay lại</Text>
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
                borderRadius: 31,
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
                borderRadius: 31,
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
              borderRadius: 36,
              backgroundColor: '#EF4444',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PhoneOff size={30} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5 }}>
            {muted ? 'Bạn đang tắt mic' : 'Chạm nút đỏ để kết thúc cuộc gọi'}
          </Text>
        </View>
      )}
    </View>
  );
}
