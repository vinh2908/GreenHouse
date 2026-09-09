import { useState } from 'react';
import {
  View, Text, ScrollView, SafeAreaView, TouchableOpacity, Alert,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Navigation, Check, Camera, MessageCircle, X } from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useJobSocketUpdates } from '@/hooks/use-socket';

dayjs.extend(relativeTime);
dayjs.locale('vi');
import {
  useJobDetail, useJobQuotes, useSubmitQuote, useHelperOnTheWay,
  useHelperArrived, useStartJob, useCompleteJob,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import {
  Button, Card, JobStatusBadge, COLORS, LoadingSpinner,
  Separator, PriceText, Badge,
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

  const submitQuote = useSubmitQuote();
  const onTheWay = useHelperOnTheWay();
  const arrived = useHelperArrived();
  const startJob = useStartJob();
  const completeJob = useCompleteJob();

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [laborCost, setLaborCost] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('3');
  const [notes, setNotes] = useState('');

  if (isLoading) return <LoadingSpinner />;
  if (!job) return null;

  // Kiểm tra xem thợ hiện tại đã gửi báo giá chưa
  const myQuote = quotes?.find((q: any) => {
    const helperId = typeof q.helper_id === 'string' ? q.helper_id : q.helper_id?._id;
    return helperId === currentUser?._id;
  });

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
      Toast.show({ type: 'success', text1: 'Gửi báo giá thành công!', text2: 'Chờ khách hàng duyệt và chọn bạn' });
      setShowQuoteModal(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gửi báo giá thất bại. Vui lòng thử lại.';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleAction = (action: string) => {
    const labels: Record<string, string> = {
      on_the_way: 'Xác nhận bạn đang di chuyển đến địa chỉ khách hàng?',
      arrived: 'Xác nhận bạn đã có mặt tại địa điểm?',
      start: 'Bắt đầu bấm giờ làm việc?',
      complete: 'Xác nhận đã hoàn thành công việc?',
    };
    Alert.alert(labels[action] ?? 'Xác nhận?', undefined, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận',
        onPress: async () => {
          if (action === 'on_the_way') await onTheWay.mutateAsync(id!);
          else if (action === 'arrived') await arrived.mutateAsync(id!);
          else if (action === 'start') await startJob.mutateAsync(id!);
          else if (action === 'complete') await completeJob.mutateAsync({ jobId: id! });
        },
      },
    ]);
  };

  const isMyActiveJob = job.helper_id &&
    (typeof job.helper_id === 'string' ? job.helper_id : job.helper_id._id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
      }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900], flex: 1, marginLeft: 12 }} numberOfLines={1}>
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
              <Badge label={job.preferred_time_start} color={COLORS.gray[100]} textColor={COLORS.gray[700]} />
            )}
          </View>
          <Text style={{ fontSize: 15, color: COLORS.gray[900], lineHeight: 22, fontWeight: '500' }}>
            {job.description}
          </Text>
          <Separator my={4} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ fontSize: 16 }}>📍</Text>
            <Text style={{ flex: 1, fontSize: 14, color: COLORS.gray[700], lineHeight: 20, fontWeight: '600' }}>
              {job.address?.full_address}{job.address?.district ? `, ${job.address.district}` : ''}
            </Text>
          </View>
        </Card>

        {/* ── Customer info ─────────────────────────────────────────── */}
        {isMyActiveJob && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>K</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                {typeof job.customer_id === 'object' && job.customer_id ? (job.customer_id as { full_name: string }).full_name : 'Khách hàng'}
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
              <Card style={{ backgroundColor: COLORS.successLight, borderColor: '#A7F3D0', borderWidth: 1.5, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>✅</Text>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.success }}>
                    Bạn đã gửi báo giá cho đơn này
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>Giá công đã báo:</Text>
                  <PriceText amount={myQuote.total_price} size={16} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>Thực nhận về ví (trừ 15%):</Text>
                  <PriceText amount={myQuote.helper_receives} size={15} color={COLORS.success} />
                </View>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2, fontStyle: 'italic' }}>
                  Đang chờ khách hàng xem xét và lựa chọn bạn.
                </Text>
              </Card>
            ) : (
              <Button
                title="Gửi báo giá cho khách"
                onPress={() => setShowQuoteModal(true)}
                icon={<Text style={{ color: '#fff', fontSize: 18 }}>💰</Text>}
              />
            )}
          </View>
        )}

      </ScrollView>

      {/* ── Quote Modal ───────────────────────────────────────────────── */}
      <Modal visible={showQuoteModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowQuoteModal(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}>
              Gửi báo giá dịch vụ
            </Text>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>Giá công thợ (₫) *</Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 22, fontWeight: '800', color: COLORS.gray[900],
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
                    <Text style={{ color: COLORS.gray[700], fontWeight: '600' }}>Giá khách hàng trả</Text>
                    <PriceText amount={total} size={14} color={COLORS.gray[900]} bold={false} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: COLORS.gray[500], fontWeight: '500' }}>Phí nền tảng (15%)</Text>
                    <PriceText amount={platformFee} size={14} color={COLORS.gray[500]} bold={false} />
                  </View>
                  <Separator my={4} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800', color: COLORS.gray[900] }}>Thực nhận về ví</Text>
                    <PriceText amount={helperReceives} size={17} />
                  </View>
                </Card>
              )}

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>Thời gian ước tính (giờ)</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[1, 2, 3, 4, 5, 6, 8].map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setEstimatedDuration(String(h))}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                        borderWidth: 2,
                        borderColor: estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: estimatedDuration === String(h) ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text style={{ fontWeight: '800', color: estimatedDuration === String(h) ? COLORS.primary : COLORS.gray[700] }}>
                        {h}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>Ghi chú gửi khách (tuỳ chọn)</Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top',
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
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
