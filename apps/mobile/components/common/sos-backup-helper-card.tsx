// components/common/sos-backup-helper-card.tsx — Khu vực SOS Backup trong màn
// chi tiết đơn của THỢ:
//  - Chưa có SOS: nút SOS nổi bật → bottom sheet chọn lý do → gửi yêu cầu.
//  - Đã gửi: trạng thái chờ ("Đang chờ khách xác nhận…" / "Đang tìm người thay
//    thế…") kèm nút thu hồi.
//  - Cảnh báo điểm uy tín khi số lần hủy/SOS trong 7 ngày gần/vượt ngưỡng 3
//    (quá 3 lần/7 ngày bị trừ điểm tiêu chí Độ tin cậy — thang 100).
import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import { Button, Card, COLORS } from '@/components/ui';
import {
  useCancelSosBackup,
  useCreateSosBackup,
  useHelperProfile,
  useSosBackupByJob,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { SOS_BACKUP_REASON_LABELS } from '@/stores/sos-backup.store';
import { useNowTick, formatCountdown } from '@/hooks/use-countdown';

const ACTIVE_STATUSES = ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress'];
const REASON_CODES = Object.keys(SOS_BACKUP_REASON_LABELS);

function helperIdOf(job: any): string | null {
  if (!job?.helper_id) return null;
  return typeof job.helper_id === 'string' ? job.helper_id : (job.helper_id._id ?? null);
}

export function SosBackupHelperCard({ job }: { job: any }) {
  const myId = useAuthStore(s => s.user?._id);
  const { data: profile } = useHelperProfile();
  const createSos = useCreateSosBackup();
  const cancelSos = useCancelSosBackup();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const isMine = !!myId && helperIdOf(job) === myId;
  const isActive = ACTIVE_STATUSES.includes(job?.status);
  const { data: sosResp } = useSosBackupByJob(isMine && isActive ? job?._id : undefined);
  const sos = sosResp?.sos;
  const outgoing = sos && sos.original_helper_id === myId ? sos : null;
  const now = useNowTick(!!outgoing && outgoing.status === 'awaiting_customer');

  if (!job) return null;

  // Thợ mới vào đơn này nhờ nhận thay qua SOS Backup
  const replacement = (job as any).sos_backup_replacement;
  if (replacement && replacement.new_helper_id === myId) {
    return (
      <Card
        style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1.5, gap: 6 }}
      >
        <Text style={{ fontWeight: '800', fontSize: 15, color: '#1E40AF' }}>
          🔄 Bạn đang thay thế đơn này qua SOS Backup
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
          Thợ trước gặp sự cố nên khách hàng đã đồng ý đổi người. Hãy tiếp tục đơn như bình thường —
          tiền công giữ nguyên theo hợp đồng.
        </Text>
      </Card>
    );
  }

  if (!isMine || !isActive) return null;

  const cancels7d = profile?.cancellations_last_7_days ?? 0;
  const performanceScore = profile?.performance_score;

  const handleWithdraw = () => {
    if (!outgoing) return;
    Alert.alert('Thu hồi yêu cầu SOS?', 'Đơn sẽ tiếp tục với bạn như bình thường.', [
      { text: 'Để sau', style: 'cancel' },
      {
        text: 'Thu hồi SOS',
        onPress: () => cancelSos.mutate({ sosId: outgoing._id ?? outgoing.sos_id, jobId: job._id }),
      },
    ]);
  };

  // ── Đã có SOS đang chờ xử lý ──────────────────────────────────────────────
  if (outgoing) {
    const isAwaiting = outgoing.status === 'awaiting_customer';
    const deadlineMs = outgoing.decision_deadline
      ? new Date(outgoing.decision_deadline).getTime()
      : null;
    return (
      <Card
        style={{
          gap: 10,
          backgroundColor: isAwaiting ? '#FFFBEB' : '#EFF6FF',
          borderColor: isAwaiting ? '#FDE68A' : '#BFDBFE',
          borderWidth: 1.5,
        }}
      >
        <Text
          style={{ fontWeight: '800', fontSize: 15, color: isAwaiting ? '#92400E' : '#1E40AF' }}
        >
          {isAwaiting ? '⏳ Đang chờ khách xác nhận…' : '🔍 Đang tìm người thay thế…'}
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
          {isAwaiting
            ? `Bạn đã gửi SOS (lý do: ${SOS_BACKUP_REASON_LABELS[outgoing.reason] ?? 'khẩn cấp'}). Khách hàng cần đồng ý đổi người thì hệ thống mới tìm thợ thay thế.${
                deadlineMs
                  ? ` Thời hạn khách quyết định còn ${formatCountdown(deadlineMs - now)}.`
                  : ''
              } Nếu khách không phản hồi, đơn sẽ tự hủy và hoàn tiền 100% theo chính sách.`
            : 'Khách hàng đã đồng ý đổi người. Hệ thống đang mời các thợ đang online gần đây — bạn vẫn phụ trách đơn cho tới khi có thợ nhận thay.'}
        </Text>
        <Button
          title="Thu hồi yêu cầu SOS"
          variant="outline"
          loading={cancelSos.isPending}
          onPress={handleWithdraw}
        />
      </Card>
    );
  }

  // ── Chưa có SOS: nút gửi + cảnh báo điểm ───────────────────────────────────
  const handleSubmit = async () => {
    if (!reason) return;
    try {
      const res = await createSos.mutateAsync({
        jobId: job._id,
        reason,
        note: note.trim() ? note.trim() : undefined,
      });
      setSheetOpen(false);
      setReason(null);
      setNote('');
      const score = (res as any)?.data?.data?.cancellation_score;
      if (score?.warningLevel === 'penalized') {
        Toast.show({
          type: 'error',
          text1: 'Bạn đã vượt ngưỡng hủy đơn tuần này',
          text2: `Lần SOS này bị trừ ${score.points_deducted_now ?? 5} điểm tin cậy. Điểm uy tín hiện tại: ${score.total}/100`,
        });
      } else if (score?.warningLevel === 'approaching') {
        Toast.show({
          type: 'info',
          text1: 'Lưu ý điểm uy tín',
          text2: `Bạn đã hủy/SOS ${score.cancellationsInWindow} đơn trong 7 ngày — hủy quá 3 đơn sẽ bị trừ điểm tin cậy`,
        });
      }
    } catch {
      // Toast lỗi đã được hook xử lý
    }
  };

  return (
    <>
      <Card
        style={{ gap: 10, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1.5 }}
      >
        <Text style={{ fontWeight: '800', fontSize: 15, color: '#991B1B' }}>
          🆘 Gặp sự cố không thể tiếp tục đơn?
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 19 }}>
          Gửi SOS để xin đổi người: khách hàng sẽ xác nhận đổi thợ khác (giữ nguyên giá) hoặc hủy
          đơn. Bạn không bị tính phạt trễ/hủy cho đơn này khi dùng SOS.
        </Text>
        {cancels7d >= 2 && (
          <Text style={{ fontSize: 12.5, color: '#B45309', lineHeight: 18 }}>
            ⚠️ Điểm uy tín: bạn đã hủy/SOS {cancels7d} đơn trong 7 ngày qua
            {performanceScore != null ? ` — điểm hiện tại ${performanceScore}/100` : ''}. Hủy quá 3
            đơn/7 ngày sẽ bị trừ điểm tiêu chí Độ tin cậy.
          </Text>
        )}
        <Button
          title="🆘 Gửi SOS — xin đổi người"
          variant="danger"
          onPress={() => setSheetOpen(true)}
        />
      </Card>

      {/* Bottom sheet chọn lý do */}
      <Modal
        transparent
        animationType="slide"
        visible={sheetOpen}
        onRequestClose={() => setSheetOpen(false)}
      >
        <View
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              gap: 10,
            }}
          >
            <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.gray[900] }}>
              Lý do không thể tiếp tục đơn
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.gray[500], lineHeight: 18 }}>
              Chỉ lý do này được gửi cho khách hàng — ghi chú thêm (nếu có) chỉ đội hỗ trợ xem.
            </Text>
            {REASON_CODES.map(code => {
              const selected = reason === code;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => setReason(code)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: selected ? COLORS.error : COLORS.gray[200],
                    backgroundColor: selected ? '#FEF2F2' : '#fff',
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: selected ? COLORS.error : COLORS.gray[300],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && (
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          backgroundColor: COLORS.error,
                        }}
                      />
                    )}
                  </View>
                  <Text style={{ fontSize: 14.5, fontWeight: '600', color: COLORS.gray[800] }}>
                    {SOS_BACKUP_REASON_LABELS[code]}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ghi chú thêm (không bắt buộc)"
              maxLength={300}
              style={{
                borderWidth: 1,
                borderColor: COLORS.gray[200],
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 14,
              }}
            />
            <Button
              title="Gửi yêu cầu SOS"
              variant="danger"
              loading={createSos.isPending}
              disabled={!reason}
              onPress={handleSubmit}
            />
            <TouchableOpacity
              onPress={() => setSheetOpen(false)}
              style={{ paddingVertical: 8, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.gray[500], fontWeight: '700' }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
