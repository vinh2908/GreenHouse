import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  MessageCircle,
  ChevronRight,
  MapPin,
  Check,
  X,
  ShieldCheck,
  Video,
  Sparkles,
  Edit3,
  Navigation,
  CreditCard,
  AlertTriangle,
  Camera,
  ImagePlus,
  Trash2,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { useAuthStore } from '@/stores/auth.store';
import {
  useJobDetail,
  useJobQuotes,
  useJobContract,
  useSelectQuote,
  useCancelJob,
  useApproveJob,
  useCreateReview,
  useUpdateJob,
  usePayJob,
  useOpenDispute,
  useRespondAmendment,
} from '@/hooks/use-api';
import { useJobSocketUpdates, useHelperLocation } from '@/hooks/use-socket';
import { locationService } from '@/services/location.service';
import { LiveTrackingMap } from '@/components/common/live-tracking-map';
import { LocationPicker } from '@/components/common/location-picker';
import { validCoordinate } from '@/services/tracking';
import {
  Button,
  Card,
  JobStatusBadge,
  Avatar,
  LoadingSpinner,
  COLORS,
  Separator,
  PriceText,
  Badge,
  Input,
} from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

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

const PAYMENT_METHODS = [
  { id: 'cash', label: '💵 Tiền mặt trực tiếp (Trừ phí 15% ví ký quỹ thợ)' },
  { id: 'vietqr', label: '🏦 Chuyển khoản VietQR (Escrow)' },
  { id: 'momo', label: '📱 Ví MoMo / ZaloPay (Escrow)' },
];

function formatTravelTime(minutes?: number): string {
  const m = Math.max(1, Math.round(minutes ?? 0));
  if (m < 60) return `${m} phút`;
  return m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m / 60} giờ`;
}

function isVideoUrl(uri?: string | null): boolean {
  if (!uri) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(uri) || uri.includes('video');
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/jobs' : '/(customer)/jobs');
  };

  useJobSocketUpdates(id);
  const { data: job, isLoading: jLoading } = useJobDetail(id);
  const helperLocation = useHelperLocation(
    id,
    typeof job?.helper_id === 'object' ? job.helper_id?._id : job?.helper_id,
  );
  const { data: quotes } = useJobQuotes(id);
  const { data: contract } = useJobContract(id);
  const selectQuote = useSelectQuote();
  const cancelJob = useCancelJob();
  const updateJob = useUpdateJob();
  const approveJob = useApproveJob();
  const createReview = useCreateReview();
  const payJob = usePayJob();
  const openDispute = useOpenDispute();
  const respondAmendment = useRespondAmendment();

  const [showReview, setShowReview] = useState(false);
  const [quoteToAccept, setQuoteToAccept] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('vietqr');
  const [selectedMediaPreview, setSelectedMediaPreview] = useState<string | null>(null);
  const [selectedDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DDT09:00:00'));

  // ── Dispute Modal States ─────────────────────────────────────────────────
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputePhotos, setDisputePhotos] = useState<string[]>([]);

  // ── Edit Job & Location Modal States ─────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFullAddress, setEditFullAddress] = useState('');
  const [editWard, setEditWard] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCoords, setEditCoords] = useState<[number, number] | null>(null);
  const [isLocatingEdit, setIsLocatingEdit] = useState(false);
  const [showEditMap, setShowEditMap] = useState(false);

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
        <Button title="Quay lại" variant="outline" onPress={handleBack} />
      </View>
    );
  }

  const currentStepIdx = STATUS_ORDER.indexOf(job.status);
  const isActive = !['completed', 'cancelled', 'disputed', 'refunded'].includes(job.status);
  const canCancel = [
    'open',
    'receiving_quotes',
    'quote_selected',
    'confirmed',
    'helper_on_the_way',
  ].includes(job.status);
  const canEdit = !['completed', 'cancelled', 'disputed', 'refunded'].includes(job.status);
  const canApprove = job.status === 'pending_review';
  const canDispute = ['in_progress', 'pending_review'].includes(job.status);
  const hasHelperAssigned = !!job.helper_id;

  const helperObj = typeof job.helper_id === 'object' && job.helper_id ? job.helper_id : null;
  const serviceObj = typeof job.service_id === 'object' && job.service_id ? job.service_id : null;

  const handleOpenEdit = () => {
    setEditTitle(job.title || '');
    setEditDescription(job.description || '');
    setEditFullAddress(job.address?.full_address || '');
    setEditWard(job.address?.ward || '');
    setEditDistrict(job.address?.district || '');
    setEditCity(job.address?.city || 'Hồ Chí Minh');
    setEditNotes(job.address?.notes || '');
    setEditCoords(job.address?.location?.coordinates || null);
    setShowEditModal(true);
  };

  const handleGetLiveLocationForEdit = async () => {
    setIsLocatingEdit(true);
    try {
      const details = await locationService.getCurrentLocationDetails();
      if (details) {
        setEditFullAddress(details.road || details.full_address);
        setEditWard(details.ward || '');
        setEditDistrict(details.district || '');
        setEditCity(details.city || 'Hồ Chí Minh');
        setEditCoords(details.coordinates);
        Toast.show({
          type: 'success',
          text1: 'Đã lấy vị trí GPS thành công',
          text2: details.full_address,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Chưa có quyền vị trí',
          text2: 'Vui lòng cấp quyền vị trí cho ứng dụng',
        });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể lấy vị trí GPS' });
    } finally {
      setIsLocatingEdit(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    if (!editFullAddress.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập địa chỉ chi tiết' });
      return;
    }
    if (!editCoords || !validCoordinate(editCoords[1], editCoords[0])) {
      Toast.show({ type: 'error', text1: 'Vui lòng xác nhận điểm hẹn trên bản đồ hoặc lấy GPS' });
      return;
    }
    try {
      await updateJob.mutateAsync({
        jobId: id,
        data: {
          title: editTitle || undefined,
          description: editDescription || undefined,
          address: {
            full_address: editFullAddress,
            ward: editWard || undefined,
            district: editDistrict || 'Quận 1',
            city: editCity || 'Hồ Chí Minh',
            notes: editNotes || undefined,
            location: {
              type: 'Point',
              coordinates: editCoords,
            },
          },
        },
      });
      setShowEditModal(false);
      Toast.show({
        type: 'success',
        text1: 'Cập nhật thành công! 🎉',
        text2: 'Đã lưu thông tin và vị trí mới cho đơn hàng',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật thất bại. Vui lòng thử lại.';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleSelectQuote = async () => {
    if (!quoteToAccept || !id || selectQuote.isPending) return;

    try {
      await selectQuote.mutateAsync({
        jobId: id,
        quote_id: quoteToAccept,
        scheduled_at: selectedDate,
      });
      setQuoteToAccept(null);
      Toast.show({
        type: 'success',
        text1: 'Đã chọn thợ thành công 🎉',
        text2: 'Hợp đồng đã sẵn sàng. Bạn có thể nhắn tin để trao đổi thêm.',
        visibilityTime: 5000,
      });
    } catch (err: any) {
      const responseMessage = err?.response?.data?.message;
      const message = Array.isArray(responseMessage) ? responseMessage.join('\n') : responseMessage;
      Toast.show({
        type: 'error',
        text1: 'Chưa thể chọn thợ',
        text2: message || 'Đơn có thể vừa được cập nhật. Hãy tải lại rồi thử lại.',
        visibilityTime: 5000,
      });
    }
  };

  const handleCancel = () => {
    const doCancel = async () => {
      try {
        await cancelJob.mutateAsync({ jobId: id!, reason: 'Khách hàng hủy yêu cầu' });
        Toast.show({ type: 'success', text1: 'Đã hủy đơn hàng thành công' });
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'Hủy đơn thất bại';
        Toast.show({ type: 'error', text1: msg });
      }
    };

    Alert.alert(
      'Hủy đơn hàng?',
      'Bạn có chắc chắn muốn hủy yêu cầu này không? Nếu đã có thợ nhận việc, vui lòng liên hệ trước với thợ.',
      [
        { text: 'Ở lại', style: 'cancel' },
        {
          text: 'Xác nhận hủy',
          style: 'destructive',
          onPress: doCancel,
        },
      ],
    );
  };

  const handleSubmitReview = async () => {
    try {
      // 1. Ghi nhận thanh toán nếu đơn chưa thanh toán
      if (job.payment_status !== 'paid') {
        await payJob
          .mutateAsync({ job_id: id!, payment_method: paymentMethod })
          .catch(() => undefined);
      }

      // 2. Nghiệm thu hoàn thành công việc & quyết toán theo phương thức (Tiền mặt vs Escrow)
      await approveJob.mutateAsync({
        jobId: id!,
        rating,
        review: reviewText,
        payment_method: paymentMethod,
      });

      // 3. Ghi nhận đánh giá vào bảng Reviews
      if (job.helper_id) {
        const helperIdStr = typeof job.helper_id === 'string' ? job.helper_id : job.helper_id._id;
        await createReview
          .mutateAsync({
            job_id: id!,
            helper_id: helperIdStr,
            rating,
            comment: reviewText,
          })
          .catch(() => undefined);
      }
      Toast.show({
        type: 'success',
        text1: 'Nghiệm thu & Thanh toán thành công!',
        text2: 'Cảm ơn bạn đã tin tưởng Green House',
      });
      setShowReview(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Gửi nghiệm thu thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleRespondAmendment = async (amendmentId: string, decision: 'accept' | 'reject') => {
    if (!id) return;
    try {
      await respondAmendment.mutateAsync({
        jobId: id,
        amendmentId,
        action: decision,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật phụ lục thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handlePickDisputePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện ảnh' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        setDisputePhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể chọn ảnh bằng chứng' });
    }
  };

  const handleTakeDisputePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập máy ảnh' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setDisputePhotos(prev => [...prev, result.assets[0].uri].slice(0, 4));
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh' });
    }
  };

  const handleSubmitDispute = async () => {
    if (!id) return;
    if (!disputeReason.trim() || disputeReason.trim().length < 5) {
      Toast.show({
        type: 'error',
        text1: 'Vui lòng mô tả chi tiết lý do khiếu nại (ít nhất 5 ký tự)',
      });
      return;
    }
    try {
      await openDispute.mutateAsync({
        jobId: id,
        reason: disputeReason.trim(),
        photos: disputePhotos,
      });
      setShowDisputeModal(false);
      setDisputeReason('');
      setDisputePhotos([]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Gửi khiếu nại thất bại';
      Toast.show({ type: 'error', text1: msg });
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
          onPress={handleBack}
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
        {/* ── Dispute / Refund Resolution Banner ─────────────────────── */}
        {(job.status === 'disputed' || job.status === 'refunded' || job.dispute_resolution) && (
          <Card
            style={{
              backgroundColor: job.status === 'disputed' ? '#FEF2F2' : '#EFF6FF',
              borderColor: job.status === 'disputed' ? '#FECACA' : '#BFDBFE',
              borderWidth: 1.5,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle
                size={18}
                color={job.status === 'disputed' ? COLORS.error : COLORS.secondary}
              />
              <Text
                style={{
                  fontWeight: '800',
                  fontSize: 15,
                  color: job.status === 'disputed' ? '#991B1B' : '#1E40AF',
                }}
              >
                {job.status === 'disputed'
                  ? '⚖️ Đơn hàng đang được Admin phân xử tranh chấp'
                  : '✅ Kết quả phân xử khiếu nại'}
              </Text>
            </View>
            {job.dispute_reason && (
              <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                <Text style={{ fontWeight: '700' }}>Lý do khiếu nại: </Text>
                {job.dispute_reason}
              </Text>
            )}
            {job.dispute_resolution && (
              <View
                style={{
                  backgroundColor: '#fff',
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.gray[200],
                  gap: 4,
                }}
              >
                <Text style={{ fontWeight: '800', fontSize: 13.5, color: COLORS.gray[900] }}>
                  Phán quyết:{' '}
                  {job.dispute_resolution.action === 'refund_full'
                    ? 'Hoàn tiền 100% cho Khách hàng'
                    : job.dispute_resolution.action === 'refund_partial'
                      ? `Hoàn một phần (${new Intl.NumberFormat('vi-VN').format(job.dispute_resolution.refund_amount || 0)}₫)`
                      : 'Giải ngân cho Thợ'}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                  {job.dispute_resolution.resolution_notes}
                </Text>
              </View>
            )}
          </Card>
        )}

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

        {/* ── Grab-Style Live Map Tracking & Route ─────────────────────── */}
        {job.address?.location?.coordinates && (
          <LiveTrackingMap
            customerLocation={{
              latitude: job.address?.location?.coordinates?.[1],
              longitude: job.address?.location?.coordinates?.[0],
            }}
            helperLocation={
              helperLocation
                ? { latitude: helperLocation.lat, longitude: helperLocation.lng }
                : null
            }
            helperRecordedAt={helperLocation?.recorded_at}
            viewerRole="customer"
            customerAddress={job.address?.full_address}
            helperName={helperObj?.full_name || 'Thợ Green House'}
            status={job.status}
            height={240}
            showNavigationButton={false}
          />
        )}

        {/* ── Job info ───────────────────────────────────────────────── */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 }}>
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
            {canEdit && (
              <TouchableOpacity
                onPress={handleOpenEdit}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: COLORS.primaryLight,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                }}
              >
                <Edit3 size={13} color={COLORS.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                  Sửa vị trí/tin
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text
            style={{ fontSize: 15, color: COLORS.gray[900], lineHeight: 22, fontWeight: '500' }}
          >
            {job.description}
          </Text>

          {job.photos && job.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {job.photos.map((uri: string, idx: number) => (
                  <TouchableOpacity
                    key={`job-p-${idx}`}
                    activeOpacity={0.85}
                    onPress={() => setSelectedMediaPreview(uri)}
                    style={{
                      width: 90,
                      height: 90,
                      borderRadius: 12,
                      overflow: 'hidden',
                      borderWidth: 1,
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
          )}

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
                  router.push({
                    pathname: '/helper-profile/[id]',
                    params: { id: hUserId, jobId: id },
                  });
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
                router.push({
                  pathname: '/helper-profile/[id]',
                  params: { id: hUserId, jobId: id },
                });
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
                          router.push({
                            pathname: '/helper-profile/[id]',
                            params: { id: hId, jobId: id, quoteId: q._id },
                          });
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
                      onPress={() => setQuoteToAccept(q._id)}
                    />
                  </View>
                );
              })
            )}
          </Card>
        )}

        {/* ── Contract Details & Amendments ──────────────────────────── */}
        {contract && (
          <Card style={{ gap: 10, padding: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                Chi tiết hợp đồng dịch vụ
              </Text>
              <Badge
                label={job.payment_status === 'paid' ? 'Đã thanh toán' : 'Giữ tiền bảo đảm'}
                color={job.payment_status === 'paid' ? COLORS.successLight : COLORS.primaryLight}
                textColor={job.payment_status === 'paid' ? COLORS.success : COLORS.primary}
                size="sm"
              />
            </View>
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

            {/* Danh sách phụ lục phát sinh chi phí / vật tư */}
            {Array.isArray(contract.amendments) && contract.amendments.length > 0 && (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Separator my={2} />
                <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.gray[900] }}>
                  📋 Phụ lục phát sinh vật tư / chi phí ({contract.amendments.length})
                </Text>
                {contract.amendments.map((am: any) => {
                  const addTotal =
                    (Number(am.additional_labor_cost) || 0) +
                    (Number(am.additional_materials_cost) || 0);
                  const isPending = am.status === 'pending';
                  return (
                    <View
                      key={am._id}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isPending
                          ? COLORS.warning
                          : am.status === 'accepted'
                            ? COLORS.success
                            : COLORS.gray[200],
                        backgroundColor: isPending
                          ? COLORS.warningLight
                          : am.status === 'accepted'
                            ? COLORS.successLight
                            : COLORS.gray[50],
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Badge
                          label={
                            isPending
                              ? '⏳ Chờ bạn duyệt'
                              : am.status === 'accepted'
                                ? '✓ Đã đồng ý'
                                : '✕ Đã từ chối'
                          }
                          color={
                            isPending ? '#FEF3C7' : am.status === 'accepted' ? '#D1FAE5' : '#FEE2E2'
                          }
                          textColor={
                            isPending ? '#92400E' : am.status === 'accepted' ? '#065F46' : '#991B1B'
                          }
                          size="sm"
                        />
                        <PriceText amount={addTotal} size={15} color={COLORS.primaryDark} />
                      </View>
                      <Text style={{ fontSize: 13.5, color: COLORS.gray[800], fontWeight: '600' }}>
                        Lý do: {am.reason}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray[600] }}>
                        Công phát sinh: +
                        {new Intl.NumberFormat('vi-VN').format(am.additional_labor_cost || 0)}₫ •
                        Vật tư: +
                        {new Intl.NumberFormat('vi-VN').format(am.additional_materials_cost || 0)}₫
                      </Text>
                      {isPending && (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                          <Button
                            title="✕ Từ chối"
                            variant="outline"
                            size="sm"
                            fullWidth={false}
                            style={{ flex: 1 }}
                            disabled={respondAmendment.isPending}
                            onPress={() => handleRespondAmendment(am._id, 'reject')}
                          />
                          <Button
                            title="✓ Đồng ý phụ lục"
                            size="sm"
                            fullWidth={false}
                            style={{ flex: 1 }}
                            loading={respondAmendment.isPending}
                            onPress={() => handleRespondAmendment(am._id, 'accept')}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        {/* ── Bằng chứng nghiệm thu từ Thợ ─────────────────────────── */}
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
                            Bấm để phát video nghiệm thu
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
              title="✓ Kiểm tra xong • Nghiệm thu & Thanh toán"
              onPress={() => setShowReview(true)}
            />
          )}
          {canDispute && (
            <Button
              title="⚠️ Khiếu nại / Báo sự cố chưa đạt chuẩn"
              variant="danger"
              onPress={() => setShowDisputeModal(true)}
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
          {canEdit && (
            <Button
              title="✏️  Chỉnh sửa vị trí & thông tin yêu cầu"
              variant="outline"
              onPress={handleOpenEdit}
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

      {/* ── Confirm helper selection ───────────────────────────────────── */}
      <Modal
        visible={Boolean(quoteToAccept)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!selectQuote.isPending) setQuoteToAccept(null);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(17,24,39,0.48)',
            padding: 22,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: '#fff',
              borderRadius: 24,
              padding: 22,
              alignItems: 'center',
              shadowColor: '#111827',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 12,
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 20,
                backgroundColor: COLORS.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Sparkles size={28} color={COLORS.primaryDark} />
            </View>
            <Text
              style={{
                color: COLORS.gray[900],
                fontSize: 19,
                fontWeight: '800',
                textAlign: 'center',
              }}
            >
              Chọn thợ này nhé?
            </Text>
            <Text
              style={{
                color: COLORS.gray[600],
                fontSize: 14,
                lineHeight: 21,
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              Sau khi xác nhận, báo giá này sẽ được chốt và hợp đồng cùng cuộc trò chuyện sẽ được
              tạo.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Button
                title="Để sau"
                variant="outline"
                fullWidth={false}
                disabled={selectQuote.isPending}
                style={{ flex: 1, alignSelf: 'auto' }}
                onPress={() => setQuoteToAccept(null)}
              />
              <Button
                title="Xác nhận chọn"
                fullWidth={false}
                loading={selectQuote.isPending}
                style={{ flex: 1, alignSelf: 'auto' }}
                onPress={handleSelectQuote}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dispute Modal (Mở khiếu nại có bằng chứng) ─────────────────── */}
      <Modal
        visible={showDisputeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDisputeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.gray[100],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowDisputeModal(false)}>
                <X size={24} color={COLORS.gray[700]} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
                Khiếu nại chất lượng & Hoàn tiền
              </Text>
            </View>
            <Badge label="Bảo vệ khách" color="#FEF2F2" textColor={COLORS.error} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <View
              style={{
                backgroundColor: '#FEF2F2',
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#FECACA',
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 14, color: '#991B1B' }}>
                ⚖️ Cơ chế giữ tiền bảo đảm (Escrow Dispute)
              </Text>
              <Text style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 18 }}>
                Khi mở khiếu nại, hệ thống sẽ đóng băng khoản thanh toán và chuyển hồ sơ cho Quản
                trị viên đối chiếu ảnh nghiệm thu của thợ và ảnh hiện trường của bạn để hoàn tiền
                100% hoặc một phần.
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                Mô tả vấn đề chưa đạt chuẩn hoặc sự cố *
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  minHeight: 100,
                  textAlignVertical: 'top',
                  color: COLORS.gray[900],
                }}
                placeholder="VD: Máy lạnh sau khi vệ sinh vẫn chảy nước, thợ thu thêm phí ngoài hợp đồng..."
                value={disputeReason}
                onChangeText={setDisputeReason}
                multiline
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                Đính kèm ảnh bằng chứng ({disputePhotos.length}/4)
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={handleTakeDisputePhoto}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1.5,
                    borderColor: COLORS.error,
                    borderRadius: 12,
                    paddingVertical: 12,
                  }}
                >
                  <Camera size={18} color={COLORS.error} />
                  <Text style={{ fontWeight: '700', color: COLORS.error }}>Chụp ảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handlePickDisputePhoto}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: COLORS.gray[100],
                    borderRadius: 12,
                    paddingVertical: 12,
                  }}
                >
                  <ImagePlus size={18} color={COLORS.gray[700]} />
                  <Text style={{ fontWeight: '700', color: COLORS.gray[800] }}>Chọn từ album</Text>
                </TouchableOpacity>
              </View>
              {disputePhotos.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {disputePhotos.map((uri, idx) => (
                    <View
                      key={`disp-${idx}`}
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 12,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                      <TouchableOpacity
                        onPress={() => setDisputePhotos(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Button
              title="Gửi hồ sơ khiếu nại lên hệ thống"
              variant="danger"
              loading={openDispute.isPending}
              onPress={handleSubmitDispute}
            />
          </ScrollView>
          <Toast />
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Media Fullscreen Preview Modal (Hỗ trợ cả Ảnh & Video) ─────── */}
      <Modal
        visible={Boolean(selectedMediaPreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMediaPreview(null)}
      >
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
              {isVideoUrl(selectedMediaPreview) ? (
                <WebView
                  originWhitelist={['*']}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  style={{ flex: 1, backgroundColor: '#000' }}
                  source={{
                    html: `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><video src="${selectedMediaPreview}" controls autoplay playsinline style="max-width:100%;max-height:100%;" /></body></html>`,
                  }}
                />
              ) : (
                <Image
                  source={{ uri: selectedMediaPreview }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ── Review & Payment Modal ─────────────────────────────────────── */}
      <Modal visible={showReview} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowReview(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}
            >
              Nghiệm thu, Thanh toán & Đánh giá
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
            {/* Phương thức thanh toán */}
            <Card style={{ gap: 10, padding: 16, backgroundColor: COLORS.gray[50] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CreditCard size={18} color={COLORS.primary} />
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Phương thức thanh toán (
                  {new Intl.NumberFormat('vi-VN').format(contract?.total_price ?? 0)}₫)
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {PAYMENT_METHODS.map(pm => {
                  const selected = paymentMethod === pm.id;
                  return (
                    <TouchableOpacity
                      key={pm.id}
                      onPress={() => setPaymentMethod(pm.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: selected ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: selected ? COLORS.primaryDark : COLORS.gray[800],
                        }}
                      >
                        {pm.label}
                      </Text>
                      {selected && <Check size={16} color={COLORS.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

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
              title="Xác nhận nghiệm thu & Thanh toán"
              loading={approveJob.isPending || createReview.isPending || payJob.isPending}
              onPress={handleSubmitReview}
            />
          </ScrollView>
          <Toast />
        </View>
      </Modal>

      {/* ── Cập nhật Vị trí & Thông tin Đơn hàng ───────────────────────── */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: '#fff' }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: Math.max(insets.top + 10, 20),
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.gray[100],
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
              Cập nhật thông tin & vị trí
            </Text>
            <TouchableOpacity
              onPress={() => setShowEditModal(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={22} color={COLORS.gray[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={isLocatingEdit}
              onPress={handleGetLiveLocationForEdit}
              style={{
                borderWidth: 2,
                borderColor: COLORS.primary,
                borderRadius: 14,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: COLORS.primaryLight,
              }}
            >
              {isLocatingEdit ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Navigation size={18} color={COLORS.primary} />
              )}
              <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                {isLocatingEdit
                  ? 'Đang xác định vị trí GPS...'
                  : 'Lấy vị trí GPS hiện tại (Đề xuất số nhà & đường)'}
              </Text>
            </TouchableOpacity>

            <Input
              label="Địa chỉ chi tiết (Số nhà & tên đường) *"
              placeholder="VD: 128 Đường Lê Lợi"
              value={editFullAddress}
              onChangeText={value => {
                setEditFullAddress(value);
                setEditCoords(null);
              }}
              leftIcon={<MapPin size={16} color={COLORS.gray[400]} />}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Phường/Xã"
                  placeholder="Phường 1"
                  value={editWard}
                  onChangeText={value => {
                    setEditWard(value);
                    setEditCoords(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Quận/Huyện *"
                  placeholder="Quận 1"
                  value={editDistrict}
                  onChangeText={value => {
                    setEditDistrict(value);
                    setEditCoords(null);
                  }}
                />
              </View>
            </View>

            <Input
              label="Thành phố"
              value={editCity}
              onChangeText={value => {
                setEditCity(value);
                setEditCoords(null);
              }}
            />
            <Button
              title={editCoords ? 'Kiểm tra điểm hẹn trên bản đồ' : 'Xác nhận điểm hẹn trên bản đồ'}
              onPress={() => setShowEditMap(true)}
            />
            <Text style={{ fontSize: 12, color: COLORS.gray[600] }}>
              {editCoords
                ? 'Đã có tọa độ điểm hẹn.'
                : 'Địa chỉ vừa thay đổi. Hãy chọn lại điểm hẹn để thợ đi đúng nơi.'}
            </Text>
            <LocationPicker
              visible={showEditMap}
              title="Chọn đúng điểm hẹn theo địa chỉ"
              initial={editCoords ? { latitude: editCoords[1], longitude: editCoords[0] } : null}
              onClose={() => setShowEditMap(false)}
              onConfirm={coords => {
                setEditCoords([coords.longitude, coords.latitude]);
                setShowEditMap(false);
              }}
            />

            <Input
              label="Ghi chú địa chỉ (Chung cư, số phòng, chỉ dẫn...)"
              placeholder="VD: Chung cư Sunrise, Tầng 8 Phòng 802"
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <Input label="Tiêu đề yêu cầu" value={editTitle} onChangeText={setEditTitle} />

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[700] }}>
                Mô tả chi tiết công việc
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 14,
                  minHeight: 100,
                  textAlignVertical: 'top',
                  color: COLORS.gray[900],
                }}
                placeholder="Mô tả cụ thể khối lượng công việc, yêu cầu lưu ý..."
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            <Button
              title="Lưu thay đổi vị trí & thông tin"
              loading={updateJob.isPending}
              onPress={handleSaveEdit}
              style={{ marginTop: 10 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
