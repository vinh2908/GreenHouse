import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Clipboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ticket, Copy, Check, Clock, Sparkles } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import { useMyVouchers } from '@/hooks/use-api';
import { Card, COLORS, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import { useState } from 'react';

export default function CustomerVouchersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: vouchers, isLoading, refetch } = useMyVouchers();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    Clipboard.setString(code);
    setCopiedCode(code);
    Toast.show({
      type: 'success',
      text1: `Đã sao chép mã "${code}"`,
      text2: 'Dán mã vào ô Voucher khi tạo hoặc thanh toán đơn hàng.',
    });
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 8, 16),
          paddingBottom: 14,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: COLORS.gray[50],
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
            Voucher của tôi
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Mã ưu đãi & giảm giá dịch vụ khả dụng
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : !vouchers?.length ? (
          <EmptyState
            emoji="🎟️"
            title="Chưa có mã giảm giá nào"
            subtitle="Các chương trình khuyến mãi và ưu đãi dành riêng cho bạn sẽ hiển thị tại đây khi hệ thống phát hành."
          />
        ) : (
          vouchers.map((v: any) => {
            const isPercent = v.discount_type === 'percent';
            const discountLabel = isPercent
              ? `Giảm ${v.discount_value}%`
              : `Giảm ${new Intl.NumberFormat('vi-VN').format(v.discount_value)}₫`;

            return (
              <Card
                key={v._id || v.code}
                style={{
                  padding: 16,
                  gap: 12,
                  borderWidth: 1.5,
                  borderColor: COLORS.primaryLight,
                  backgroundColor: '#fff',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: COLORS.primaryLight,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ticket size={22} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                        {discountLabel}
                      </Text>
                      {v.description && (
                        <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 18 }}>
                          {v.description}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Điều kiện & Hạn sử dụng */}
                <View
                  style={{
                    padding: 10,
                    backgroundColor: COLORS.gray[50],
                    borderRadius: 10,
                    gap: 6,
                  }}
                >
                  {v.min_order_amount > 0 && (
                    <Text style={{ fontSize: 12, color: COLORS.gray[700] }}>
                      • Đơn tối thiểu:{' '}
                      <Text style={{ fontWeight: '700' }}>
                        {new Intl.NumberFormat('vi-VN').format(v.min_order_amount)}₫
                      </Text>
                    </Text>
                  )}
                  {v.max_discount_amount && isPercent && (
                    <Text style={{ fontSize: 12, color: COLORS.gray[700] }}>
                      • Giảm tối đa:{' '}
                      <Text style={{ fontWeight: '700' }}>
                        {new Intl.NumberFormat('vi-VN').format(v.max_discount_amount)}₫
                      </Text>
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} color={COLORS.gray[500]} />
                    <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                      Hết hạn:{' '}
                      {v.valid_to || v.end_date || (v as any).expires_at
                        ? dayjs(v.valid_to || v.end_date || (v as any).expires_at).format('DD/MM/YYYY')
                        : 'Không thời hạn'}
                    </Text>
                  </View>
                </View>

                {/* Mã Voucher + Nút sao chép */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 4,
                  }}
                >
                  <View
                    style={{
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: COLORS.primary,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: COLORS.primaryLight,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: '800',
                        fontSize: 14,
                        color: COLORS.primaryDark,
                        letterSpacing: 1,
                      }}
                    >
                      {v.code}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleCopy(v.code)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: copiedCode === v.code ? COLORS.success : COLORS.primary,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                    }}
                  >
                    {copiedCode === v.code ? (
                      <>
                        <Check size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          Đã chép
                        </Text>
                      </>
                    ) : (
                      <>
                        <Copy size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          Sao chép
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
