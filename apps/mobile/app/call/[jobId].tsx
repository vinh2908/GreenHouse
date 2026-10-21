import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Mic, MicOff, PhoneOff, Volume2, ShieldCheck } from 'lucide-react-native';
import { Avatar, Button, COLORS, LoadingSpinner } from '@/components/ui';
import { useCallConfig, useInitiateCall, useEndCall, type CallSessionInit } from '@/hooks/use-api';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MÀN HÌNH CUỘC GỌI THOẠI TRONG APP (CHE SỐ THẬT) — Roadmap Phase 1, Feature 6
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Luồng đã hoàn thiện:
 *    1. GET  /calls/config  → tính năng có bật không (chưa cấu hình Stringee
 *       trên server thì màn hình này báo "chưa kích hoạt" và các nút gọi ở
 *       job-detail/chat bị ẩn).
 *    2. POST /calls/token { job_id } → server kiểm tra người gọi thuộc job,
 *       tạo CallSession, cấp JWT access token của Stringee + room_id theo job,
 *       đồng thời bắn socket CALL_INCOMING cho đối tác.
 *    3. POST /calls/sessions/:id/end khi cúp máy.
 *
 *  ── ĐIỂM NỐI SDK (TODO khi có tài khoản Stringee + bản build native) ──────
 *  Phần truyền âm thanh thời gian thực cần Stringee React Native SDK
 *  (package `stringee-react-native` — native module, KHÔNG chạy được trên
 *  Expo Go, cần `expo prebuild`/dev-client hoặc EAS Build):
 *
 *    import { StringeeClient, StringeeCall } from 'stringee-react-native';
 *    // 1) client.connect(accessToken)          — token lấy từ bước 2 ở trên
 *    // 2) const call = new StringeeCall(client, my_user_id, partner_id);
 *    //    call.makeCall(...) / lắng nghe sự kiện 'incoming_call' để nhận cuộc gọi
 *    // 3) Map sự kiện của SDK (didChangeState → connected/ended) vào
 *    //    `callState` bên dưới; nút Mic/Loa gọi call.mute() / setSpeakerphoneOn()
 *
 *  Hiện tại (chưa gắn SDK): màn hình hiển thị đầy đủ UI cuộc gọi + trạng thái
 *  kết nối ở mức phiên (session) — token/phòng gọi là THẬT từ server, chỉ còn
 *  thiếu tầng media của SDK. Xem thêm README ở ~/workspace/greenhouse-phase1.
 * ════════════════════════════════════════════════════════════════════════════
 */

type CallUiState = 'preparing' | 'connecting' | 'in_call' | 'ended' | 'unavailable' | 'error';

export default function CallScreen() {
  const { jobId, partnerName } = useLocalSearchParams<{ jobId: string; partnerName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: config, isLoading: configLoading } = useCallConfig();
  const initiate = useInitiateCall();
  const endCall = useEndCall();

  const [session, setSession] = useState<CallSessionInit | null>(null);
  const [uiState, setUiState] = useState<CallUiState>('preparing');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const startedRef = useRef(false);

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
    initiate
      .mutateAsync(jobId)
      .then(s => {
        setSession(s);
        // TODO(SDK): tại đây connect StringeeClient bằng s.token rồi makeCall
        // tới s.partner_id trong phòng s.room_id; khi SDK báo connected thì
        // setUiState('in_call'). Tạm thời chuyển thẳng sang UI cuộc gọi.
        setUiState('in_call');
      })
      .catch((err: any) => {
        setErrorMsg(
          err?.response?.data?.message ?? 'Không bắt đầu được cuộc gọi. Vui lòng thử lại.',
        );
        setUiState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, config, configLoading]);

  // Đồng hồ đếm thời lượng (chạy khi đang trong cuộc gọi)
  useEffect(() => {
    if (uiState !== 'in_call') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [uiState]);

  const handleEnd = async () => {
    if (session) {
      await endCall.mutateAsync({ sessionId: session.session_id, reason: 'ended' }).catch(() => undefined);
    }
    setUiState('ended');
    router.back();
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
      {/* Trạng thái bảo mật */}
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

      {/* Đối tác */}
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
        <View style={{ width: '100%', gap: 12, alignItems: 'center' }}>
          <Text
            style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, textAlign: 'center', lineHeight: 20 }}
          >
            {uiState === 'unavailable'
              ? (config?.message ??
                'Tính năng gọi thoại chưa được kích hoạt trên hệ thống. Hai bên vui lòng trao đổi qua khung chat của đơn.')
              : errorMsg}
          </Text>
          <Button title="Quay lại" onPress={() => router.back()} />
        </View>
      )}

      {(uiState === 'connecting' || uiState === 'in_call') && (
        <View style={{ alignItems: 'center', gap: 28 }}>
          <View style={{ flexDirection: 'row', gap: 22 }}>
            {/* Mic — TODO(SDK): gọi StringeeCall.mute(!muted) */}
            <TouchableOpacity
              onPress={() => setMuted(m => !m)}
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
            {/* Loa ngoài — TODO(SDK): gọi StringeeClient.setSpeakerphoneOn(speaker) */}
            <TouchableOpacity
              onPress={() => setSpeaker(s => !s)}
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
