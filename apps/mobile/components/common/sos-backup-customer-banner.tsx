// components/common/sos-backup-customer-banner.tsx — Banner SOS Backup trong
// màn chi tiết đơn của KHÁCH:
//  - Đang có SOS chờ mình quyết định: banner nhắc + nút mở lại popup quyết định
//  - Đang phát sóng tìm thợ thay (pending): số liệu trực tiếp (đợt mời, số thợ đã mời,
//    đếm ngược tới hạn tìm thợ, thông báo rõ nếu chưa có thợ online gần bạn)
//  - Đơn đã được thay thợ qua SOS: thông báo bền kèm tên thợ thay thế & thời điểm
//  - Hết hạn tìm thợ thay (expired): nêu rõ lý do + kết quả hủy đơn/hoàn tiền
import { View, Text, ActivityIndicator } from 'react-native';
import { formatDateTime } from '@/utils/date-format';
import dayjs from 'dayjs';
import { AlertTriangle, RefreshCw, Clock, XCircle } from 'lucide-react-native';
import { Button, Card, useThemeColors } from '@/components/ui';
import { PhotoThumbRow } from '@/components/common/photo-thumbs';
import { useSosBackupByJob } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { useSosBackupStore } from '@/stores/sos-backup.store';
import { useNowTick, formatCountdown } from '@/hooks/use-countdown';
import { useTranslation } from '@/hooks/use-i18n';

const ACTIVE_STATUSES = ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress'];

export function SosBackupCustomerBanner({ job }: { job: any }) {
  const { lang, fs } = useTranslation();
  const tc = useThemeColors();
  const myId = useAuthStore(s => s.user?._id);
  const setDecision = useSosBackupStore(s => s.setDecision);

  const isActive = ACTIVE_STATUSES.includes(job?.status);
  const replacement = (job as any)?.sos_backup_replacement;
  const isSosCancelled =
    job?.status === 'cancelled' &&
    typeof job?.cancellation_reason === 'string' &&
    job.cancellation_reason.toLowerCase().includes('sos');

  const shouldFetchSos =
    Boolean(job?._id) &&
    (isActive || Boolean((job as any)?.sos_backup_searching) || Boolean(replacement) || isSosCancelled);

  // Poll nhanh hơn (5s) khi đang ở trạng thái tìm thợ thay thế
  const { data: sosResp } = useSosBackupByJob(
    shouldFetchSos ? job?._id : undefined,
    (job as any)?.sos_backup_searching ? 5000 : 15000,
  );
  const sos = sosResp?.sos;
  const latestSos = sosResp?.sos_list?.[0];

  const isPendingSearch =
    !replacement &&
    (sos?.status === 'pending' || (Boolean((job as any)?.sos_backup_searching) && !latestSos));
  const pendingDeadlineMs = sos?.expires_at ? new Date(sos.expires_at).getTime() : null;
  const now = useNowTick(Boolean(isPendingSearch && pendingDeadlineMs));

  if (!job) return null;

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

  // Số liệu phát sóng trực tiếp cho trạng thái pending
  const candidates = Array.isArray(sos?.candidates) ? sos.candidates : [];
  const invitedCount =
    typeof sos?.invited_count === 'number'
      ? sos.invited_count
      : candidates.filter((c: any) => (c?.wave ?? 0) > 0).length;
  const activeInvitedCount =
    typeof sos?.active_invited_count === 'number'
      ? sos.active_invited_count
      : candidates.filter((c: any) => c?.state === 'invited').length;
  const declinedCount =
    typeof sos?.declined_count === 'number'
      ? sos.declined_count
      : candidates.filter((c: any) => c?.state === 'declined').length;
  const currentWave = Math.max(1, Number(sos?.current_wave ?? 1));
  const maxWaves = Math.max(currentWave, Number(sos?.max_waves ?? 3));
  const remainingMs = pendingDeadlineMs ? Math.max(0, pendingDeadlineMs - now) : 0;

  // Tên thợ thay thế (từ sos_backup_replacement hoặc job.helper_id)
  const replacementHelperName =
    replacement?.new_helper_name ||
    (typeof job?.helper_id === 'object' &&
    job?.helper_id?._id &&
    String(job.helper_id._id) === String(replacement?.new_helper_id)
      ? job.helper_id.full_name
      : undefined);

  // Kết quả hết hạn không tìm được thợ thay
  const showExpiredResult =
    !sos && !replacement && !isPendingSearch && latestSos?.status === 'expired';

  return (
    <>
      {awaitingMine && (
        <Card
          style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1.5, gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={fs(18)} color="#92400E" />
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#92400E', flex: 1 }}>
              {lang === 'en'
                ? 'Helper encountered an issue — your decision needed'
                : 'Người giúp việc gặp sự cố — cần bạn quyết định'}
            </Text>
          </View>
          <Text
            style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: Math.round(fs(19)) }}
          >
            {lang === 'en'
              ? 'The helper cannot continue this job. You can agree to switch helpers (price unchanged) or cancel with 100% refund.'
              : 'Người giúp việc không thể tiếp tục đơn này. Bạn có thể đồng ý đổi người khác (giữ nguyên giá) hoặc hủy đơn với hoàn tiền 100%.'}
          </Text>
          {sos.photo_urls?.length ? (
            <PhotoThumbRow
              urls={sos.photo_urls}
              size={56}
              label={lang === 'en' ? 'Incident evidence photos' : 'Ảnh minh chứng sự cố'}
            />
          ) : null}
          <Button
            title={lang === 'en' ? 'Choose replacement or cancel' : 'Chọn đổi người hoặc hủy đơn'}
            onPress={openDecision}
          />
        </Card>
      )}

      {isPendingSearch && (
        <Card
          style={{ backgroundColor: '#FFFBEB', borderColor: '#FCD34D', borderWidth: 1.5, gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color="#D97706" />
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#92400E', flex: 1 }}>
              {lang === 'en'
                ? 'Agreed to replace — finding replacement helper'
                : 'Đã đồng ý đổi người — đang tìm thợ thay thế'}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderRadius: 10,
              padding: 10,
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: fs(13), fontWeight: '700', color: '#78350F' }}>
                {lang === 'en'
                  ? `Wave ${currentWave}/${maxWaves} · Invited: ${invitedCount} helpers`
                  : `Đợt mời: ${currentWave}/${maxWaves} · Số thợ đã mời: ${invitedCount}`}
              </Text>
              {pendingDeadlineMs ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Clock size={fs(13)} color="#B45309" />
                  <Text style={{ fontSize: fs(12.5), fontWeight: '800', color: '#B45309' }}>
                    {lang === 'en'
                      ? `Left: ${formatCountdown(remainingMs)}`
                      : `Còn lại: ${formatCountdown(remainingMs)}`}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                fontSize: fs(12.5),
                color: tc.textSecondary,
                lineHeight: Math.round(fs(18)),
              }}
            >
              {invitedCount === 0
                ? lang === 'en'
                  ? 'Currently no helpers are online nearby — the system is expanding search radius and waiting during the broadcast window.'
                  : 'Hiện không có thợ nào đang online gần bạn — hệ thống tiếp tục quét và mở rộng bán kính tìm kiếm trong thời gian chờ.'
                : lang === 'en'
                  ? `Waiting for response from ${activeInvitedCount} invited helper(s)${declinedCount > 0 ? ` (${declinedCount} declined)` : ''}. Price and escrow remain unchanged.`
                  : `Đang chờ phản hồi từ ${activeInvitedCount} thợ được mời${declinedCount > 0 ? ` (${declinedCount} thợ không thể nhận)` : ''}. Giá đơn và tiền giữ đảm bảo không đổi.`}
            </Text>
          </View>
        </Card>
      )}

      {replacement && (
        <Card
          style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1.5, gap: 6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={fs(18)} color="#1E40AF" />
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#1E40AF', flex: 1 }}>
              {lang === 'en'
                ? 'Helper has been replaced due to an incident'
                : 'Người giúp việc đã được thay thế do sự cố'}
            </Text>
          </View>
          <Text
            style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: Math.round(fs(19)) }}
          >
            {lang === 'en'
              ? `The previous helper encountered an unexpected incident, so ${
                  replacementHelperName ? `helper ${replacementHelperName}` : 'another helper'
                } has taken over your job${
                  replacement.replaced_at
                    ? ` since ${formatDateTime(dayjs(replacement.replaced_at), lang)}`
                    : ''
                }. Your job price and escrow hold remain unchanged.`
              : `Người giúp việc trước gặp sự cố bất khả kháng nên ${
                  replacementHelperName ? `thợ ${replacementHelperName}` : 'một thợ khác'
                } đã tiếp tục đơn của bạn${
                  replacement.replaced_at
                    ? ` từ ${formatDateTime(dayjs(replacement.replaced_at), lang)}`
                    : ''
                }. Giá đơn và số tiền giữ đảm bảo của bạn không thay đổi.`}
          </Text>
        </Card>
      )}

      {showExpiredResult && (
        <Card
          style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1.5, gap: 6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <XCircle size={fs(18)} color="#DC2626" />
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#991B1B', flex: 1 }}>
              {lang === 'en'
                ? 'Replacement search expired — order cancelled'
                : 'Không tìm được thợ thay thế — đơn đã hủy'}
            </Text>
          </View>
          <Text
            style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: Math.round(fs(19)) }}
          >
            {lang === 'en'
              ? `Reason: ${
                  (latestSos?.invited_count ?? 0) === 0
                    ? 'no helpers were available online nearby during the search window'
                    : 'no invited helper accepted before the search window expired'
                }. The order has been automatically cancelled and any online payment will be 100% refunded.`
              : `Lý do: ${
                  (latestSos?.invited_count ?? 0) === 0
                    ? 'hiện không có thợ nào đang online gần bạn trong suốt thời gian tìm kiếm'
                    : 'các đợt phát sóng đã hết hạn nhưng chưa có thợ nhận thay'
                }. Đơn đã tự động hủy theo chính sách SOS${
                  job?.payment_status === 'refunded'
                    ? ' và hoàn 100% số tiền đã thanh toán vào ví của bạn.'
                    : '.'
                }`}
          </Text>
        </Card>
      )}
    </>
  );
}
