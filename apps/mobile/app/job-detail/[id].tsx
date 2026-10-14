import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  MessageCircle,
  Star,
  ChevronRight,
  MapPin,
  Calendar,
  Clock,
  Check,
  X,
  ShieldCheck,
  Camera,
  Video,
  Sparkles,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useJobDetail,
  useJobQuotes,
  useJobContract,
  useSelectQuote,
  useCancelJob,
  useApproveJob,
  useCreateReview,
} from '@/hooks/use-api';
import { useJobSocketUpdates, useHelperLocation } from '@/hooks/use-socket';
import { LiveTrackingMap } from '@/components/common/live-tracking-map';
import {
  Button,
  Card,
  JobStatusBadge,
  Avatar,
  StarRating,
  LoadingSpinner,
  COLORS,
  Separator,
  PriceText,
  Badge,
} from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

// ── Status Step tracker ────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { key: 'open', label: 'Đăng yêu cầu' },
  { key: 'receiving_quotes', label: 'Nhận báo giá' },
  { key: 'confirmed', label: 'Đã chọn thợ' },
  { key: 'helper_on_the_way', label: 'Thợ đang di chuyển' },
  { key: 'helper_arrived', label: 'Thợ đã đến nơi' },
  { key: 'in_progress', label: 'Đang làm việc' },
  { key: 'pending_review', label: 'Chờ nghiệm thu' },
  { key: 'completed', label: 'Hoàn tất ✓' },
];

const STATUS_ORDER = STATUS_STEPS.map(s => s.key);

// 45 -> "45 phút", 651 -> "10 giờ 51 phút"
function formatTravelTime(minutes?: number): string {
  const m = Math.max(1, Math.round(minutes ?? 0));
  if (m < 60) return `${m} phút`;
  return m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m / 60} giờ`;
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/jobs' : '/(customer)/jobs');
  };

  // ── Realtime Socket Updates ──────────────────────────────────────────────
  useJobSocketUpdates(id);
  const helperLocation = useHelperLocation(id);

  const { data: job, isLoading: jLoading } = useJobDetail(id);
  const { data: quotes } = useJobQuotes(id);
  const { data: contract } = useJobContract(id);
  const selectQuote = useSelectQuote();
  const cancelJob = useCancelJob();
  const approveJob = useApproveJob();
  const createReview = useCreateReview();

  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [selectedMediaPreview, setSelectedMediaPreview] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    dayjs().add(1, 'day').format('YYYY-MM-DDT09:00:00'),
  );

  const insets = useSafeAreaInsets();

  if (jLoading) return <LoadingSpinner />;
  if (!job) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#fff',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <Text style={{ fontSize: 16, color: COLORS.gray[600], marginBottom: 16 }}>
          Không tìm thấy thông tin đơn hàng
        </Text>
        <Button title="Quay lại" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const currentStepIdx = STATUS_ORDER.indexOf(job.status);
  const isActive = !['completed', 'cancelled', 'disputed'].includes(job.status);
  const canCancel = ['open', 'receiving_quotes'].includes(job.status);
  const canApprove = job.status === 'pending_review';
  const hasHelperAssigned = !!job.helper_id;

  const helperObj = typeof job.helper_id === 'object' && job.helper_id ? job.helper_id : null;
  const serviceObj = typeof job.service_id === 'object' && job.service_id ? job.service_id : null;

  const handleSelectQuote = (quoteId: string) => {
    Alert.alert(
      'Chọn thợ này?',
      'Sau khi chọn, hợp đồng sẽ được tạo và cuộc trò chuyện sẽ mở để trao đổi.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            try {
              await selectQuote.mutateAsync({
                jobId: id!,
                quote_id: quoteId,
                scheduled_at: selectedDate,
              });
              Toast.show({
                type: 'success',
                text1: 'Đã chọn thợ thành công!',
                text2: 'Hợp đồng đã được kích hoạt',
              });
            } catch (err: any) {
              const msg = err?.response?.data?.message || 'Không thể chọn báo giá';
              Toast.show({ type: 'error', text1: msg });
            }
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Alert.alert('Hủy đơn hàng?', 'Bạn có chắc chắn muốn hủy yêu cầu này?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy đơn',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelJob.mutateAsync({ jobId: id!, reason: 'Khách hàng hủy yêu cầu' });
            Toast.show({ type: 'success', text1: 'Đã hủy đơn hàng thành công' });
          } catch {
            Toast.show({ type: 'error', text1: 'Hủy đơn thất bại' });
          }
        },
      },
    ]);
  };

  const handleSubmitReview = async () => {
    try {
      await approveJob.mutateAsync({ jobId: id!, rating, review: reviewText });
      if (job.helper_id) {
        const helperIdStr = typeof job.helper_id === 'string' ? job.helper_id : job.helper_id._id;
        await createReview.mutateAsync({
          job_id: id!,
          helper_id: helperIdStr,
          rating,
          comment: reviewText,
        });
      }
      Toast.show({
        type: 'success',
        text1: 'Nghiệm thu & Đánh giá thành công!',
        text2: 'Cảm ơn bạn đã tin tưởng Green House',
      });
      setShowReview(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Gửi đánh giá thất bại' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header (Safe Insets) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(
                user?.active_role === 'helper' ? '/(helper)/jobs' : '/(customer)/jobs',
              );
            }
          }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={22} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: COLORS.gray[900],
            marginLeft: 12,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {job.title}
        </Text>
        <JobStatusBadge status={job.status} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
      >
        {/* ── Status tracker ─────────────────────────────────────────── */}
        {job.status !== 'cancelled' && (
          <Card style={{ gap: 12, padding: 16 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              Tiến trình thực hiện
            </Text>
            {STATUS_STEPS.filter(s => s.key !== 'cancelled').map((s, i) => {
              const done = i < currentStepIdx;
              const active = i === currentStepIdx;
              return (
                <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: done
                        ? COLORS.success
                        : active
                          ? COLORS.primary
                          : COLORS.gray[200],
                    }}
                  >
                    {done ? (
                      <Check size={14} color="#fff" strokeWidth={3} />
                    ) : (
                      <Text
                        style={{
                          fontSize: 11,
                          color: active ? '#fff' : COLORS.gray[500],
                          fontWeight: '800',
                        }}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active ? '800' : done ? '600' : '400',
                      color: active ? COLORS.primary : done ? COLORS.gray[900] : COLORS.gray[400],
                    }}
                  >
                    {s.label}
                  </Text>
                  {active && (
                    <View
                      style={{
                        marginLeft: 'auto',
                        backgroundColor: COLORS.primaryLight,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>
                        HIỆN TẠI
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {/* ── Live Map Tracking (Khi Thợ đang di chuyển hoặc đã đến) ─── */}
        {(job.status === 'helper_on_the_way' || job.status === 'helper_arrived') && (
          <LiveTrackingMap
            customerLocation={{
              latitude: job.address?.location?.coordinates?.[1] || 10.7725,
              longitude: job.address?.location?.coordinates?.[0] || 106.6983,
            }}
            helperLocation={
              helperLocation?.current
                ? {
                    latitude: helperLocation.current.lat,
                    longitude: helperLocation.current.lng,
                  }
                : undefined
            }
            customerAddress={job.address?.full_address}
            helperName={helperObj?.full_name || 'Thợ Green House'}
            etaMinutes={12}
            height={220}
          />
        )}

        {/* ── Job info ───────────────────────────────────────────────── */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={serviceObj?.name ?? 'Dịch vụ'} />
            {job.preferred_date && (
              <Badge
                label={dayjs(job.preferred_date).format('DD/MM/YYYY')}
                color={COLORS.gray[100]}
                textColor={COLORS.gray[700]}
              />
            )}
            {job.preferred_time_start && (
              <Badge
                label={job.preferred_time_start}
                color={COLORS.gray[100]}
                textColor={COLORS.gray[700]}
              />
            )}
          </View>

          <Text
            style={{ fontSize: 15, color: COLORS.gray[900], lineHeight: 22, fontWeight: '500' }}
          >
            {job.description}
          </Text>

          <Separator my={4} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={16} color={COLORS.gray[500]} style={{ marginTop: 2 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: COLORS.gray[700],
                lineHeight: 20,
                fontWeight: '600',
              }}
            >
              {job.address?.full_address}
              {job.address?.district ? `, ${job.address.district}` : ''},{' '}
              {job.address?.city ?? 'Hồ Chí Minh'}
            </Text>
          </View>
        </Card>

        {/* ── Helper assigned card ───────────────────────────────────── */}
        {hasHelperAssigned && helperObj && (
          <Card style={{ padding: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                Thợ phụ trách đơn hàng
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const hUserId =
                    typeof job.helper_id === 'string' ? job.helper_id : job.helper_id?._id;
                  router.push({ pathname: '/helper-profile/[id]', params: { id: hUserId } });
                }}
              >
                <Text style={{ fontSize: 12.5, color: COLORS.primary, fontWeight: '700' }}>
                  Xem hồ sơ thợ →
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const hUserId =
                  typeof job.helper_id === 'string' ? job.helper_id : job.helper_id?._id;
                router.push({ pathname: '/helper-profile/[id]', params: { id: hUserId } });
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Avatar name={helperObj.full_name} uri={helperObj.avatar} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                    {helperObj.full_name}
                  </Text>
                  <ShieldCheck size={16} color={COLORS.success} />
                </View>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                  {helperObj.phone}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
                style={{
                  backgroundColor: COLORS.primaryLight,
                  borderRadius: 12,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: '#FFD9C5',
                }}
              >
                <MessageCircle size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          </Card>
        )}

        {/* ── Quotes List ────────────────────────────────────────────── */}
        {['open', 'receiving_quotes'].includes(job.status) && (
          <Card style={{ gap: 12, padding: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.gray[900] }}>
                Danh sách thợ báo giá ({quotes?.length ?? 0})
              </Text>
            </View>

            {!quotes || quotes.length === 0 ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
                  Đang quét và gửi đơn tới các thợ trong khu vực lân cận...
                </Text>
              </View>
            ) : (
              quotes.map((q: any) => {
                const hName = q.helper_id?.full_name || 'Thợ đối tác';
                const hAvatar = q.helper_id?.avatar;
                return (
                  <View
                    key={q._id}
                    style={{
                      borderWidth: 1.5,
                      borderColor: COLORS.gray[200],
                      borderRadius: 16,
                      padding: 14,
                      gap: 10,
                      backgroundColor: '#fff',
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        const hId =
                          typeof q.helper_id === 'string' ? q.helper_id : q.helper_id?._id;
                        if (hId)
                          router.push({ pathname: '/helper-profile/[id]', params: { id: hId } });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <Avatar name={hName} uri={hAvatar} size={42} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text
                            style={{ fontWeight: '800', fontSize: 14, color: COLORS.gray[900] }}
                          >
                            {hName}
                          </Text>
                          <ShieldCheck size={14} color={COLORS.success} />
                        </View>
                        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 1 }}>
                          {/* Thời gian di chuyển thực tế theo quãng đường, không phải số giờ thợ tự ước tính */}
                          {q.distance_km != null
                            ? `Cách ${q.distance_km}km • Dự kiến đến ~${formatTravelTime(q.estimated_minutes)}`
                            : 'Chưa xác định được vị trí thợ'}
                          {q.available_date && ` • ${dayjs(q.available_date).format('DD/MM')}`}
                        </Text>
                      </View>
                      <PriceText amount={q.total_price} size={18} />
                    </TouchableOpacity>

                    {q.notes && (
                      <View
                        style={{ backgroundColor: COLORS.gray[50], padding: 10, borderRadius: 10 }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            color: COLORS.gray[700],
                            fontStyle: 'italic',
                            lineHeight: 18,
                          }}
                        >
                          "{q.notes}"
                        </Text>
                      </View>
                    )}

                    <Button
                      title="Chấp nhận thợ này"
                      size="sm"
                      fullWidth={false}
                      style={{ alignSelf: 'flex-end', marginTop: 4 }}
                      loading={selectQuote.isPending}
                      onPress={() => handleSelectQuote(q._id)}
                    />
                  </View>
                );
              })
            )}
          </Card>
        )}

        {/* ── Contract Details ───────────────────────────────────────── */}
        {contract && (
          <Card style={{ gap: 10, padding: 16 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              Chi tiết hợp đồng dịch vụ
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORS.gray[600], fontSize: 13.5 }}>Tiền công thợ</Text>
              <PriceText
                amount={contract.labor_cost}
                size={14}
                color={COLORS.gray[900]}
                bold={false}
              />
            </View>
            {contract.materials_cost > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: COLORS.gray[600], fontSize: 13.5 }}>Vật tư & Linh kiện</Text>
                <PriceText
                  amount={contract.materials_cost}
                  size={14}
                  color={COLORS.gray[900]}
                  bold={false}
                />
              </View>
            )}
            <Separator my={4} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: COLORS.gray[900], fontSize: 15 }}>
                Tổng thanh toán
              </Text>
              <PriceText amount={contract.total_price} size={17} />
            </View>
          </Card>
        )}

        {/* ── Bằng chứng nghiệm thu từ Thợ (Ảnh / Video hoàn thành) ── */}
        {((job.completion_photos && job.completion_photos.length > 0) ||
          (job.completion_videos && job.completion_videos.length > 0) ||
          job.completion_notes ||
          job.status === 'pending_review') && (
          <Card style={{ gap: 12, padding: 16, borderColor: '#FED7AA', borderWidth: 1.5 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={18} color={COLORS.primary} />
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Bằng chứng hoàn thành từ thợ
                </Text>
              </View>
              {job.status === 'pending_review' && (
                <Badge
                  label="Chờ bạn kiểm tra"
                  color={COLORS.warningLight}
                  textColor={COLORS.warning}
                />
              )}
            </View>

            {job.completion_notes && (
              <View style={{ backgroundColor: COLORS.gray[50], padding: 12, borderRadius: 12 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.gray[600],
                    fontWeight: '700',
                    marginBottom: 2,
                  }}
                >
                  Ghi chú từ thợ:
                </Text>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                  "{job.completion_notes}"
                </Text>
              </View>
            )}

            {/* Photos */}
            {job.completion_photos && job.completion_photos.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  📸 Hình ảnh kết quả ({job.completion_photos.length}):
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {job.completion_photos.map((uri: string, idx: number) => (
                      <TouchableOpacity
                        key={`comp-p-${idx}`}
                        activeOpacity={0.85}
                        onPress={() => setSelectedMediaPreview(uri)}
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 14,
                          overflow: 'hidden',
                          borderWidth: 1.5,
                          borderColor: COLORS.gray[200],
                        }}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Videos */}
            {job.completion_videos && job.completion_videos.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  🎥 Video nghiệm thu ({job.completion_videos.length}):
                </Text>
                <View style={{ gap: 8 }}>
                  {job.completion_videos.map((vUri: string, idx: number) => (
                    <TouchableOpacity
                      key={`comp-v-${idx}`}
                      activeOpacity={0.8}
                      onPress={() => setSelectedMediaPreview(vUri)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#EEF4FE',
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#BFDBFE',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: COLORS.secondary,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Video size={20} color="#FFF" />
                        </View>
                        <View>
                          <Text
                            style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.gray[900] }}
                          >
                            Video hoàn thành #{idx + 1}
                          </Text>
                          <Text
                            style={{ fontSize: 11.5, color: COLORS.secondary, fontWeight: '600' }}
                          >
                            Bấm để kiểm tra video nghiệm thu
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={18} color={COLORS.secondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </Card>
        )}

        {/* ── Actions ────────────────────────────────────────────────── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          {canApprove && (
            <Button
              title="✓ Kiểm tra xong • Nghiệm thu & Đánh giá 5⭐"
              onPress={() => setShowReview(true)}
            />
          )}
          {hasHelperAssigned && isActive && (
            <Button
              title="Nhắn tin với thợ phụ trách"
              variant="outline"
              icon={<MessageCircle size={18} color={COLORS.primary} />}
              onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
            />
          )}
          {canCancel && (
            <Button
              title="Hủy yêu cầu"
              variant="ghost"
              style={{ borderWidth: 1, borderColor: COLORS.gray[200] }}
              loading={cancelJob.isPending}
              onPress={handleCancel}
            />
          )}
        </View>
      </ScrollView>

      {/* ── Media Fullscreen Preview Modal ─────────────────────────────── */}
      <Modal visible={Boolean(selectedMediaPreview)} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <TouchableOpacity
            onPress={() => setSelectedMediaPreview(null)}
            style={{
              position: 'absolute',
              top: Math.max(insets.top + 10, 30),
              right: 20,
              backgroundColor: 'rgba(255,255,255,0.2)',
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99,
            }}
          >
            <X size={24} color="#FFF" />
          </TouchableOpacity>

          {selectedMediaPreview && (
            <View style={{ width: '100%', height: '75%', borderRadius: 16, overflow: 'hidden' }}>
              <Image
                source={{ uri: selectedMediaPreview }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
          )}
        </View>
      </Modal>

      {/* ── Review Modal ───────────────────────────────────────────────── */}
      <Modal visible={showReview} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowReview(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}
            >
              Nghiệm thu & Đánh giá
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
            <Text
              style={{
                fontSize: 16,
                color: COLORS.gray[700],
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              Bạn đánh giá chất lượng phục vụ của thợ thế nào?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Text style={{ fontSize: 44, opacity: s <= rating ? 1 : 0.25, color: '#F59E0B' }}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text
              style={{
                textAlign: 'center',
                color: COLORS.primary,
                fontWeight: '800',
                fontSize: 16,
              }}
            >
              {['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Rất hài lòng (5 sao)'][rating]}
            </Text>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                Nhận xét chi tiết (tuỳ chọn)
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  minHeight: 90,
                  textAlignVertical: 'top',
                  color: COLORS.gray[900],
                }}
                placeholder="Chia sẻ trải nghiệm của bạn về sự nhiệt tình, đúng giờ và tay nghề của thợ..."
                value={reviewText}
                onChangeText={setReviewText}
                multiline
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            <Button
              title="Xác nhận nghiệm thu & Gửi đánh giá"
              loading={approveJob.isPending || createReview.isPending}
              onPress={handleSubmitReview}
            />
          </ScrollView>
          <Toast />
        </View>
      </Modal>
    </View>
  );
}
