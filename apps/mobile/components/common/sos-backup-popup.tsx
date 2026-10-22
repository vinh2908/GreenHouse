// components/common/sos-backup-popup.tsx — Popup "có người cần backup" cho thợ ứng viên
// Hiện trên mọi màn hình khi server phát sóng SOS Backup (khách đã đồng ý đổi
// người). Ai bấm "Nhận thay" trước (và thắng claim nguyên tử ở server) sẽ nhận
// đơn; nếu chậm tay server trả 409 → toast "Đã có người khác nhận".
import { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useSosBackupStore } from '@/stores/sos-backup.store';
import { PhotoThumbRow } from '@/components/common/photo-thumbs';
import { useAcceptSosBackup, useDeclineSosBackup } from '@/hooks/use-api';
import { useNowTick, formatCountdown } from '@/hooks/use-countdown';
import { COLORS } from '@/components/ui';

export function SosBackupPopup() {
  const incoming = useSosBackupStore(s => s.incoming);
  const clearIncoming = useSosBackupStore(s => s.clearIncoming);
  const router = useRouter();
  const accept = useAcceptSosBackup();
  const decline = useDeclineSosBackup();
  const now = useNowTick(!!incoming);

  // Hết hạn đếm ngược phía client → tự đóng (server cũng sẽ gửi resolved/expired)
  useEffect(() => {
    if (incoming?.expires_at_ms && incoming.expires_at_ms <= Date.now()) {
      clearIncoming();
    }
  }, [incoming?.expires_at_ms, now, clearIncoming]);

  if (!incoming) return null;

  const remainingMs = incoming.expires_at_ms ? incoming.expires_at_ms - now : 0;
  const area = [incoming.district, incoming.city].filter(Boolean).join(', ');

  const handleAccept = async () => {
    try {
      await accept.mutateAsync(incoming.sos_id);
      const jobId = incoming.job_id;
      clearIncoming();
      Toast.show({
        type: 'success',
        text1: 'Bạn đã nhận thay đơn này!',
        text2: 'Hãy di chuyển đến khách hàng như đơn thường',
      });
      router.push({ pathname: '/helper-job-detail/[id]', params: { id: jobId } });
    } catch (err: any) {
      const status = err?.response?.status;
      clearIncoming();
      if (status === 409) {
        Toast.show({ type: 'info', text1: 'Đã có người khác nhận đơn này rồi' });
      } else {
        const msg = err?.response?.data?.message;
        Toast.show({
          type: 'error',
          text1: typeof msg === 'string' ? msg : 'Không nhận được đơn — thử lại sau',
        });
      }
    }
  };

  const handleDismiss = () => {
    decline.mutate(incoming.sos_id);
    clearIncoming();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleDismiss}>
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
            backgroundColor: '#fff',
            borderRadius: 24,
            padding: 22,
            width: '100%',
            maxWidth: 420,
            borderWidth: 2,
            borderColor: '#FECACA',
          }}
        >
          <Text style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>🆘</Text>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#991B1B',
              textAlign: 'center',
              marginBottom: 6,
            }}
          >
            Có người cần backup!
          </Text>
          <Text
            style={{ fontSize: 14, color: COLORS.gray[700], textAlign: 'center', lineHeight: 20 }}
          >
            Một thợ khác gặp sự cố và khách hàng đã đồng ý đổi người. Bạn có thể nhận thay đơn này
            không?
          </Text>

          <View
            style={{
              backgroundColor: '#FEF2F2',
              borderRadius: 14,
              padding: 14,
              marginTop: 16,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              {incoming.service_name ?? 'Dịch vụ tại nhà'}
              {incoming.job_title ? ` — ${incoming.job_title}` : ''}
            </Text>
            {area ? (
              <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>📍 Khu vực: {area}</Text>
            ) : null}
            {incoming.distance_km != null ? (
              <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>
                📏 Cách bạn khoảng {incoming.distance_km} km
              </Text>
            ) : null}
            {incoming.payout != null ? (
              <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>
                💰 Thực nhận:{' '}
                <Text style={{ fontWeight: '800', color: COLORS.success }}>
                  {incoming.payout.toLocaleString('vi-VN')}₫
                </Text>
              </Text>
            ) : null}
            {incoming.photo_urls?.length ? (
              <PhotoThumbRow
                urls={incoming.photo_urls}
                size={56}
                label="📷 Ảnh hiện trạng từ thợ gặp sự cố"
              />
            ) : null}
          </View>

          {incoming.expires_at_ms ? (
            <Text
              style={{
                textAlign: 'center',
                marginTop: 14,
                fontSize: 13,
                fontWeight: '700',
                color: remainingMs <= 60_000 ? '#DC2626' : COLORS.gray[500],
              }}
            >
              ⏱ Còn {formatCountdown(remainingMs)} để nhận đơn
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleAccept}
            disabled={accept.isPending}
            style={{
              backgroundColor: COLORS.success,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 14,
              opacity: accept.isPending ? 0.7 : 1,
            }}
          >
            {accept.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15.5 }}>
                ✓ Nhận thay ngay
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDismiss}
            disabled={accept.isPending}
            style={{ paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: COLORS.gray[500], fontWeight: '700', fontSize: 14 }}>Bỏ qua</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
