// components/common/sos-backup-customer-banner.tsx — Banner SOS Backup trong
// màn chi tiết đơn của KHÁCH:
//  - Đơn đã được thay thợ qua SOS: thông báo bền (đọc từ dữ liệu đơn, còn sau
//    khi tải lại app) "Người giúp việc đã được thay thế do sự cố…"
//  - Đang có SOS chờ mình quyết định: banner nhắc + nút mở lại popup quyết định
import { View, Text } from 'react-native';
import dayjs from 'dayjs';
import { Button, Card, COLORS } from '@/components/ui';
import { PhotoThumbRow } from '@/components/common/photo-thumbs';
import { useSosBackupByJob } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { useSosBackupStore } from '@/stores/sos-backup.store';

const ACTIVE_STATUSES = ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress'];

export function SosBackupCustomerBanner({ job }: { job: any }) {
  const myId = useAuthStore(s => s.user?._id);
  const setDecision = useSosBackupStore(s => s.setDecision);
  const isActive = ACTIVE_STATUSES.includes(job?.status);
  const { data: sosResp } = useSosBackupByJob(isActive ? job?._id : undefined);
  const sos = sosResp?.sos;

  if (!job) return null;
  const replacement = (job as any).sos_backup_replacement;

  const awaitingMine =
    sos &&
    sos.status === 'awaiting_customer' &&
    (sos.my_state === 'customer' || sos.customer_id === myId);

  const openDecision = () => {
    if (!sos) return;
    setDecision({
      sos_id: sos.sos_id ?? sos._id,
      job_id: String(job._id),
      job_title: sos.job_title,
      service_name: sos.service_name,
      reason: sos.reason,
      district: sos.district,
      city: sos.city,
      photo_urls: sos.photo_urls ?? [],
      decision_expires_at_ms: sos.decision_deadline
        ? new Date(sos.decision_deadline).getTime()
        : undefined,
    });
  };

  return (
    <>
      {awaitingMine && (
        <Card
          style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1.5, gap: 8 }}
        >
          <Text style={{ fontWeight: '800', fontSize: 15, color: '#92400E' }}>
            ⚠️ Người giúp việc gặp sự cố — cần bạn quyết định
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
            Người giúp việc không thể tiếp tục đơn này. Bạn có thể đồng ý đổi người khác (giữ nguyên
            giá) hoặc hủy đơn với hoàn tiền 100%.
          </Text>
          {sos.photo_urls?.length ? (
            <PhotoThumbRow urls={sos.photo_urls} size={56} label="📷 Ảnh minh chứng sự cố" />
          ) : null}
          <Button title="Chọn đổi người hoặc hủy đơn" onPress={openDecision} />
        </Card>
      )}

      {replacement && (
        <Card
          style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1.5, gap: 6 }}
        >
          <Text style={{ fontWeight: '800', fontSize: 15, color: '#1E40AF' }}>
            🔄 Người giúp việc đã được thay thế do sự cố
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
            Người giúp việc trước gặp sự cố bất khả kháng nên một thợ khác đã tiếp tục đơn của bạn
            {replacement.replaced_at
              ? ` từ ${dayjs(replacement.replaced_at).format('HH:mm DD/MM/YYYY')}`
              : ''}
            . Giá đơn và số tiền giữ đảm bảo của bạn không thay đổi.
          </Text>
          <View />
        </Card>
      )}
    </>
  );
}
