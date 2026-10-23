// components/common/sos-customer-decision-popup.tsx — Popup quyết định cho KHÁCH
// khi thợ gửi SOS Backup. Cổng đồng ý: chỉ khi khách chọn "Chấp nhận đổi người"
// server mới chạy ghép Hungarian + phát sóng tìm thợ thay. Chọn "Hủy đơn" →
// hủy theo chính sách SOS, hoàn tiền 100%, thợ không bị phạt. Quá hạn không
// quyết định → server xử lý theo mặc định cấu hình (mặc định: hủy + hoàn tiền).
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { SOS_BACKUP_REASON_LABELS, useSosBackupStore } from '@/stores/sos-backup.store';
import { PhotoThumbRow } from '@/components/common/photo-thumbs';
import { useCustomerSosDecision } from '@/hooks/use-api';
import { useNowTick, formatCountdown } from '@/hooks/use-countdown';
import { COLORS } from '@/components/ui';

export function SosCustomerDecisionPopup() {
  const decision = useSosBackupStore(s => s.decision);
  const clearDecision = useSosBackupStore(s => s.clearDecision);
  const decide = useCustomerSosDecision();
  const now = useNowTick(!!decision);

  if (!decision) return null;

  const remainingMs = decision.decision_expires_at_ms ? decision.decision_expires_at_ms - now : 0;
  const expired = decision.decision_expires_at_ms ? remainingMs <= 0 : false;
  const reasonLabel = SOS_BACKUP_REASON_LABELS[decision.reason ?? 'other'] ?? 'Sự cố khẩn cấp';

  const handle = async (choice: 'accept_replacement' | 'cancel_job') => {
    try {
      await decide.mutateAsync({
        sosId: decision.sos_id,
        jobId: decision.job_id,
        decision: choice,
      });
      clearDecision();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Đã được xử lý (bấm trùng / đã quá hạn và hệ thống tự xử lý)
        clearDecision();
        Toast.show({ type: 'info', text1: 'Yêu cầu này đã được xử lý' });
      } else {
        const msg = err?.response?.data?.message;
        Toast.show({
          type: 'error',
          text1: typeof msg === 'string' ? msg : 'Không gửi được quyết định — thử lại',
        });
      }
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => undefined}>
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
            borderColor: '#FDE68A',
          }}
        >
          <Text style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>⚠️</Text>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.gray[900],
              textAlign: 'center',
              marginBottom: 6,
            }}
          >
            Người giúp việc có sự cố khẩn cấp
          </Text>
          <Text
            style={{ fontSize: 14, color: COLORS.gray[700], textAlign: 'center', lineHeight: 20 }}
          >
            Người giúp việc của đơn{' '}
            <Text style={{ fontWeight: '700' }}>
              {decision.service_name ?? decision.job_title ?? ''}
            </Text>{' '}
            không thể tiếp tục vì: <Text style={{ fontWeight: '700' }}>{reasonLabel}</Text>. Bạn
            muốn xử lý thế nào?
          </Text>

          {decision.photo_urls?.length ? (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <PhotoThumbRow
                urls={decision.photo_urls}
                label="📷 Ảnh minh chứng từ người giúp việc"
              />
            </View>
          ) : null}

          <View
            style={{
              backgroundColor: '#FFFBEB',
              borderRadius: 14,
              padding: 14,
              marginTop: 16,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 19 }}>
              🔄 <Text style={{ fontWeight: '700' }}>Đổi người:</Text> một thợ khác sẽ tiếp tục đơn
              — giá và số tiền giữ đảm bảo <Text style={{ fontWeight: '700' }}>không thay đổi</Text>
              .
            </Text>
            <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 19 }}>
              ↩️ <Text style={{ fontWeight: '700' }}>Hủy đơn:</Text> hoàn{' '}
              <Text style={{ fontWeight: '700' }}>100% tiền</Text> vào ví của bạn, không mất phí.
            </Text>
          </View>

          {decision.decision_expires_at_ms ? (
            <Text
              style={{
                textAlign: 'center',
                marginTop: 14,
                fontSize: 13,
                fontWeight: '700',
                color: expired || remainingMs <= 60_000 ? '#DC2626' : COLORS.gray[500],
              }}
            >
              {expired
                ? 'Đã quá hạn quyết định — hệ thống đang xử lý theo chính sách mặc định'
                : `⏱ Vui lòng quyết định trong ${formatCountdown(remainingMs)}`}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => handle('accept_replacement')}
            disabled={decide.isPending || expired}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 14,
              opacity: decide.isPending || expired ? 0.6 : 1,
            }}
          >
            {decide.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15.5 }}>
                🔄 Chấp nhận đổi người
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handle('cancel_job')}
            disabled={decide.isPending || expired}
            style={{
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: 'center',
              marginTop: 10,
              borderWidth: 1.5,
              borderColor: '#FCA5A5',
              opacity: decide.isPending || expired ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 15 }}>
              Hủy đơn — hoàn tiền 100%
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
