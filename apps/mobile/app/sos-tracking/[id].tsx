import { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ShieldCheck,
  Phone,
  MessageCircle,
  MapPin,
  Share2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Navigation,
  Star,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useJobDetail, useCancelJob, useHelperPublicProfile } from '@/hooks/use-api';
import { useNowTick, formatCountdown } from '@/hooks/use-countdown';
import { useJobSocketUpdates, useHelperLocation } from '@/hooks/use-socket';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { LiveTrackingMap } from '@/components/common/live-tracking-map';
import { useTranslation } from '@/hooks/use-i18n';
import { Button, Card, Avatar, LoadingSpinner, COLORS, Separator, PriceText, Skeleton, useThemeColors } from '@/components/ui';

dayjs.extend(relativeTime);

export default function SosTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();

  // ── Realtime Socket Updates ──────────────────────────────────────────────
  useJobSocketUpdates(id);
  const { data: job, isLoading, refetch } = useJobDetail(id);
  const helperLocation = useHelperLocation(
    id,
    typeof job?.helper_id === 'object' ? job.helper_id?._id : job?.helper_id,
  );
  const cancelJob = useCancelJob();
  // P1-11: live countdown clock (creation + 15 min ETA target).
  const nowMs = useNowTick(true);
  // P1-10: real helper rating / completed-job count from the public profile
  // (the job's helper_id populate only carries name/phone/avatar).
  const helperIdForProfile =
    typeof job?.helper_id === 'object' ? job?.helper_id?._id : job?.helper_id;
  const { data: helperProfile } = useHelperPublicProfile(
    typeof helperIdForProfile === 'string' ? helperIdForProfile : undefined,
  );

  // Lắng nghe sự kiện sos:accepted trực tiếp
  useEffect(() => {
    const unsub = socketService.on(SOCKET_EVENTS.SOS_ACCEPTED, (data: any) => {
      if (data?.job_id !== id) return;
      refetch();
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'HELPER ACCEPTED RESCUE REQUEST!' : 'ĐÃ CÓ THỢ NHẬN CỨU HỘ!',
        text2:
          lang === 'en'
            ? 'Helper is packing tools and rushing to your location.'
            : 'Thợ đang chuẩn bị đồ nghề và di chuyển gấp đến bạn.',
      });
    });
    return () => {
      unsub();
    };
  }, [refetch, id]);

  // B28: skeleton giữ khung (header + bản đồ + thẻ trạng thái + thẻ thợ) thay spinner trắng
  if (isLoading)
    return (
      <View style={{ flex: 1, backgroundColor: tc.background, padding: 16, gap: 12 }}>
        <Skeleton width="60%" height={24} />
        <Skeleton width="100%" height={220} radius={14} />
        <Skeleton width="100%" height={110} radius={14} />
        <Skeleton width="100%" height={90} radius={14} />
      </View>
    );

  // P2-25: bad / deleted id — don't render the scanning card with
  // undefined title/address and a map with no destination.
  if (!job) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 12,
        }}
      >
        <AlertTriangle size={40} color={COLORS.gray[400]} />
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text, textAlign: 'center' }}>
          {lang === 'en' ? 'Rescue request not found' : 'Không tìm thấy yêu cầu cứu hộ'}
        </Text>
        <Text style={{ fontSize: fs(13), color: tc.textMuted, textAlign: 'center' }}>
          {lang === 'en'
            ? 'This rescue request may have been deleted or the link is incorrect.'
            : 'Yêu cầu cứu hộ này có thể đã bị xóa hoặc liên kết không đúng.'}
        </Text>
        <Button
          title={lang === 'en' ? 'Back to home' : 'Về trang chủ'}
          onPress={() => router.replace('/(customer)/home')}
        />
      </View>
    );
  }

  const isMatched =
    job?.status === 'confirmed' ||
    job?.status === 'helper_on_the_way' ||
    job?.status === 'helper_arrived' ||
    job?.status === 'in_progress';
  // P1-12: terminal SOS jobs must never show the "searching" spinner.
  const isTerminal = [
    'completed',
    'cancelled',
    'pending_review',
    'refunded',
    'disputed',
    'expired',
  ].includes(job?.status ?? '');
  const isCancellable = [
    'open',
    'receiving_quotes',
    'quote_selected',
    'confirmed',
    'helper_on_the_way',
    'helper_arrived',
  ].includes(job?.status ?? '');
  // P1-11: live countdown to the 15-minute arrival target (creation + 15m).
  const etaDeadlineMs = job?.created_at
    ? new Date(job.created_at).getTime() + 15 * 60 * 1000
    : null;
  const etaRemainingMs = etaDeadlineMs !== null ? etaDeadlineMs - nowMs : null;
  // P1-10: real rating / completed count; omit both when unavailable.
  const helperRating = helperProfile?.average_rating ?? helperProfile?.rating ?? 0;
  const helperCompleted =
    helperProfile?.total_completed ?? helperProfile?.completed_jobs ?? 0;
  const helperVerified = helperProfile?.verification_status === 'approved';
  const helperObj = typeof job?.helper_id === 'object' && job?.helper_id ? job.helper_id : null;
  const hasRealHelper = Boolean(helperObj && (helperObj.full_name || helperObj.phone));
  const helperName = hasRealHelper
    ? helperObj?.full_name || ''
    : lang === 'en'
      ? 'Finding replacement helper...'
      : 'Đang tìm thợ thay thế...';
  const helperPhone = helperObj?.phone || '';
  const helperAvatar = helperObj?.avatar;

  const handleCallHelper = () => {
    if (helperPhone) {
      Linking.openURL(`tel:${helperPhone}`);
    }
  };

  const handleShareSos = async () => {
    try {
      const helperInfo = hasRealHelper && helperPhone ? ` (${helperPhone})` : '';
      await Share.share({
        message:
          lang === 'en'
            ? `I am requesting emergency SOS rescue for "${job?.title}" at address: ${job?.address?.full_address}. Helper: ${helperName}${helperInfo}. Track via Green House.`
            : `Tôi đang gọi cứu hộ sự cố khẩn cấp "${job?.title}" tại địa chỉ: ${job?.address?.full_address}. Thợ phụ trách: ${helperName}${helperInfo}. Theo dõi qua Green House.`,
      });
    } catch {
      /* ignore */
    }
  };

  const handleCancel = () => {
    Alert.alert(
      lang === 'en' ? 'Cancel rescue request?' : 'Hủy yêu cầu cứu hộ?',
      isMatched
        ? lang === 'en'
          ? 'Helper is rushing to your location. Cancelling now may incur helper travel fee.'
          : 'Thợ đang trên đường di chuyển khẩn cấp đến bạn. Hủy lúc này có thể phát sinh phí di chuyển của thợ.'
        : lang === 'en'
          ? 'Are you sure you want to cancel the rescue request?'
          : 'Bạn có chắc chắn muốn hủy yêu cầu cứu hộ?',
      [
        { text: lang === 'en' ? 'Keep waiting' : 'Tiếp tục chờ', style: 'cancel' },
        {
          text: lang === 'en' ? 'Confirm cancel' : 'Xác nhận hủy',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelJob.mutateAsync({
                jobId: id!,
                reason:
                  lang === 'en'
                    ? 'Customer cancelled SOS request'
                    : 'Khách hàng hủy yêu cầu SOS',
              });
              Toast.show({
                type: 'success',
                text1:
                  lang === 'en' ? 'Rescue request cancelled' : 'Đã hủy yêu cầu cứu hộ',
              });
              router.replace('/(customer)/home');
            } catch (err: any) {
              const msg =
                err?.response?.data?.message ||
                (lang === 'en'
                  ? 'Could not cancel this rescue request'
                  : 'Không thể hủy yêu cầu cứu hộ này');
              Toast.show({ type: 'error', text1: msg });
              refetch();
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: isTerminal ? '#6B7280' : isMatched ? '#10B981' : '#DC2626',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.replace('/(customer)/home')}
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={{ fontSize: fs(17), fontWeight: '900', color: '#FFFFFF' }}>
          {isTerminal
            ? lang === 'en'
              ? 'RESCUE REQUEST ENDED'
              : 'YÊU CẦU CỨU HỘ ĐÃ KẾT THÚC'
            : isMatched
              ? lang === 'en'
                ? 'HELPER ON THE WAY TO RESCUE'
                : 'THỢ ĐANG ĐẾN CỨU HỘ'
              : lang === 'en'
                ? 'SEARCHING FOR EMERGENCY HELPERS'
                : 'ĐANG TÌM THỢ KHẨN CẤP'}
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleShareSos}
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Share2 size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
      >
        {/* ── TRƯỜNG HỢP 1: ĐANG TÌM THỢ (chưa có thợ nhận) ───────────── */}
        {/* P1-12: terminal jobs show the terminal card below, never this. */}
        {!isMatched && !isTerminal && (
          <Card
            style={{
              alignItems: 'center',
              padding: 24,
              gap: 14,
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 2,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
            <Text
              style={{ fontSize: fs(19), fontWeight: '900', color: '#991B1B', textAlign: 'center' }}
            >
              {/* P1-11: no "5 nearest / 10km" claim — the backend broadcasts
                  to all verified online helpers with no distance filter. */}
              {lang === 'en'
                ? 'Notifying verified online helpers'
                : 'Đang thông báo tới các thợ online đã xác minh'}
            </Text>
            <Text
              style={{ fontSize: fs(13), color: '#B91C1C', textAlign: 'center', lineHeight: 19 }}
            >
              {lang === 'en'
                ? 'The system is notifying verified online helpers. The first helper to accept will rush to you.'
                : 'Hệ thống đang thông báo tới các thợ online đã xác minh. Thợ đầu tiên bấm nhận sẽ lập tức di chuyển đến bạn.'}
            </Text>

            <View
              style={{
                backgroundColor: tc.surface,
                padding: 12,
                borderRadius: 14,
                width: '100%',
                gap: 6,
                marginTop: 4,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                  {lang === 'en' ? 'Emergency issue:' : 'Sự cố khẩn cấp:'}
                </Text>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.text }}>
                  {job?.title}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                  {lang === 'en' ? 'Arrival target:' : 'Mục tiêu có mặt:'}
                </Text>
                <Text style={{ fontSize: fs(13), fontWeight: '900', color: '#DC2626' }}>
                  {/* P1-11: live countdown from creation + 15 min, not a
                      static "15 minutes" claim. */}
                  {etaRemainingMs !== null && etaRemainingMs > 0
                    ? lang === 'en'
                      ? `Within ${formatCountdown(etaRemainingMs)}`
                      : `Trong ${formatCountdown(etaRemainingMs)}`
                    : lang === 'en'
                      ? 'Past the 15-minute target — still searching'
                      : 'Đã quá mục tiêu 15 phút — vẫn đang tìm thợ'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* ── P1-12: terminal state instead of the endless scanning card ── */}
        {isTerminal && (
          <Card
            style={{
              alignItems: 'center',
              padding: 24,
              gap: 12,
              backgroundColor: '#F9FAFB',
              borderColor: tc.border,
              borderWidth: 1.5,
            }}
          >
            <CheckCircle2 size={44} color={COLORS.gray[400]} />
            <Text
              style={{ fontSize: fs(17), fontWeight: '900', color: tc.text, textAlign: 'center' }}
            >
              {job?.status === 'cancelled'
                ? lang === 'en'
                  ? 'Rescue request cancelled'
                  : 'Yêu cầu cứu hộ đã được hủy'
                : job?.status === 'completed'
                  ? lang === 'en'
                    ? 'Rescue completed'
                    : 'Cứu hộ đã hoàn thành'
                  : lang === 'en'
                    ? 'Rescue request ended'
                    : 'Yêu cầu cứu hộ đã kết thúc'}
            </Text>
            <Text style={{ fontSize: fs(13), color: tc.textMuted, textAlign: 'center' }}>
              {lang === 'en'
                ? 'This rescue request is no longer active. No helper is being dispatched.'
                : 'Yêu cầu cứu hộ này không còn hoạt động. Không còn thợ nào đang được điều phối.'}
            </Text>
            <Button
              title={lang === 'en' ? 'Back to home' : 'Về trang chủ'}
              onPress={() => router.replace('/(customer)/home')}
            />
          </Card>
        )}

        {/* ── TRƯỜNG HỢP 2: ĐÃ CÓ THỢ NHẬN (BẢN ĐỒ TRACKING NHƯ GRAB) ─── */}
        {isMatched && (
          <>
            {/* 1. Bản đồ Live Tracking thời gian thực (Grab Map Style) */}
            <LiveTrackingMap
              customerLocation={{
                latitude: job?.address?.location?.coordinates?.[1],
                longitude: job?.address?.location?.coordinates?.[0],
              }}
              helperLocation={
                helperLocation
                  ? { latitude: helperLocation.lat, longitude: helperLocation.lng }
                  : null
              }
              helperRecordedAt={helperLocation?.recorded_at}
              viewerRole="customer"
              customerAddress={job?.address?.full_address}
              helperName={helperName}
              status={job?.status}
              height={260}
              showNavigationButton={false}
            />

            {/* 2. Thẻ định danh Thợ cứu hộ */}
            <Card style={{ padding: 16, gap: 14 }}>
              <Text style={{ fontSize: fs(15), fontWeight: '900', color: tc.text }}>
                {lang === 'en' ? 'Assigned Rescue Helper' : 'Thông tin thợ cứu hộ phụ trách'}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={helperName} uri={helperAvatar} size={54} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: fs(16), color: tc.text }}>
                      {helperName}
                    </Text>
                    {hasRealHelper && <ShieldCheck size={18} color={COLORS.success} />}
                  </View>
                  <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2 }}>
                    {hasRealHelper && helperPhone
                      ? helperPhone
                      : lang === 'en'
                        ? 'Finding replacement helper...'
                        : 'Đang tìm thợ thay thế...'}
                  </Text>
                  {/* P1-10: real rating + completed count from the helper's
                      public profile; e-KYC badge only when actually
                      approved. Both omitted when the profile has no data. */}
                  {hasRealHelper && (helperVerified || helperRating > 0 || helperCompleted > 0) && (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                    >
                      {helperVerified && (
                        <View
                          style={{
                            backgroundColor: '#ECFDF5',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{ fontSize: fs(11), color: COLORS.success, fontWeight: '700' }}
                          >
                            e-KYC
                          </Text>
                        </View>
                      )}
                      {helperRating > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Star size={12} color="#F59E0B" fill="#F59E0B" />
                          <Text style={{ fontSize: fs(12), color: '#F59E0B', fontWeight: '800' }}>
                            {helperRating.toFixed(1)}
                            {helperCompleted > 0
                              ? lang === 'en'
                                ? ` (${helperCompleted} jobs)`
                                : ` (${helperCompleted} đơn)`
                              : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>

              <Separator my={2} />

              {/* Nút Gọi điện & Nhắn tin */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {hasRealHelper && helperPhone ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleCallHelper}
                    style={{
                      flex: 1,
                      backgroundColor: '#10B981',
                      borderRadius: 14,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                    }}
                  >
                    <Phone size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(14) }}>
                      {lang === 'en' ? 'Call Now' : 'Gọi điện ngay'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.primaryLight,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    borderWidth: 1.5,
                    borderColor: '#FFD9C5',
                  }}
                >
                  <MessageCircle size={18} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: fs(14) }}>
                    {lang === 'en' ? 'Message' : 'Nhắn tin'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </>
        )}

        {/* ── Thông tin địa chỉ & sự cố ────────────────────────────────── */}
        <Card style={{ padding: 16, gap: 10 }}>
          <Text style={{ fontSize: fs(14), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Rescue Address' : 'Địa chỉ cứu hộ'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
            <Text
              style={{
                flex: 1,
                fontSize: fs(14),
                color: tc.textSecondary,
                lineHeight: 20,
                fontWeight: '600',
              }}
            >
              {job?.address?.full_address}
              {job?.address?.district ? `, ${job?.address.district}` : ''}
            </Text>
          </View>
          <Separator my={2} />
          <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
            {job?.description}
          </Text>
        </Card>

        {/* ── Nút chia sẻ cho người thân & Hủy yêu cầu ─────────────────── */}
        <View style={{ gap: 10 }}>
          <Button
            title={
              lang === 'en'
                ? 'Share rescue location with family'
                : 'Chia sẻ vị trí cứu hộ cho người thân'
            }
            variant="outline"
            icon={<Share2 size={18} color={COLORS.primary} />}
            onPress={handleShareSos}
          />

          {isCancellable && (
            <Button
              title={lang === 'en' ? 'Cancel rescue request' : 'Hủy yêu cầu cứu hộ'}
              variant="ghost"
              style={{ borderWidth: 1, borderColor: tc.border }}
              onPress={handleCancel}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
