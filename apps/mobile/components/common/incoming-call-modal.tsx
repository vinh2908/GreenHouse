// components/common/incoming-call-modal.tsx — Modal nhận/từ chối cuộc gọi đến (Phase 1, F6)
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Phone, PhoneOff } from 'lucide-react-native';
import { useCallStore } from '@/stores/call.store';
import { useEndCall } from '@/hooks/use-api';

export function IncomingCallModal() {
  const incoming = useCallStore(s => s.incoming);
  const clearIncoming = useCallStore(s => s.clearIncoming);
  const router = useRouter();
  const pathname = usePathname();
  const endCall = useEndCall();

  if (!incoming) return null;

  // Đã ở màn hình cuộc gọi cho đúng session này thì không hiện modal nữa.
  const onCallScreen =
    pathname?.startsWith('/call/') && pathname.includes(incoming.job_id);
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
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📞</Text>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#fff',
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            Cuộc gọi đến qua GreenHouse
          </Text>
          <Text style={{ fontSize: 14, color: '#A7F3C7', textAlign: 'center', marginBottom: 24 }}>
            {shortJob ? `Đơn ${shortJob} — đối tác đang gọi cho bạn` : 'Đối tác đang gọi cho bạn'}
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
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, width: 64, textAlign: 'center' }}>
              Từ chối
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, width: 64, textAlign: 'center' }}>
              Trả lời
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
