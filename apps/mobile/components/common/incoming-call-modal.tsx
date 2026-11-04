// components/common/incoming-call-modal.tsx — Modal nhận/từ chối cuộc gọi đến (Phase 1, F6)
import { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Phone, PhoneOff } from 'lucide-react-native';
import { useCallStore } from '@/stores/call.store';
import { useEndCall } from '@/hooks/use-api';
import apiClient from '@/services/api-client';
import { stringeeService } from '@/services/stringee.service';
import { useTranslation } from '@/hooks/use-i18n';

export function IncomingCallModal() {
  const incoming = useCallStore(s => s.incoming);
  const clearIncoming = useCallStore(s => s.clearIncoming);
  const router = useRouter();
  const pathname = usePathname();
  const endCall = useEndCall();
  const { t, fs } = useTranslation();

  // Chủ động kết nối Stringee client ngay khi modal chuông hiện lên
  useEffect(() => {
    if (!incoming?.session_id) return;
    let cancelled = false;
    apiClient
      .post<{ token: string; my_user_id: string }>(
        `/calls/sessions/${incoming.session_id}/join-token`,
      )
      .then(res => {
        if (cancelled || !res.data?.token) return;
        stringeeService.ensureConnected(res.data.token, res.data.my_user_id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [incoming?.session_id]);

  if (!incoming) return null;

  // Đã ở màn hình cuộc gọi cho đúng session này thì không hiện modal nữa.
  const onCallScreen = pathname?.startsWith('/call/') && pathname.includes(incoming.job_id);
  if (onCallScreen) return null;

  const shortJob = incoming.job_id ? `#${incoming.job_id.slice(-6)}` : '';

  const handleAccept = () => {
    const { job_id, session_id } = incoming;
    clearIncoming();
    router.push({
      pathname: '/call/[jobId]',
      params: { jobId: job_id, sessionId: session_id, mode: 'answer' },
    });
  };

  const handleDecline = () => {
    const { session_id } = incoming;
    stringeeService.rejectPending();
    endCall.mutate({ sessionId: session_id, reason: 'declined' });
    clearIncoming();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleDecline}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
        }}
      >
        <View
          style={{
            backgroundColor: '#0B3D24',
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 420,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: fs(40), marginBottom: 12 }}>📞</Text>
          <Text
            style={{
              fontSize: fs(18),
              fontWeight: '800',
              color: '#fff',
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {t('call_incoming_title')}
          </Text>
          <Text style={{ fontSize: fs(14), color: '#A7F3C7', textAlign: 'center', marginBottom: 24 }}>
            {shortJob ? t('call_incoming_sub_job', { job: shortJob }) : t('call_incoming_sub')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity
              onPress={handleDecline}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#EF4444',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PhoneOff size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#22C55E',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Phone size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            <Text
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: fs(12),
                width: 64,
                textAlign: 'center',
              }}
            >
              {t('call_decline')}
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: fs(12),
                width: 64,
                textAlign: 'center',
              }}
            >
              {t('call_answer')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
