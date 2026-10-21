import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Star, X } from 'lucide-react-native';
import {
  useLoyaltyAccount,
  useApplyLoyaltyPoints,
  useRemoveLoyaltyPoints,
} from '@/hooks/use-api';
import { Card, COLORS } from '@/components/ui';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/**
 * Dùng điểm thành viên cho 1 đơn (Feature 12) — mirror VoucherInput.
 * Chỉ hiển thị khi đơn chưa thanh toán + đã có giá chốt (Contract).
 * Điểm CHƯA bị trừ khi gắn; server trừ thật tại thời điểm thanh toán.
 */
export function LoyaltyPointsInput({
  job,
  contractTotal,
}: {
  job: any;
  contractTotal: number;
}) {
  const { data: account } = useLoyaltyAccount();
  const apply = useApplyLoyaltyPoints();
  const remove = useRemoveLoyaltyPoints();
  const [pointsText, setPointsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isPaid = job.payment_status === 'paid';
  if (isPaid) return null;

  const appliedPoints = job.loyalty_points_requested ?? 0;
  const appliedDiscount = job.loyalty_discount_amount ?? 0;

  if (appliedPoints > 0) {
    return (
      <Card style={{ gap: 6, backgroundColor: '#FFFBEB' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Star size={18} color="#D97706" />
          <Text style={{ flex: 1, fontWeight: '800', fontSize: 14, color: '#92400E' }}>
            Đã dùng {fmt(appliedPoints)} điểm — giảm {fmt(appliedDiscount)}₫
          </Text>
          <TouchableOpacity
            onPress={() => remove.mutate(job._id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={17} color="#92400E" />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: '#92400E' }}>
          Điểm sẽ bị trừ khi bạn thanh toán. Cần thanh toán khoảng{' '}
          {fmt(Math.max(0, contractTotal - appliedDiscount - (job.discount_amount ?? 0)))}₫.
        </Text>
        <TouchableOpacity onPress={() => remove.mutate(job._id)}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.error }}>Gỡ điểm</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  if (!account) return null;
  const minRedeem = account.min_redeem_points ?? 100;
  if ((account.points_balance ?? 0) < minRedeem) {
    return (
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Star size={18} color={COLORS.gray[400]} />
          <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.gray[700] }}>
            Điểm thành viên: {fmt(account.points_balance ?? 0)} điểm
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
          Cần tối thiểu {fmt(minRedeem)} điểm để đổi. Tích điểm: 1 điểm /{' '}
          {fmt(account.earn_vnd_per_point ?? 10000)}₫ đã thanh toán.
        </Text>
      </Card>
    );
  }

  const handleApply = async () => {
    const points = Number(pointsText.replace(/[^\d]/g, ''));
    if (!points || points < minRedeem) {
      setError(`Vui lòng nhập ít nhất ${fmt(minRedeem)} điểm`);
      return;
    }
    setError(null);
    try {
      await apply.mutateAsync({ jobId: job._id, points });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Không áp dụng được điểm');
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Star size={19} color="#D97706" />
        <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
          Dùng điểm thành viên
        </Text>
      </View>
      <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
        Bạn có {fmt(account.points_balance)} điểm · Hạng {account.tier_label} (đổi tối đa{' '}
        {account.redemption_cap_percent}% giá trị đơn) · 1 điểm ={' '}
        {fmt(account.point_value_vnd)}₫
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={pointsText}
          onChangeText={v => {
            setPointsText(v.replace(/[^\d]/g, ''));
            if (error) setError(null);
          }}
          placeholder={`Số điểm (tối thiểu ${fmt(minRedeem)})`}
          placeholderTextColor={COLORS.gray[400]}
          keyboardType="numeric"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: error ? COLORS.error : COLORS.gray[200],
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            fontWeight: '700',
            color: COLORS.gray[900],
            backgroundColor: '#fff',
          }}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleApply}
          disabled={apply.isPending}
          style={{
            backgroundColor: '#D97706',
            borderRadius: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 92,
          }}
        >
          {apply.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>Dùng điểm</Text>
          )}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={{ fontSize: 12.5, color: COLORS.error, fontWeight: '600' }}>{error}</Text>
      ) : null}
    </Card>
  );
}
