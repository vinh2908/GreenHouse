import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Navigation,
  Check,
  Camera,
  MessageCircle,
  X,
  Video,
  ImagePlus,
  Trash2,
  Sparkles,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useJobSocketUpdates } from '@/hooks/use-socket';

dayjs.extend(relativeTime);
dayjs.locale('vi');
import {
  useJobDetail,
  useJobQuotes,
  useSubmitQuote,
  useHelperOnTheWay,
  useHelperArrived,
  useStartJob,
  useCompleteJob,
  useHelperProfile,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import {
  Button,
  Card,
  JobStatusBadge,
  COLORS,
  LoadingSpinner,
  Separator,
  PriceText,
  Badge,
} from '@/components/ui';
import Toast from 'react-native-toast-message';

const PLATFORM_FEE = 0.15;

export default function HelperJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const currentUser = useAuthStore(s => s.user);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace('/(helper)/jobs');
  };

  // ── Realtime Socket Updates ──────────────────────────────────────────────
  useJobSocketUpdates(id);

  const { data: job, isLoading } = useJobDetail(id);
  const { data: quotes } = useJobQuotes(id);
  const { data: helperProfile } = useHelperProfile();

  const submitQuote = useSubmitQuote();
  const onTheWay = useHelperOnTheWay();
  const arrived = useHelperArrived();
  const startJob = useStartJob();
  const completeJob = useCompleteJob();

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [laborCost, setLaborCost] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('3');
  const [notes, setNotes] = useState('');

  // ── Completion Evidence States ───────────────────────────────────────────
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [completionVideos, setCompletionVideos] = useState<string[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');

  const insets = useSafeAreaInsets();

  if (isLoading) return <LoadingSpinner />;
  if (!job) return null;

  // Kiểm tra xem thợ hiện tại đã gửi báo giá chưa
  const myQuote = quotes?.find((q: any) => {
    const helperId = typeof q.helper_id === 'string' ? q.helper_id : q.helper_id?._id;
    return helperId === currentUser?._id;
  });

  const handleOpenQuoteModal = () => {
    if (helperProfile?.verification_status !== 'approved') {
      Alert.alert(
        'Yêu cầu xác thực e-KYC',
        'Bạn cần hoàn tất và được duyệt xác thực danh tính e-KYC trước khi có thể gửi báo giá và nhận việc.',
        [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Xác thực ngay', onPress: () => router.push('/kyc') },
        ],
      );
      return;
    }
    setShowQuoteModal(true);
  };
  const total = Number(laborCost) || 0;
  const platformFee = Math.round(total * PLATFORM_FEE);
  const helperReceives = total - platformFee;

  const handleSubmitQuote = async () => {
    if (!laborCost || Number(laborCost) < 50000) {
      Toast.show({ type: 'error', text1: 'Báo giá tối thiểu 50,000₫' });
      return;
    }
    try {
      await submitQuote.mutateAsync({
        jobId: id!,
        labor_cost: Number(laborCost),
        estimated_duration: Number(estimatedDuration),
        notes: notes || undefined,
      });
      Toast.show({
        type: 'success',
        text1: 'Gửi báo giá thành công!',
        text2: 'Chờ khách hàng duyệt và chọn bạn',
      });
      setShowQuoteModal(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gửi báo giá thất bại. Vui lòng thử lại.';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // ── Media Picker Actions ──────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập camera để chụp ảnh' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCompletionPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh' });
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện để chọn ảnh' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(a => a.uri);
        setCompletionPhotos(prev => [...prev, ...newUris]);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể chọn ảnh từ thư viện' });
    }
  };

  const handleRecordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập camera để quay video' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 60,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCompletionVideos(prev => [...prev, result.assets[0].uri]);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể quay video' });
    }
  };

  const handlePickVideo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện để chọn video' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
        selectionLimit: 2,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(a => a.uri);
        setCompletionVideos(prev => [...prev, ...newUris]);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể chọn video từ thư viện' });
    }
  };

  const handleCompleteSubmission = async () => {
    if (completionPhotos.length === 0 && completionVideos.length === 0) {
      Alert.alert(
        'Chưa có bằng chứng nghiệm thu',
        'Khách hàng cần xem ảnh/video kết quả công việc để kiểm tra và nghiệm thu nhanh chóng. Bạn có chắc muốn tiếp tục không?',
        [
          { text: 'Chụp/Quay ngay', style: 'cancel' },
          {
            text: 'Tiếp tục gửi',
            onPress: async () => {
              try {
                await completeJob.mutateAsync({
                  jobId: id!,
                  completion_photos: completionPhotos,
                  completion_videos: completionVideos,
                  completion_notes: completionNotes || undefined,
                });
                setShowCompleteModal(false);
              } catch (err: any) {
                const msg = err?.response?.data?.message || 'Cập nhật thất bại';
                Toast.show({ type: 'error', text1: msg });
              }
            },
          },
        ],
      );
      return;
    }

    try {
      await completeJob.mutateAsync({
        jobId: id!,
        completion_photos: completionPhotos,
        completion_videos: completionVideos,
        completion_notes: completionNotes || undefined,
      });
      setShowCompleteModal(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleAction = (action: string) => {
    if (action === 'complete') {
      setShowCompleteModal(true);
      return;
    }

    const labels: Record<string, string> = {
      on_the_way: 'Xác nhận bạn đang di chuyển đến địa chỉ khách hàng?',
      arrived: 'Xác nhận bạn đã có mặt tại địa điểm?',
      start: 'Bắt đầu bấm giờ làm việc?',
    };
    Alert.alert(labels[action] ?? 'Xác nhận?', undefined, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận',
        onPress: async () => {
          try {
            if (action === 'on_the_way') await onTheWay.mutateAsync(id!);
            else if (action === 'arrived') await arrived.mutateAsync(id!);
            else if (action === 'start') await startJob.mutateAsync(id!);
          } catch (err: any) {
            const msg = err?.response?.data?.message || 'Cập nhật tiến trình thất bại';
            Toast.show({ type: 'error', text1: msg });
          }
        },
      },
    ]);
  };

  const isMyActiveJob =
    job.helper_id && (typeof job.helper_id === 'string' ? job.helper_id : job.helper_id._id);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
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
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: COLORS.gray[900],
            flex: 1,
            marginLeft: 12,
          }}
          numberOfLines={1}
        >
          {job.title}
        </Text>
        <JobStatusBadge status={job.status} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        {/* ── Job info ─────────────────────────────────────────────── */}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Badge label={(job.service_id as { name: string } | null)?.name ?? 'Dịch vụ'} />
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
            <Text style={{ fontSize: 16 }}>📍</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.gray[700],
                  lineHeight: 20,
                  fontWeight: '600',
                }}
              >
                {job.address?.full_address}
                {job.address?.district ? `, ${job.address.district}` : ''}
              </Text>
              {job.distance_km != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Navigation size={14} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '700' }}>
                    Cách bạn {job.distance_km} km ~ {job.estimated_minutes ?? '?'} phút di chuyển
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        {/* ── Customer info ─────────────────────────────────────────── */}
        {isMyActiveJob && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: COLORS.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>K</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                {typeof job.customer_id === 'object' && job.customer_id
                  ? (job.customer_id as { full_name: string }).full_name
                  : 'Khách hàng'}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>Chủ đơn đặt dịch vụ</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: id } })}
              style={{ backgroundColor: COLORS.primaryLight, borderRadius: 12, padding: 10 }}
            >
              <MessageCircle size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </Card>
        )}

        {/* ── Execution steps (active job) ──────────────────────────── */}
        {isMyActiveJob && (
          <Card style={{ gap: 16 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              Cập nhật tiến trình làm việc
            </Text>

            {job.status === 'confirmed' && (
              <Button
                title="🚗  Bắt đầu di chuyển đến khách"
                loading={onTheWay.isPending}
                onPress={() => handleAction('on_the_way')}
              />
            )}
            {job.status === 'helper_on_the_way' && (
              <Button
                title="📍  Tôi đã đến nơi"
                loading={arrived.isPending}
                onPress={() => handleAction('arrived')}
              />
            )}
            {job.status === 'helper_arrived' && (
              <Button
                title="▶️  Bắt đầu làm việc"
                loading={startJob.isPending}
                onPress={() => handleAction('start')}
              />
            )}
            {job.status === 'in_progress' && (
              <Button
                title="✅  Hoàn thành công việc"
                loading={completeJob.isPending}
                onPress={() => handleAction('complete')}
              />
            )}
            {job.status === 'pending_review' && (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                <Text style={{ fontSize: 36 }}>⏳</Text>
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[800] }}>
                  Đang chờ khách hàng nghiệm thu
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray[500], textAlign: 'center' }}>
                  Khách hàng sẽ xác nhận và tiền công sẽ tự động cộng vào ví của bạn.
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* ── Quote status / Action ────────────────────────────────── */}
        {['open', 'receiving_quotes'].includes(job.status) && !isMyActiveJob && (
          <View>
            {myQuote ? (
              <Card
                style={{
                  backgroundColor: COLORS.successLight,
                  borderColor: '#A7F3D0',
                  borderWidth: 1.5,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>✅</Text>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.success }}>
                    Bạn đã gửi báo giá cho đơn này
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>Giá công đã báo:</Text>
                  <PriceText amount={myQuote.total_price} size={16} />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                    Thực nhận về ví (trừ 15%):
                  </Text>
                  <PriceText amount={myQuote.helper_receives} size={15} color={COLORS.success} />
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: COLORS.gray[500],
                    marginTop: 2,
                    fontStyle: 'italic',
                  }}
                >
                  Đang chờ khách hàng xem xét và lựa chọn bạn.
                </Text>
              </Card>
            ) : (
              <Button
                title="Gửi báo giá cho khách"
                onPress={handleOpenQuoteModal}
                icon={<Text style={{ color: '#fff', fontSize: 18 }}>💰</Text>}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Quote Modal ───────────────────────────────────────────────── */}
      <Modal visible={showQuoteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowQuoteModal(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}
            >
              Gửi báo giá dịch vụ
            </Text>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Giá công thợ (₫) *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 22,
                    fontWeight: '800',
                    color: COLORS.gray[900],
                  }}
                  placeholder="VD: 300000"
                  value={laborCost}
                  onChangeText={setLaborCost}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {total > 0 && (
                <Card style={{ backgroundColor: COLORS.primaryLight, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: COLORS.gray[700], fontWeight: '600' }}>
                      Giá khách hàng trả
                    </Text>
                    <PriceText amount={total} size={14} color={COLORS.gray[900]} bold={false} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: COLORS.gray[500], fontWeight: '500' }}>
                      Phí nền tảng (15%)
                    </Text>
                    <PriceText
                      amount={platformFee}
                      size={14}
                      color={COLORS.gray[500]}
                      bold={false}
                    />
                  </View>
                  <Separator my={4} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800', color: COLORS.gray[900] }}>
                      Thực nhận về ví
                    </Text>
                    <PriceText amount={helperReceives} size={17} />
                  </View>
                </Card>
              )}

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Thời gian ước tính (giờ)
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[1, 2, 3, 4, 5, 6, 8].map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setEstimatedDuration(String(h))}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor:
                          estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[200],
                        backgroundColor:
                          estimatedDuration === String(h) ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          color:
                            estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {h}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Ghi chú gửi khách (tuỳ chọn)
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    minHeight: 80,
                    textAlignVertical: 'top',
                    color: COLORS.gray[900],
                  }}
                  placeholder="VD: Tôi có đầy đủ đồ nghề chuyên dụng, có thể đến ngay..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title="Xác nhận gửi báo giá"
                loading={submitQuote.isPending}
                onPress={handleSubmitQuote}
              />
            </ScrollView>
          </KeyboardAvoidingView>
          <Toast />
        </View>
      </Modal>

      {/* ── Complete Evidence Modal (Chụp ảnh / Quay video hoàn thành) ── */}
      <Modal visible={showCompleteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
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
              <TouchableOpacity onPress={() => setShowCompleteModal(false)}>
                <X size={24} color={COLORS.gray[700]} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
                Bằng chứng hoàn thành
              </Text>
            </View>
            <Badge label="Nghiệm thu" color={COLORS.primaryLight} textColor={COLORS.primary} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }}>
              <View
                style={{
                  backgroundColor: COLORS.primaryLight,
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#FFD9C5',
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color={COLORS.primary} />
                  <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.primaryDark }}>
                    Gửi kết quả để khách nghiệm thu
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[700], lineHeight: 18 }}>
                  Chụp 1-4 hình ảnh hoặc quay video ngắn thể hiện kết quả sạch sẽ, đã sửa chữa xong
                  để khách hàng kiểm tra và bấm hoàn thành nhanh chóng.
                </Text>
              </View>

              {/* ── 1. Photos Section ─────────────────────────────────── */}
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[800] }}>
                    📸 Ảnh kết quả ({completionPhotos.length})
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>Tối đa 6 ảnh</Text>
                </View>

                {/* Photo Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleTakePhoto}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#FFF4ED',
                      borderWidth: 1.5,
                      borderColor: COLORS.primary,
                      borderRadius: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Camera size={18} color={COLORS.primary} />
                    <Text style={{ fontWeight: '700', fontSize: 13.5, color: COLORS.primary }}>
                      Chụp ảnh ngay
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickPhoto}
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
                    <Text style={{ fontWeight: '700', fontSize: 13.5, color: COLORS.gray[800] }}>
                      Chọn từ album
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Photos Grid */}
                {completionPhotos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {completionPhotos.map((uri, index) => (
                      <View
                        key={`photo-${index}`}
                        style={{
                          width: '30%',
                          aspectRatio: 1,
                          borderRadius: 12,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 1,
                          borderColor: COLORS.gray[200],
                        }}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() =>
                            setCompletionPhotos(prev => prev.filter((_, i) => i !== index))
                          }
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── 2. Videos Section ─────────────────────────────────── */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[800] }}>
                    🎥 Video nghiệm thu ({completionVideos.length})
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>1-2 video ngắn</Text>
                </View>

                {/* Video Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleRecordVideo}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#EEF4FE',
                      borderWidth: 1.5,
                      borderColor: COLORS.secondary,
                      borderRadius: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Video size={18} color={COLORS.secondary} />
                    <Text style={{ fontWeight: '700', fontSize: 13.5, color: COLORS.secondary }}>
                      Quay video
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickVideo}
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
                    <Video size={18} color={COLORS.gray[700]} />
                    <Text style={{ fontWeight: '700', fontSize: 13.5, color: COLORS.gray[800] }}>
                      Chọn video
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Videos List Preview */}
                {completionVideos.length > 0 && (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {completionVideos.map((uri, index) => (
                      <View
                        key={`video-${index}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: COLORS.gray[50],
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: COLORS.gray[200],
                        }}
                      >
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              backgroundColor: '#EEF4FE',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Video size={18} color={COLORS.secondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}
                              numberOfLines={1}
                            >
                              Video nghiệm thu #{index + 1}
                            </Text>
                            <Text style={{ fontSize: 11, color: COLORS.gray[500] }}>
                              Đã sẵn sàng gửi cho khách
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            setCompletionVideos(prev => prev.filter((_, i) => i !== index))
                          }
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: '#FEE2E2',
                          }}
                        >
                          <Trash2 size={16} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── 3. Notes Section ──────────────────────────────────── */}
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700], fontSize: 13.5 }}>
                  Ghi chú bàn giao cho khách (tuỳ chọn)
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 14,
                    minHeight: 80,
                    textAlignVertical: 'top',
                    color: COLORS.gray[900],
                  }}
                  placeholder="VD: Đã dọn dẹp sạch sẽ toàn bộ khu bếp, kiểm tra khóa và van nước an toàn..."
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title="Gửi kết quả & Báo hoàn thành"
                loading={completeJob.isPending}
                onPress={handleCompleteSubmission}
                style={{ marginTop: 10 }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
          <Toast />
        </View>
      </Modal>
    </View>
  );
}
