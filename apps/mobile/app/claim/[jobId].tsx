import { useState } from 'react';
import { formatDateTime } from '@/utils/date-format';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ImagePlus, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';
import Toast from 'react-native-toast-message';
import { useTranslation } from '@/hooks/use-i18n';
import { useClaimForJob, useCreateClaim, type InsuranceClaimStatus } from '@/hooks/use-api';
import { Badge, Button, Card, COLORS, LoadingSpinner, useThemeColors } from '@/components/ui';

const fmt = (n?: number) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

const STATUS_META: Record<
  InsuranceClaimStatus,
  { label: string; label_en: string; bg: string; color: string; desc: string; desc_en: string }
> = {
  submitted: {
    label: 'Đã gửi — chờ xem xét',
    label_en: 'Submitted — pending review',
    bg: COLORS.warningLight,
    color: COLORS.warning,
    desc: 'Yêu cầu của bạn đã được ghi nhận. Đội ngũ Green House sẽ xem xét hồ sơ và phản hồi sớm nhất.',
    desc_en:
      'Your claim has been submitted. The Green House team will review your case and respond soon.',
  },
  under_review: {
    label: 'Đang xem xét',
    label_en: 'Under review',
    bg: '#EFF6FF',
    color: '#2563EB',
    desc: 'Admin đang xem xét hồ sơ bồi thường của bạn.',
    desc_en: 'Admin is currently reviewing your insurance claim.',
  },
  approved: {
    label: 'Đã duyệt — đang chi trả',
    label_en: 'Approved — payout pending',
    bg: COLORS.successLight,
    color: COLORS.success,
    desc: 'Yêu cầu đã được duyệt, tiền bồi thường đang được chuyển vào ví của bạn.',
    desc_en: 'Claim approved, payout is being transferred to your wallet.',
  },
  paid: {
    label: 'Đã chi trả vào ví',
    label_en: 'Paid to wallet',
    bg: COLORS.successLight,
    color: COLORS.success,
    desc: 'Tiền bồi thường đã được cộng vào ví Green House của bạn.',
    desc_en: 'Insurance claim payout has been credited to your Green House wallet.',
  },
  rejected: {
    label: 'Bị từ chối',
    label_en: 'Rejected',
    bg: COLORS.errorLight,
    color: COLORS.error,
    desc: 'Yêu cầu bồi thường không được duyệt.',
    desc_en: 'Insurance claim was not approved.',
  },
};

const TIMELINE_LABEL: Record<InsuranceClaimStatus, { vi: string; en: string }> = {
  submitted: { vi: 'Đã gửi yêu cầu', en: 'Claim submitted' },
  under_review: { vi: 'Bắt đầu xem xét', en: 'Review started' },
  approved: { vi: 'Duyệt bồi thường', en: 'Claim approved' },
  paid: { vi: 'Đã chi trả vào ví', en: 'Paid to wallet' },
  rejected: { vi: 'Từ chối bồi thường', en: 'Claim rejected' },
};

export default function ClaimScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  dayjs.locale(lang === 'vi' ? 'vi' : 'en');

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
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Photo library permission required' : 'Cần quyền truy cập thư viện ảnh',
      });
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
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please describe the incident/damage clearly (at least 10 characters)'
            : 'Vui lòng mô tả rõ sự cố/thiệt hại (ít nhất 10 ký tự)',
      });
      return;
    }
    const amountNum = amount.trim() ? Number(amount.replace(/[^\d]/g, '')) : undefined;
    if (!amountNum || amountNum <= 0) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please enter the requested claim amount'
            : 'Vui lòng nhập số tiền đề nghị bồi thường hợp lệ',
      });
      return;
    }
    if (photos.length === 0) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please attach at least 1 evidence photo'
            : 'Vui lòng đính kèm ít nhất 1 ảnh bằng chứng thiệt hại',
      });
      return;
    }
    try {
      await createClaim.mutateAsync({
        job_id: jobId,
        description: description.trim(),
        photos,
        requested_amount: amountNum,
      });
      setSubmitted(true);
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: tc.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fs(14),
    backgroundColor: tc.surface,
  } as const;

  const meta = claim ? STATUS_META[claim.status] : null;

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Insurance Claim' : 'Bồi thường bảo hiểm'}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en'
              ? '30-day insurance warranty for all completed jobs'
              : 'Bảo hiểm 30 ngày cho mọi đơn đã hoàn thành'}
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
                    style={{
                      flex: 1,
                      fontWeight: '800',
                      fontSize: fs(15),
                      color: tc.text,
                    }}
                  >
                    {lang === 'en' ? 'Claim Status' : 'Trạng thái yêu cầu'}
                  </Text>
                  {meta && (
                    <Badge
                      label={lang === 'en' ? meta.label_en : meta.label}
                      color={meta.bg}
                      textColor={meta.color}
                    />
                  )}
                </View>
                <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                  {lang === 'en' ? meta?.desc_en : meta?.desc}
                </Text>
                <Text style={{ fontSize: fs(13.5), color: tc.text, lineHeight: 20 }}>
                  {claim.description}
                </Text>
                {claim.requested_amount ? (
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                    {lang === 'en' ? 'Requested amount: ' : 'Số tiền đề nghị: '}
                    {fmt(claim.requested_amount)}₫
                  </Text>
                ) : null}
                {claim.status === 'paid' && (
                  <Text style={{ fontSize: fs(13.5), fontWeight: '700', color: COLORS.success }}>
                    {lang === 'en'
                      ? `Compensated: ${fmt(claim.approved_amount)}₫ to your wallet`
                      : `Đã bồi thường: ${fmt(claim.approved_amount)}₫ vào ví của bạn`}
                  </Text>
                )}
                {claim.status === 'rejected' && claim.reject_reason && (
                  <View
                    style={{
                      backgroundColor: COLORS.errorLight,
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <Text style={{ fontSize: fs(13), color: COLORS.error, lineHeight: 19 }}>
                      {lang === 'en' ? 'Rejection reason: ' : 'Lý do từ chối: '}
                      {claim.reject_reason}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                  {lang === 'en' ? 'Submitted at ' : 'Gửi lúc '}
                  {formatDateTime(dayjs(claim.created_at))}
                </Text>
              </Card>

              {/* ── Ảnh bằng chứng ── */}
              {claim.photos.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                    {lang === 'en' ? 'Evidence Photos' : 'Ảnh bằng chứng'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {claim.photos.map((uri, i) => (
                      <Image
                        key={i}
                        source={{ uri }}
                        style={{ width: 96, height: 96, borderRadius: 8 }}
                      />
                    ))}
                  </View>
                </Card>
              )}

              {/* ── Timeline ── */}
              <Card style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en' ? 'Processing Timeline' : 'Diễn biến xử lý'}
                </Text>
                {(claim.timeline ?? []).map((entry, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 8,
                          backgroundColor: COLORS.primary,
                          marginTop: 4,
                        }}
                      />
                      {i < (claim.timeline?.length ?? 0) - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: tc.border }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 10 }}>
                      <Text style={{ fontSize: fs(13.5), fontWeight: '700', color: tc.text }}>
                        {lang === 'en'
                          ? (TIMELINE_LABEL[entry.status]?.en ?? entry.status)
                          : (TIMELINE_LABEL[entry.status]?.vi ?? entry.status)}
                      </Text>
                      {entry.note ? (
                        <Text
                          style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 18 }}
                        >
                          {entry.note}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: fs(11.5), color: tc.textMuted }}>
                        {entry.actor_role === 'admin' ? 'Admin' : lang === 'en' ? 'You' : 'Bạn'} ·{' '}
                        {formatDateTime(dayjs(entry.at))}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : submitted ? (
            <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
              <CheckCircle2 size={44} color="#10B981" />
              <Text
                style={{
                  fontSize: fs(16),
                  fontWeight: '800',
                  color: tc.text,
                  textAlign: 'center',
                }}
              >
                {lang === 'en' ? 'Insurance Claim Submitted' : 'Đã gửi yêu cầu bồi thường'}
              </Text>
              <Text
                style={{
                  fontSize: fs(13),
                  color: tc.textSecondary,
                  textAlign: 'center',
                  lineHeight: 19,
                }}
              >
                {lang === 'en'
                  ? 'Your claim is pending Admin review. The result will be notified in-app — once approved, payout will be credited directly to your wallet.'
                  : 'Yêu cầu của bạn đang chờ Admin xem xét. Kết quả sẽ được thông báo trong app — nếu được duyệt, tiền bồi thường sẽ cộng thẳng vào ví của bạn.'}
              </Text>
              <Button
                title={lang === 'en' ? 'Back to Job Details' : 'Quay lại chi tiết đơn'}
                onPress={handleBack}
              />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 6 }}>
                <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, lineHeight: 20 }}>
                  {lang === 'en'
                    ? 'If the completed service caused damages (property damage, sub-standard rework...), please submit a claim with photo evidence. Claims must be submitted within the job insurance warranty period (default 30 days after completion).'
                    : 'Nếu dịch vụ đã hoàn thành gây thiệt hại (hư hỏng đồ đạc, làm lại không đạt…), hãy gửi yêu cầu bồi thường kèm ảnh bằng chứng. Yêu cầu phải gửi trong thời hạn bảo hiểm của đơn (mặc định 30 ngày sau khi hoàn thành).'}
                </Text>
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en' ? 'Describe incident / damage *' : 'Mô tả sự cố / thiệt hại *'}
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={
                    lang === 'en'
                      ? 'E.g.: After AC cleaning, the wall got wet and damaged paint of about 2m²…'
                      : 'VD: Sau khi vệ sinh máy lạnh, tường bị thấm nước làm hỏng lớp sơn khoảng 2m²…'
                  }
                  multiline
                  numberOfLines={5}
                  style={{ ...inputStyle, minHeight: 110, textAlignVertical: 'top' }}
                />
                <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en'
                    ? 'Requested claim amount (₫) *'
                    : 'Số tiền đề nghị bồi thường (₫) *'}
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={lang === 'en' ? 'E.g. 500000' : 'VD: 500000'}
                  keyboardType="numeric"
                  style={inputStyle}
                />
                <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en' ? 'Evidence Photos *' : 'Ảnh bằng chứng *'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {photos.map((uri, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <Image source={{ uri }} style={{ width: 84, height: 84, borderRadius: 8 }} />
                    </TouchableOpacity>
                  ))}
                  {photos.length < 6 && (
                    <TouchableOpacity
                      onPress={pickPhotos}
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: COLORS.gray[300],
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        backgroundColor: tc.surface,
                      }}
                    >
                      <ImagePlus size={20} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                        {lang === 'en' ? 'Add photo' : 'Thêm ảnh'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Button
                  title={lang === 'en' ? 'Submit Insurance Claim' : 'Gửi yêu cầu bồi thường'}
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
