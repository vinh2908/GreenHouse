import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ImagePlus, ShieldCheck } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { useClaimForJob, useCreateClaim, type InsuranceClaimStatus } from '@/hooks/use-api';
import { Badge, Button, Card, COLORS, LoadingSpinner } from '@/components/ui';

dayjs.locale('vi');

const fmt = (n?: number) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

const STATUS_META: Record<
  InsuranceClaimStatus,
  { label: string; bg: string; color: string; desc: string }
> = {
  submitted: {
    label: 'Đã gửi — chờ xem xét',
    bg: COLORS.warningLight,
    color: COLORS.warning,
    desc: 'Yêu cầu của bạn đã được ghi nhận. Đội ngũ Green House sẽ xem xét hồ sơ và phản hồi sớm nhất.',
  },
  under_review: {
    label: 'Đang xem xét',
    bg: '#EFF6FF',
    color: '#2563EB',
    desc: 'Admin đang xem xét hồ sơ bồi thường của bạn.',
  },
  approved: {
    label: 'Đã duyệt — đang chi trả',
    bg: COLORS.successLight,
    color: COLORS.success,
    desc: 'Yêu cầu đã được duyệt, tiền bồi thường đang được chuyển vào ví của bạn.',
  },
  paid: {
    label: 'Đã chi trả vào ví',
    bg: COLORS.successLight,
    color: COLORS.success,
    desc: 'Tiền bồi thường đã được cộng vào ví Green House của bạn.',
  },
  rejected: {
    label: 'Bị từ chối',
    bg: COLORS.errorLight,
    color: COLORS.error,
    desc: 'Yêu cầu bồi thường không được duyệt.',
  },
};

const TIMELINE_LABEL: Record<InsuranceClaimStatus, string> = {
  submitted: '📨 Đã gửi yêu cầu',
  under_review: '🔎 Bắt đầu xem xét',
  approved: '✅ Duyệt bồi thường',
  paid: '💰 Đã chi trả vào ví',
  rejected: '❌ Từ chối bồi thường',
};

export default function ClaimScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: claim, isLoading } = useClaimForJob(jobId);
  const createClaim = useCreateClaim();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/jobs');
  };

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Cần quyền truy cập thư viện ảnh' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 6));
    }
  };

  const handleSubmit = async () => {
    if (!jobId) return;
    if (description.trim().length < 10) {
      Toast.show({ type: 'error', text1: 'Vui lòng mô tả rõ sự cố/thiệt hại (ít nhất 10 ký tự)' });
      return;
    }
    const amountNum = amount.trim() ? Number(amount.replace(/[^\d]/g, '')) : undefined;
    try {
      await createClaim.mutateAsync({
        job_id: jobId,
        description: description.trim(),
        photos: photos.length > 0 ? photos : undefined,
        requested_amount: amountNum && amountNum > 0 ? amountNum : undefined,
      });
      setSubmitted(true);
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  } as const;

  const meta = claim ? STATUS_META[claim.status] : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
            Bồi thường bảo hiểm 🛡
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Bảo hiểm 30 ngày cho mọi đơn đã hoàn thành
          </Text>
        </View>
        <ShieldCheck size={22} color={COLORS.gray[400]} />
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        >
          {claim ? (
            <>
              {/* ── Trạng thái yêu cầu ── */}
              <Card style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text
                    style={{ flex: 1, fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}
                  >
                    Trạng thái yêu cầu
                  </Text>
                  {meta && <Badge label={meta.label} color={meta.bg} textColor={meta.color} />}
                </View>
                <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 19 }}>
                  {meta?.desc}
                </Text>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                  {claim.description}
                </Text>
                {claim.requested_amount ? (
                  <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                    Số tiền đề nghị: {fmt(claim.requested_amount)}₫
                  </Text>
                ) : null}
                {claim.status === 'paid' && (
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: COLORS.success }}>
                    Đã bồi thường: {fmt(claim.approved_amount)}₫ vào ví của bạn
                  </Text>
                )}
                {claim.status === 'rejected' && claim.reject_reason && (
                  <View
                    style={{
                      backgroundColor: COLORS.errorLight,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.error, lineHeight: 19 }}>
                      Lý do từ chối: {claim.reject_reason}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                  Gửi lúc {dayjs(claim.created_at).format('HH:mm DD/MM/YYYY')}
                </Text>
              </Card>

              {/* ── Ảnh bằng chứng ── */}
              {claim.photos.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                    Ảnh bằng chứng
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {claim.photos.map((uri, i) => (
                      <Image
                        key={i}
                        source={{ uri }}
                        style={{ width: 96, height: 96, borderRadius: 10 }}
                      />
                    ))}
                  </View>
                </Card>
              )}

              {/* ── Timeline ── */}
              <Card style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Diễn biến xử lý
                </Text>
                {(claim.timeline ?? []).map((entry, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: COLORS.primary,
                          marginTop: 4,
                        }}
                      />
                      {i < (claim.timeline?.length ?? 0) - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: COLORS.gray[200] }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 10 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: COLORS.gray[900] }}>
                        {TIMELINE_LABEL[entry.status] ?? entry.status}
                      </Text>
                      {entry.note ? (
                        <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 18 }}>
                          {entry.note}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 11.5, color: COLORS.gray[400] }}>
                        {entry.actor_role === 'admin' ? 'Admin' : 'Bạn'} ·{' '}
                        {dayjs(entry.at).format('HH:mm DD/MM/YYYY')}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : submitted ? (
            <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: COLORS.gray[900],
                  textAlign: 'center',
                }}
              >
                Đã gửi yêu cầu bồi thường
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.gray[600],
                  textAlign: 'center',
                  lineHeight: 19,
                }}
              >
                Yêu cầu của bạn đang chờ Admin xem xét. Kết quả sẽ được thông báo trong app — nếu
                được duyệt, tiền bồi thường sẽ cộng thẳng vào ví của bạn.
              </Text>
              <Button title="Quay lại chi tiết đơn" onPress={handleBack} />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 6 }}>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  Nếu dịch vụ đã hoàn thành gây thiệt hại (hư hỏng đồ đạc, làm lại không đạt…), hãy
                  gửi yêu cầu bồi thường kèm ảnh bằng chứng. Yêu cầu phải gửi trong thời hạn bảo
                  hiểm của đơn (mặc định 30 ngày sau khi hoàn thành).
                </Text>
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Mô tả sự cố / thiệt hại *
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="VD: Sau khi vệ sinh máy lạnh, tường bị thấm nước làm hỏng lớp sơn khoảng 2m²…"
                  multiline
                  numberOfLines={5}
                  style={{ ...inputStyle, minHeight: 110, textAlignVertical: 'top' }}
                />
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Số tiền đề nghị bồi thường (không bắt buộc)
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="VD: 500000"
                  keyboardType="numeric"
                  style={inputStyle}
                />
                <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Ảnh bằng chứng
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {photos.map((uri, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <Image source={{ uri }} style={{ width: 84, height: 84, borderRadius: 10 }} />
                    </TouchableOpacity>
                  ))}
                  {photos.length < 6 && (
                    <TouchableOpacity
                      onPress={pickPhotos}
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: COLORS.gray[300],
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        backgroundColor: '#fff',
                      }}
                    >
                      <ImagePlus size={20} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: 11, color: COLORS.gray[500] }}>Thêm ảnh</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Button
                  title="Gửi yêu cầu bồi thường"
                  loading={createClaim.isPending}
                  onPress={handleSubmit}
                />
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
