import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Star, X } from 'lucide-react-native';
import { useLoyaltyAccount, useApplyLoyaltyPoints, useRemoveLoyaltyPoints } from '@/hooks/use-api';
import { Card, COLORS } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';

/**
 * Dùng điểm thành viên cho 1 đơn (Feature 12) — mirror VoucherInput.
 * Chỉ hiển thị khi đơn chưa thanh toán + đã có giá chốt (Contract).
 * Điểm CHƯA bị trừ khi gắn; server trừ thật tại thời điểm thanh toán.
 */
export function LoyaltyPointsInput({ job, contractTotal }: { job: any; contractTotal: number }) {
  const { data: account } = useLoyaltyAccount();
  const apply = useApplyLoyaltyPoints();
  const remove = useRemoveLoyaltyPoints();
  const [pointsText, setPointsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t, lang, tLoyaltyTier, fs } = useTranslation();
  const fmt = (n: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n);

  const isPaid = job.payment_status === 'paid';
  if (isPaid) return null;

  const appliedPoints = job.loyalty_points_requested ?? 0;
  const appliedDiscount = job.loyalty_discount_amount ?? 0;

  if (appliedPoints > 0) {
    return (
      <Card style={{ gap: 6, backgroundColor: '#FFFBEB' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Star size={18} color="#D97706" />
          <Text style={{ flex: 1, fontWeight: '800', fontSize: fs(14), color: '#92400E' }}>
            {t('loyalty_input.applied_summary', {
              points: fmt(appliedPoints),
              discount: fmt(appliedDiscount),
            })}
          </Text>
          <TouchableOpacity
            onPress={() => remove.mutate(job._id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={17} color="#92400E" />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: fs(12), color: '#92400E' }}>
          {t('loyalty_input.payment_note', {
            amount: fmt(Math.max(0, contractTotal - appliedDiscount - (job.discount_amount ?? 0))),
          })}
        </Text>
        <TouchableOpacity onPress={() => remove.mutate(job._id)}>
          <Text style={{ fontSize: fs(12.5), fontWeight: '800', color: COLORS.error }}>
            {t('loyalty_input.remove_btn')}
          </Text>
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
          <Text style={{ fontWeight: '800', fontSize: fs(14), color: COLORS.gray[700] }}>
            {t('loyalty_input.balance_summary', { points: fmt(account.points_balance ?? 0) })}
          </Text>
        </View>
        <Text style={{ fontSize: fs(12), color: COLORS.gray[500] }}>
          {t('loyalty_input.min_notice', {
            min: fmt(minRedeem),
            earn: fmt(account.earn_vnd_per_point ?? 10000),
          })}
        </Text>
      </Card>
    );
  }

  const handleApply = async () => {
    const points = Number(pointsText.replace(/[^\d]/g, ''));
    if (!points || points < minRedeem) {
      setError(t('loyalty_input.min_error', { min: fmt(minRedeem) }));
      return;
    }
    setError(null);
    try {
      await apply.mutateAsync({ jobId: job._id, points });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : t('loyalty_input.generic_error'));
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Star size={19} color="#D97706" />
        <Text style={{ fontWeight: '800', fontSize: fs(15), color: COLORS.gray[900] }}>
          {t('loyalty_input.title')}
        </Text>
      </View>
      <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
        {t('loyalty_input.summary_line', {
          points: fmt(account.points_balance),
          tier: tLoyaltyTier(account.tier_label),
          cap: account.redemption_cap_percent,
          value: fmt(account.point_value_vnd),
        })}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={pointsText}
          onChangeText={v => {
            setPointsText(v.replace(/[^\d]/g, ''));
            if (error) setError(null);
          }}
          placeholder={t('loyalty_input.placeholder', { min: fmt(minRedeem) })}
          placeholderTextColor={COLORS.gray[400]}
          keyboardType="numeric"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: error ? COLORS.error : COLORS.gray[200],
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: fs(14),
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
            borderRadius: 14,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 92,
          }}
        >
          {apply.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13.5) }}>
              {t('loyalty_input.apply_btn')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={{ fontSize: fs(12.5), color: COLORS.error, fontWeight: '600' }}>{error}</Text>
      ) : null}
    </Card>
  );
}
