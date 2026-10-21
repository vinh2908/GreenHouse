import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TicketPercent, X } from 'lucide-react-native';
import { useValidateVoucher, type VoucherPreview } from '@/hooks/use-api';
import { Card, COLORS } from '@/components/ui';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/**
 * Nhập + kiểm tra mã giảm giá (Roadmap Phase 1).
 * - Khi có `estimatedAmount`: hiển thị số tiền giảm tạm tính trên giá trị đó.
 * - Số giảm CHÍNH THỨC được API tính lại trên giá chốt của đơn lúc thanh toán.
 */
export function VoucherInput({
  estimatedAmount,
  value,
  preview,
  onApplied,
  onCleared,
}: {
  estimatedAmount?: number;
  value: string;
  preview: VoucherPreview | null;
  onApplied: (code: string, preview: VoucherPreview) => void;
  onCleared: () => void;
}) {
  const [code, setCode] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const validate = useValidateVoucher();

  const handleApply = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Vui lòng nhập mã giảm giá');
      return;
    }
    setError(null);
    try {
      const result = await validate.mutateAsync({
        code: trimmed,
        amount: estimatedAmount ?? 0,
      });
      onApplied(result.code, result);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Mã giảm giá không hợp lệ');
      onCleared();
    }
  };

  const handleClear = () => {
    setCode('');
    setError(null);
    onCleared();
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TicketPercent size={19} color={COLORS.primaryDark} />
        <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
          Mã giảm giá
        </Text>
      </View>

      {preview ? (
        <View
          style={{
            backgroundColor: COLORS.successLight,
            borderRadius: 12,
            padding: 12,
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontWeight: '800', fontSize: 14.5, color: '#065F46' }}>
              🎟️ {preview.code} —{' '}
              {preview.discount_type === 'percent'
                ? `giảm ${preview.discount_value}%`
                : `giảm ${fmt(preview.discount_value)}₫`}
              {preview.discount_type === 'percent' && preview.max_discount_amount
                ? ` (tối đa ${fmt(preview.max_discount_amount)}₫)`
                : ''}
            </Text>
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={17} color="#065F46" />
            </TouchableOpacity>
          </View>
          {preview.discount_amount > 0 ? (
            <Text style={{ fontSize: 13, color: '#065F46' }}>
              Giảm tạm tính: −{fmt(preview.discount_amount)}₫
              {estimatedAmount ? ` · Cần thanh toán khoảng ${fmt(preview.final_amount)}₫` : ''}
            </Text>
          ) : (
            <Text style={{ fontSize: 12.5, color: '#065F46' }}>
              Mã hợp lệ. Số tiền giảm chính thức sẽ được tính theo giá chốt khi thanh toán.
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={v => {
                setCode(v.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="Nhập mã (VD: GIAM10)"
              placeholderTextColor={COLORS.gray[400]}
              autoCapitalize="characters"
              autoCorrect={false}
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
              disabled={validate.isPending}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 92,
              }}
            >
              {validate.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>Áp dụng</Text>
              )}
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={{ fontSize: 12.5, color: COLORS.error, fontWeight: '600' }}>{error}</Text>
          ) : (
            <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
              Số tiền giảm chính thức được tính theo giá chốt của đơn khi thanh toán.
            </Text>
          )}
        </>
      )}
    </Card>
  );
}
