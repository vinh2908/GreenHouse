import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Users } from 'lucide-react-native';
import { Avatar, Badge, Button, Card, COLORS } from '@/components/ui';
import { useTeamCandidates, useInviteTeamMember } from '@/hooks/use-api';
import { Alert } from '@/components/common/app-alert';

const TEAM_BUILDABLE_STATUSES = ['confirmed', 'helper_on_the_way', 'helper_arrived'];

function idOf(v: any): string {
  if (!v) return '';
  return String(v?._id ?? v);
}

const STATUS_META: Record<string, { label: string; color: string; textColor: string }> = {
  accepted: { label: 'Đã nhận', color: '#D1FAE5', textColor: '#065F46' },
  invited: { label: 'Chờ phản hồi', color: '#FEF3C7', textColor: '#92400E' },
  declined: { label: 'Đã từ chối', color: '#FEE2E2', textColor: '#991B1B' },
};

/**
 * Thẻ đội nhóm cho đơn cần 2–4 thợ (Roadmap Phase 1 — Feature 5).
 * - Mọi bên liên quan: xem roster + tỉ lệ chia tiền công.
 * - Lead (thợ chính): mời thêm thợ từ danh sách khả dụng kèm % chia.
 */
export function TeamCard({ job, currentUserId }: { job: any; currentUserId?: string }) {
  const helpersNeeded = job?.helpers_needed ?? 1;
  const leadId = idOf(job?.helper_id);
  const isLead = !!currentUserId && leadId === currentUserId;
  const canBuild = isLead && TEAM_BUILDABLE_STATUSES.includes(job?.status);
  const display: any[] = job?.team_display ?? [];
  const activeCount = display.filter(m => m.status !== 'declined').length;
  const slotsLeft = helpersNeeded - activeCount;

  const { data: candidates } = useTeamCandidates(job?._id, canBuild && slotsLeft > 0);
  const invite = useInviteTeamMember();
  const [splits, setSplits] = useState<Record<string, string>>({});

  if (!job || helpersNeeded <= 1) return null;

  const handleInvite = (helperId: string, name: string) => {
    const pct = parseInt(splits[helperId] ?? '30', 10);
    if (!pct || pct < 1 || pct > 90) {
      Alert.alert('Tỉ lệ chưa hợp lệ', 'Nhập % tiền công cho thành viên (1–90%).');
      return;
    }
    Alert.alert(
      'Mời vào nhóm',
      `Mời ${name} tham gia đơn này với tỉ lệ chia tiền công ${pct}%?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi lời mời',
          onPress: () =>
            invite.mutate({ jobId: job._id, helper_id: helperId, split_percent: pct }),
        },
      ],
    );
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Users size={18} color={COLORS.primary} />
        <Text style={{ flex: 1, fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
          Đội thực hiện ({activeCount}/{helpersNeeded} thợ)
        </Text>
        <Badge label="Đơn nhóm" color={COLORS.secondaryLight} textColor={COLORS.secondary} size="sm" />
      </View>

      {display.length === 0 && (
        <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
          Chưa có thợ chính — nhóm sẽ hình thành khi một thợ nhận đơn làm lead.
        </Text>
      )}

      {display.map(member => {
        const meta = STATUS_META[member.status] ?? STATUS_META.invited;
        return (
          <View
            key={`${member.helper_id}-${member.role}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Avatar name={member.full_name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: COLORS.gray[900] }}>
                {member.full_name}
                {member.helper_id === currentUserId ? ' (bạn)' : ''}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                {member.role === 'lead' ? '⭐ Thợ chính (lead)' : 'Thành viên'} · Nhận{' '}
                {member.split_percent}% tiền công
              </Text>
            </View>
            <Badge label={meta.label} color={meta.color} textColor={meta.textColor} size="sm" />
          </View>
        );
      })}

      <Text style={{ fontSize: 12, color: COLORS.gray[500], lineHeight: 17 }}>
        Tiền công (sau phí sàn) được chia tự động theo tỉ lệ trên khi đơn hoàn thành và khách
        nghiệm thu.
      </Text>

      {canBuild && slotsLeft > 0 && (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: COLORS.gray[100], paddingTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 13.5, color: COLORS.gray[900] }}>
            Mời thêm thợ vào nhóm (còn {slotsLeft} chỗ)
          </Text>
          {(candidates ?? []).length === 0 && (
            <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
              Chưa có thợ đang sẵn sàng để mời. Thử lại sau ít phút.
            </Text>
          )}
          {(candidates ?? []).map(c => (
            <View
              key={c.helper_id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Avatar name={c.full_name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: COLORS.gray[900] }}>
                  {c.full_name}
                </Text>
                <Text style={{ fontSize: 11.5, color: COLORS.gray[500] }}>
                  ⭐ {c.rating?.toFixed?.(1) ?? c.rating} · {c.completed_jobs} đơn hoàn thành
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: COLORS.gray[200],
                  borderRadius: 10,
                  paddingHorizontal: 8,
                }}
              >
                <TextInput
                  value={splits[c.helper_id] ?? '30'}
                  onChangeText={v =>
                    setSplits(prev => ({ ...prev, [c.helper_id]: v.replace(/[^0-9]/g, '') }))
                  }
                  keyboardType="number-pad"
                  style={{ width: 34, textAlign: 'center', fontWeight: '700', fontSize: 13.5 }}
                />
                <Text style={{ fontSize: 12.5, color: COLORS.gray[500], fontWeight: '700' }}>%</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleInvite(c.helper_id, c.full_name)}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5 }}>Mời</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {isLead && !TEAM_BUILDABLE_STATUSES.includes(job?.status) && (
        <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
          Nhóm chỉ lập được trước khi bắt đầu làm việc.
        </Text>
      )}
    </Card>
  );
}
