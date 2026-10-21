import { useState } from 'react';
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
import { ArrowLeft, ImagePlus, Scale, Send, Gavel, Undo2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useDisputeCase,
  useAddDisputeEntry,
  useAppealDispute,
  type DisputeTimelineEntry,
} from '@/hooks/use-api';
import { Badge, Button, Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

dayjs.locale('vi');

const fmt = (n?: number) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

const KIND_META: Record<DisputeTimelineEntry['kind'], { icon: string; label: string }> = {
  opened: { icon: '🚩', label: 'Mở tranh chấp' },
  evidence: { icon: '📸', label: 'Bổ sung bằng chứng' },
  note: { icon: '💬', label: 'Trình bày thêm' },
  admin_message: { icon: '🛡️', label: 'Admin phản hồi' },
  resolution: { icon: '⚖️', label: 'Phán quyết của Admin' },
  appeal: { icon: '↩️', label: 'Kháng cáo' },
  appeal_resolved: { icon: '⚖️', label: 'Phán quyết sau kháng cáo' },
};

function roleLabel(role: string) {
  if (role === 'customer') return 'Khách hàng';
  if (role === 'helper') return 'Thợ';
  if (role === 'admin') return 'Admin';
  return 'Hệ thống';
}

function resolutionLabel(action?: string) {
  if (action === 'refund_full') return 'Hoàn tiền 100% cho khách hàng';
  if (action === 'refund_partial') return 'Hoàn một phần cho khách, phần còn lại trả thợ';
  if (action === 'release_to_helper') return 'Bác khiếu nại — giải ngân cho thợ';
  return '—';
}

export default function DisputeCaseScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      Toast.show({ type: 'error', text1: 'Vui lòng nêu rõ lý do kháng cáo' });
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
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
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
            Hồ sơ tranh chấp ⚖️
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Toàn bộ diễn biến được lưu lại để Admin phân xử công bằng
          </Text>
        </View>
        <Scale size={22} color={COLORS.gray[400]} />
      </View>

      {!caseData ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <EmptyState
            emoji="⚖️"
            title="Chưa có hồ sơ tranh chấp"
            subtitle={
              (error as any)?.response?.data?.message ??
              'Đơn này chưa phát sinh tranh chấp nào.'
            }
            action="Quay lại"
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
                <Text style={{ flex: 1, fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                  Lý do tranh chấp
                </Text>
                {caseData.status === 'open' && (
                  <Badge label="Đang chờ phân xử" color="#FEF3C7" textColor="#92400E" />
                )}
                {caseData.status === 'appealed' && (
                  <Badge label="Đang kháng cáo" color="#FFEDD5" textColor="#9A3412" />
                )}
                {caseData.status === 'resolved' && (
                  <Badge label="Đã có phán quyết" color={COLORS.successLight} textColor={COLORS.success} />
                )}
              </View>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                {caseData.reason}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                Mở bởi {roleLabel(caseData.opened_by_role)} ·{' '}
                {dayjs(caseData.created_at).format('HH:mm DD/MM/YYYY')}
              </Text>
            </Card>

            {/* ── Phán quyết ───────────────────────────────────────────── */}
            {caseData.resolution && (
              <Card style={{ gap: 8, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1.5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Gavel size={18} color="#1E40AF" />
                  <Text style={{ fontWeight: '800', fontSize: 15, color: '#1E40AF' }}>
                    Phán quyết của Admin
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                  {resolutionLabel(caseData.resolution.action)}
                </Text>
                {(caseData.resolution.refund_amount ?? 0) > 0 && (
                  <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                    Hoàn cho khách: {fmt(caseData.resolution.refund_amount)}₫
                  </Text>
                )}
                {(caseData.resolution.helper_payout ?? 0) > 0 && (
                  <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                    Giải ngân cho thợ: {fmt(caseData.resolution.helper_payout)}₫
                  </Text>
                )}
                {caseData.resolution.admin_note && (
                  <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
                    Ghi chú: {caseData.resolution.admin_note}
                  </Text>
                )}
                {caseData.resolution.resolved_at && (
                  <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                    {dayjs(caseData.resolution.resolved_at).format('HH:mm DD/MM/YYYY')}
                  </Text>
                )}
                {caseData.can_appeal && (
                  <>
                    <Text style={{ fontSize: 12.5, color: '#9A3412', fontWeight: '600' }}>
                      Bạn có thể kháng cáo 1 lần trước{' '}
                      {caseData.appeal_deadline
                        ? dayjs(caseData.appeal_deadline).format('HH:mm DD/MM/YYYY')
                        : ''}
                      .
                    </Text>
                    <Button
                      title="↩️ Kháng cáo phán quyết"
                      variant="outline"
                      onPress={() => setShowAppeal(true)}
                    />
                  </>
                )}
                {caseData.appeal && (
                  <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>
                    Đã kháng cáo bởi {roleLabel(caseData.appeal.by_role)}:{' '}
                    {caseData.appeal.reason}
                  </Text>
                )}
              </Card>
            )}

            {/* ── Timeline ─────────────────────────────────────────────── */}
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              Diễn biến hồ sơ
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
                          borderRadius: 17,
                          backgroundColor: entry.actor_role === 'admin' ? '#EFF6FF' : '#fff',
                          borderWidth: 1,
                          borderColor: COLORS.gray[200],
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 15 }}>{meta.icon}</Text>
                      </View>
                      {idx < caseData.timeline.length - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: COLORS.gray[200] }} />
                      )}
                    </View>
                    <Card style={{ flex: 1, marginBottom: 12, gap: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '800', fontSize: 13.5, color: COLORS.gray[900] }}>
                          {meta.label}
                        </Text>
                        <Badge
                          label={`${roleLabel(entry.actor_role)}${mine ? ' (bạn)' : ''}`}
                          size="sm"
                        />
                      </View>
                      <Text style={{ fontSize: 11.5, color: COLORS.gray[400] }}>
                        {dayjs(entry.created_at).format('HH:mm DD/MM/YYYY')}
                      </Text>
                      {entry.text ? (
                        <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                          {entry.text}
                        </Text>
                      ) : null}
                      {entry.photos?.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {entry.photos.map((uri, i) => (
                            <Image
                              key={i}
                              source={{ uri }}
                              style={{ width: 72, height: 72, borderRadius: 10 }}
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
                <Text style={{ fontWeight: '800', fontSize: 14.5, color: COLORS.gray[900] }}>
                  Bổ sung bằng chứng / trình bày
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Mô tả thêm sự việc, thời gian, thỏa thuận đã có…"
                  placeholderTextColor={COLORS.gray[400]}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.gray[200],
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 74,
                    textAlignVertical: 'top',
                    fontSize: 13.5,
                    color: COLORS.gray[900],
                    backgroundColor: '#fff',
                  }}
                />
                {photos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {photos.map((uri, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setPhotos(prev => prev.filter((_, x) => x !== i))}
                      >
                        <Image source={{ uri }} style={{ width: 60, height: 60, borderRadius: 10 }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    title="📸 Thêm ảnh"
                    variant="outline"
                    onPress={pickPhotos}
                    icon={<ImagePlus size={16} color={COLORS.primary} />}
                  />
                  <Button
                    title="Gửi bổ sung"
                    loading={addEntry.isPending}
                    onPress={handleSend}
                    icon={<Send size={16} color="#fff" />}
                  />
                </View>
              </Card>
            ) : (
              <Card style={{ backgroundColor: COLORS.gray[50] }}>
                <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 19 }}>
                  Hồ sơ đã đóng sau phán quyết. Nếu chưa đồng ý với kết quả, bạn có thể kháng cáo
                  1 lần trong {caseData.appeal_window_hours} giờ kể từ lúc có phán quyết (khi còn
                  thời hạn, nút Kháng cáo sẽ hiện ở thẻ phán quyết phía trên).
                </Text>
              </Card>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Appeal Modal ─────────────────────────────────────────────── */}
      <Modal visible={showAppeal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: Math.max(insets.top, 20), gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Undo2 size={20} color={COLORS.gray[800]} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
              Kháng cáo phán quyết
            </Text>
          </View>
          <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
            Mỗi hồ sơ chỉ được kháng cáo <Text style={{ fontWeight: '800' }}>1 lần duy nhất</Text>.
            Admin sẽ xem lại toàn bộ bằng chứng hai bên đã gửi. Phán quyết sau kháng cáo là quyết
            định cuối cùng.
          </Text>
          <TextInput
            value={appealReason}
            onChangeText={setAppealReason}
            placeholder="Lý do bạn cho rằng phán quyết chưa thỏa đáng…"
            placeholderTextColor={COLORS.gray[400]}
            multiline
            style={{
              borderWidth: 1.5,
              borderColor: COLORS.gray[200],
              borderRadius: 14,
              padding: 14,
              minHeight: 120,
              textAlignVertical: 'top',
              fontSize: 14,
              color: COLORS.gray[900],
            }}
          />
          <Button title="Gửi kháng cáo" loading={appeal.isPending} onPress={handleAppeal} />
          <Button title="Để sau" variant="ghost" onPress={() => setShowAppeal(false)} />
        </View>
      </Modal>
    </View>
  );
}
