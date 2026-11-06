import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Clipboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ticket, Copy, Check, Clock, Sparkles } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useMyVouchers } from '@/hooks/use-api';
import { formatDate } from '@/utils/date-format';
import { useTranslation } from '@/hooks/use-i18n';
import { Card, COLORS, EmptyState, ErrorState, LoadingSpinner, Badge, useThemeColors } from '@/components/ui';
import { useState } from 'react';

export default function CustomerVouchersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang, formatVoucherDesc } = useTranslation();
  const tc = useThemeColors();
  const { data: vouchers, isLoading, isError, refetch } = useMyVouchers();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    Clipboard.setString(code);
    setCopiedCode(code);
    Toast.show({
      type: 'success',
      text1: t('voucher_copy_toast_title', { code }),
      text2: t('voucher_copy_toast_sub'),
    });
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 8, 16),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tc.background,
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
            {t('voucher_title')}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {t('home_vouchers_sub')}
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
        {isError ? (
          <ErrorState
            title={lang === 'en' ? 'Unable to load vouchers' : 'Không thể tải danh sách ưu đãi'}
            subtitle={
              lang === 'en'
                ? 'Could not connect to voucher service. Please check your network and retry.'
                : 'Không thể kết nối đến máy chủ ưu đãi. Vui lòng kiểm tra mạng và thử lại.'
            }
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : !vouchers?.length ? (
          <EmptyState
            icon={<Ticket size={36} color={COLORS.gray[400]} />}
            title={t('voucher_empty_title')}
            subtitle={t('voucher_empty_sub')}
          />
        ) : (
          vouchers.map((v: any) => {
            const isPercent = v.discount_type === 'percent';
            const discountLabel = isPercent
              ? lang === 'en'
                ? `${v.discount_value}% OFF`
                : `Giảm ${v.discount_value}%`
              : lang === 'en'
                ? `${new Intl.NumberFormat('en-US').format(v.discount_value)}₫ OFF`
                : `Giảm ${new Intl.NumberFormat('vi-VN').format(v.discount_value)}₫`;

            return (
              <Card
                key={v._id || v.code}
                style={{
                  padding: 16,
                  gap: 12,
                  borderWidth: 1.5,
                  borderColor: COLORS.primaryLight,
                  backgroundColor: tc.surface,
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
                        borderRadius: 14,
                        backgroundColor: COLORS.primaryLight,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ticket size={22} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}
                      >
                        {discountLabel}
                      </Text>
                      <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 18 }}>
                        {formatVoucherDesc(v)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Điều kiện & Hạn sử dụng */}
                <View
                  style={{
                    padding: 10,
                    backgroundColor: tc.background,
                    borderRadius: 8,
                    gap: 6,
                  }}
                >
                  {v.min_order_amount > 0 && (
                    <Text style={{ fontSize: fs(12), color: tc.textSecondary }}>
                      • {lang === 'en' ? 'Min order: ' : 'Đơn tối thiểu: '}
                      <Text style={{ fontWeight: '700' }}>
                        {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                          v.min_order_amount,
                        )}
                        ₫
                      </Text>
                    </Text>
                  )}
                  {v.max_discount_amount && isPercent && (
                    <Text style={{ fontSize: fs(12), color: tc.textSecondary }}>
                      • {lang === 'en' ? 'Max discount: ' : 'Giảm tối đa: '}
                      <Text style={{ fontWeight: '700' }}>
                        {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                          v.max_discount_amount,
                        )}
                        ₫
                      </Text>
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} color={COLORS.gray[500]} />
                    <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                      {lang === 'en' ? 'Expires: ' : 'Hết hạn: '}
                      {v.valid_to || v.end_date || (v as any).expires_at
                        ? formatDate(v.valid_to || v.end_date || (v as any).expires_at)
                        : lang === 'en'
                          ? 'No expiration'
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
                        fontSize: fs(14),
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
                      borderRadius: 8,
                    }}
                  >
                    {copiedCode === v.code ? (
                      <>
                        <Check size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(12) }}>
                          {t('voucher_copied')}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Copy size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(12) }}>
                          {t('voucher_copy')}
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
