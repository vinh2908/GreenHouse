import { useState } from 'react';
import { formatDateTime } from '@/utils/date-format';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ImagePlus,
  Scale,
  Send,
  Gavel,
  Undo2,
  Flag,
  Camera,
  MessageSquare,
  Shield,
  RotateCcw,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import {
  useDisputeCase,
  useAddDisputeEntry,
  useAppealDispute,
  type DisputeTimelineEntry,
} from '@/hooks/use-api';
import {
  Badge,
  Button,
  Card,
  COLORS,
  EmptyState,
  LoadingSpinner,
  useThemeColors,
} from '@/components/ui';

const fmt = (n?: number, l: string = 'vi') =>
  new Intl.NumberFormat(l === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);

const KIND_META: Record<DisputeTimelineEntry['kind'], { label: string; label_en: string }> = {
  opened: { label: 'Mở tranh chấp', label_en: 'Dispute opened' },
  evidence: { label: 'Bổ sung bằng chứng', label_en: 'Additional evidence' },
  note: { label: 'Trình bày thêm', label_en: 'Additional note' },
  admin_message: { label: 'Admin phản hồi', label_en: 'Admin response' },
  resolution: { label: 'Phán quyết của Admin', label_en: 'Admin resolution' },
  appeal: { label: 'Kháng cáo', label_en: 'Appeal filed' },
  appeal_resolved: { label: 'Phán quyết sau kháng cáo', label_en: 'Appeal resolution' },
};

function renderKindIcon(kind: DisputeTimelineEntry['kind'], size = 16) {
  switch (kind) {
    case 'opened':
      return <Flag size={size} color="#EF4444" />;
    case 'evidence':
      return <Camera size={size} color="#3B82F6" />;
    case 'note':
      return <MessageSquare size={size} color="#6B7280" />;
    case 'admin_message':
      return <Shield size={size} color="#10B981" />;
    case 'resolution':
    case 'appeal_resolved':
      return <Scale size={size} color="#8B5CF6" />;
    case 'appeal':
      return <RotateCcw size={size} color="#F59E0B" />;
    default:
      return <MessageSquare size={size} color="#6B7280" />;
  }
}

function roleLabel(role: string, lang?: string) {
  if (role === 'customer') return lang === 'en' ? 'Customer' : 'Khách hàng';
  if (role === 'helper') return lang === 'en' ? 'Helper' : 'Thợ';
  if (role === 'admin') return 'Admin';
  return lang === 'en' ? 'System' : 'Hệ thống';
}

function resolutionLabel(action?: string, lang?: string) {
  if (action === 'refund_full')
    return lang === 'en' ? '100% refund to customer' : 'Hoàn tiền 100% cho khách hàng';
  if (action === 'refund_partial')
    return lang === 'en'
      ? 'Partial refund to customer, remainder to helper'
      : 'Hoàn một phần cho khách, phần còn lại trả thợ';
  if (action === 'release_to_helper')
    return lang === 'en'
      ? 'Dispute dismissed — payout released to helper'
      : 'Bác khiếu nại — giải ngân cho thợ';
  return '—';
}

export default function DisputeCaseScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const fmt = (n?: number) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n ?? 0);
  dayjs.locale(lang === 'vi' ? 'vi' : 'en');
  const currentUser = useAuthStore(s => s.user);

  const { data: caseData, isLoading, error } = useDisputeCase(jobId);
  const addEntry = useAddDisputeEntry();
  const appeal = useAppealDispute();

  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState('');

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

  const handleSend = async () => {
    if (!jobId || (!text.trim() && photos.length === 0)) return;
    try {
      await addEntry.mutateAsync({ jobId, text: text.trim() || undefined, photos });
      setText('');
      setPhotos([]);
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  const handleAppeal = async () => {
    if (!jobId || appealReason.trim().length < 5) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please state your appeal reason clearly'
            : 'Vui lòng nêu rõ lý do kháng cáo',
      });
      return;
    }
    try {
      await appeal.mutateAsync({ jobId, reason: appealReason.trim() });
      setShowAppeal(false);
      setAppealReason('');
    } catch {
      // Toast lỗi đã hiển thị bởi hook
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* Header */}
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
            {lang === 'en' ? 'Dispute Case' : 'Hồ sơ tranh chấp'}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en'
              ? 'All records preserved for fair administrative arbitration'
              : 'Toàn bộ diễn biến được lưu lại để Admin phân xử công bằng'}
          </Text>
        </View>
        <Scale size={22} color={COLORS.gray[400]} />
      </View>

      {!caseData ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <EmptyState
            icon={<Scale size={36} color={COLORS.gray[400]} />}
            title={lang === 'en' ? 'No dispute case found' : 'Chưa có hồ sơ tranh chấp'}
            subtitle={
              (error as any)?.response?.data?.message ??
              (lang === 'en'
                ? 'This job has no active disputes.'
                : 'Đơn này chưa phát sinh tranh chấp nào.')
            }
            action={lang === 'en' ? 'Back' : 'Quay lại'}
            onAction={handleBack}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}
          >
            {/* ── Trạng thái hồ sơ ─────────────────────────────────────── */}
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontWeight: '800', fontSize: fs(15), color: tc.text }}>
                  {lang === 'en' ? 'Dispute reason' : 'Lý do tranh chấp'}
                </Text>
                {caseData.status === 'open' && (
                  <Badge
                    label={lang === 'en' ? 'Pending arbitration' : 'Đang chờ phân xử'}
                    color="#FEF3C7"
                    textColor="#92400E"
                  />
                )}
                {caseData.status === 'appealed' && (
                  <Badge
                    label={lang === 'en' ? 'Under appeal' : 'Đang kháng cáo'}
                    color="#FFEDD5"
                    textColor="#9A3412"
                  />
                )}
                {caseData.status === 'resolved' && (
                  <Badge
                    label={lang === 'en' ? 'Resolved' : 'Đã có phán quyết'}
                    color={COLORS.successLight}
                    textColor={COLORS.success}
                  />
                )}
              </View>
              <Text style={{ fontSize: fs(13.5), color: tc.text, lineHeight: 20 }}>
                {caseData.reason}
              </Text>
              <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                {lang === 'en' ? 'Opened by ' : 'Mở bởi '}
                {roleLabel(caseData.opened_by_role, lang)} ·{' '}
                {formatDateTime(dayjs(caseData.created_at), lang)}
              </Text>
            </Card>

            {/* ── Phán quyết ───────────────────────────────────────────── */}
            {caseData.resolution && (
              <Card
                style={{
                  gap: 8,
                  backgroundColor: '#EFF6FF',
                  borderColor: '#BFDBFE',
                  borderWidth: 1.5,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Gavel size={18} color="#1E40AF" />
                  <Text style={{ fontWeight: '800', fontSize: fs(15), color: '#1E40AF' }}>
                    {lang === 'en' ? 'Admin Resolution' : 'Phán quyết của Admin'}
                  </Text>
                </View>
                <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                  {resolutionLabel(caseData.resolution.action, lang)}
                </Text>
                {(caseData.resolution.refund_amount ?? 0) > 0 && (
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                    {lang === 'en' ? 'Refund to customer: ' : 'Hoàn cho khách: '}
                    {fmt(caseData.resolution.refund_amount)}₫
                  </Text>
                )}
                {(caseData.resolution.helper_payout ?? 0) > 0 && (
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
                    {lang === 'en' ? 'Payout to helper: ' : 'Giải ngân cho thợ: '}
                    {fmt(caseData.resolution.helper_payout)}₫
                  </Text>
                )}
                {caseData.resolution.admin_note && (
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                    {lang === 'en' ? 'Note: ' : 'Ghi chú: '}
                    {caseData.resolution.admin_note}
                  </Text>
                )}
                {caseData.resolution.resolved_at && (
                  <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                    {formatDateTime(dayjs(caseData.resolution.resolved_at), lang)}
                  </Text>
                )}
                {caseData.can_appeal && (
                  <>
                    <Text style={{ fontSize: fs(12.5), color: '#9A3412', fontWeight: '600' }}>
                      {lang === 'en'
                        ? 'You may appeal once before '
                        : 'Bạn có thể kháng cáo 1 lần trước '}
                      {caseData.appeal_deadline
                        ? formatDateTime(dayjs(caseData.appeal_deadline), lang)
                        : ''}
                      .
                    </Text>
                    <Button
                      title={lang === 'en' ? 'Appeal resolution' : 'Kháng cáo phán quyết'}
                      variant="outline"
                      onPress={() => setShowAppeal(true)}
                    />
                  </>
                )}
                {caseData.appeal && (
                  <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                    {lang === 'en' ? 'Appealed by ' : 'Đã kháng cáo bởi '}
                    {roleLabel(caseData.appeal.by_role, lang)}: {caseData.appeal.reason}
                  </Text>
                )}
              </Card>
            )}

            {/* ── Timeline ─────────────────────────────────────────────── */}
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
              {lang === 'en' ? 'Case Timeline' : 'Diễn biến hồ sơ'}
            </Text>
            <View style={{ gap: 0 }}>
              {[...caseData.timeline].reverse().map((entry, idx) => {
                const meta = KIND_META[entry.kind] ?? KIND_META.note;
                const mine = entry.actor_id === currentUser?._id;
                return (
                  <View key={idx} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 14,
                          backgroundColor: entry.actor_role === 'admin' ? '#EFF6FF' : '#fff',
                          borderWidth: 1,
                          borderColor: tc.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {renderKindIcon(entry.kind, 16)}
                      </View>
                      {idx < caseData.timeline.length - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: tc.border }} />
                      )}
                    </View>
                    <Card style={{ flex: 1, marginBottom: 12, gap: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '800', fontSize: fs(13.5), color: tc.text }}>
                          {lang === 'en' ? meta.label_en : meta.label}
                        </Text>
                        <Badge
                          label={`${roleLabel(entry.actor_role, lang)}${mine ? (lang === 'en' ? ' (you)' : ' (bạn)') : ''}`}
                          size="sm"
                        />
                      </View>
                      <Text style={{ fontSize: fs(11.5), color: tc.textMuted }}>
                        {formatDateTime(dayjs(entry.created_at), lang)}
                      </Text>
                      {entry.text ? (
                        <Text style={{ fontSize: fs(13.5), color: tc.text, lineHeight: 20 }}>
                          {entry.text}
                        </Text>
                      ) : null}
                      {entry.photos?.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {entry.photos.map((uri, i) => (
                            <Image
                              key={i}
                              source={{ uri }}
                              style={{ width: 72, height: 72, borderRadius: 8 }}
                            />
                          ))}
                        </View>
                      )}
                    </Card>
                  </View>
                );
              })}
            </View>

            {/* ── Bổ sung bằng chứng ───────────────────────────────────── */}
            {caseData.status !== 'resolved' ? (
              <Card style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', fontSize: fs(14.5), color: tc.text }}>
                  {lang === 'en' ? 'Add evidence / statement' : 'Bổ sung bằng chứng / trình bày'}
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={
                    lang === 'en'
                      ? 'Describe details, timeline, prior agreements...'
                      : 'Mô tả thêm sự việc, thời gian, thỏa thuận đã có…'
                  }
                  placeholderTextColor={COLORS.gray[400]}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 12,
                    minHeight: 74,
                    textAlignVertical: 'top',
                    fontSize: fs(13.5),
                    color: tc.text,
                    backgroundColor: tc.surface,
                  }}
                />
                {photos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {photos.map((uri, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setPhotos(prev => prev.filter((_, x) => x !== i))}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: 60, height: 60, borderRadius: 8 }}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    title={lang === 'en' ? 'Add photos' : 'Thêm ảnh'}
                    variant="outline"
                    onPress={pickPhotos}
                    icon={<ImagePlus size={16} color={COLORS.primary} />}
                  />
                  <Button
                    title={lang === 'en' ? 'Submit' : 'Gửi bổ sung'}
                    loading={addEntry.isPending}
                    onPress={handleSend}
                    icon={<Send size={16} color="#fff" />}
                  />
                </View>
              </Card>
            ) : (
              <Card style={{ backgroundColor: tc.background }}>
                <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                  {lang === 'en'
                    ? `Case closed following resolution. If you disagree with the outcome, you may appeal once within ${caseData.appeal_window_hours} hours of resolution (when active, the Appeal button appears in the resolution card above).`
                    : `Hồ sơ đã đóng sau phán quyết. Nếu chưa đồng ý với kết quả, bạn có thể kháng cáo 1 lần trong ${caseData.appeal_window_hours} giờ kể từ lúc có phán quyết (khi còn thời hạn, nút Kháng cáo sẽ hiện ở thẻ phán quyết phía trên).`}
                </Text>
              </Card>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Appeal Modal ─────────────────────────────────────────────── */}
      <Modal visible={showAppeal} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{
            flex: 1,
            backgroundColor: tc.surface,
            padding: 20,
            paddingTop: Math.max(insets.top, 20),
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Undo2 size={20} color={COLORS.gray[800]} />
            <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
              {lang === 'en' ? 'Appeal Resolution' : 'Kháng cáo phán quyết'}
            </Text>
          </View>
          <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, lineHeight: 20 }}>
            {lang === 'en' ? (
              <>
                Each case can only be appealed <Text style={{ fontWeight: '800' }}>once</Text>.
                Admin will re-examine all evidence submitted by both parties. The appeal verdict is
                final.
              </>
            ) : (
              <>
                Mỗi hồ sơ chỉ được kháng cáo{' '}
                <Text style={{ fontWeight: '800' }}>1 lần duy nhất</Text>. Admin sẽ xem lại toàn bộ
                bằng chứng hai bên đã gửi. Phán quyết sau kháng cáo là quyết định cuối cùng.
              </>
            )}
          </Text>
          <TextInput
            value={appealReason}
            onChangeText={setAppealReason}
            placeholder={
              lang === 'en'
                ? 'Why you believe the resolution was inappropriate...'
                : 'Lý do bạn cho rằng phán quyết chưa thỏa đáng…'
            }
            placeholderTextColor={COLORS.gray[400]}
            multiline
            style={{
              borderWidth: 1.5,
              borderColor: tc.border,
              borderRadius: 14,
              padding: 14,
              minHeight: 120,
              textAlignVertical: 'top',
              fontSize: fs(14),
              color: tc.text,
            }}
          />
          <Button
            title={lang === 'en' ? 'Submit appeal' : 'Gửi kháng cáo'}
            loading={appeal.isPending}
            onPress={handleAppeal}
          />
          <Button
            title={lang === 'en' ? 'Later' : 'Để sau'}
            variant="ghost"
            onPress={() => setShowAppeal(false)}
          />
        </View>
      </Modal>
    </View>
  );
}
