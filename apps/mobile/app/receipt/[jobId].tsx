import React from 'react';
import { formatDateTime } from '@/utils/date-format';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ShieldCheck,
  Calendar,
  User,
  CreditCard,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';
import { useJobDetail, useJobContract } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { downloadInvoicePdf } from '@/services/invoice.service';
import {
  Button,
  Card,
  LoadingSpinner,
  COLORS,
  Separator,
  PriceText,
  useThemeColors,
} from '@/components/ui';

export default function ReceiptScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();

  const { data: job, isLoading: jobLoading } = useJobDetail(jobId);
  const { data: contract, isLoading: contractLoading } = useJobContract(jobId);

  if (jobLoading || contractLoading) {
    return <LoadingSpinner />;
  }

  if (!job) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20, padding: 20 }]}>
        <Text style={{ fontSize: fs(16), color: tc.textSecondary, textAlign: 'center' }}>
          {lang === 'en' ? 'Job receipt not found.' : 'Không tìm thấy biên lai đơn hàng.'}
        </Text>
      </View>
    );
  }

  const helper = typeof job.helper_id === 'object' ? job.helper_id : null;
  const customer = typeof job.customer_id === 'object' ? job.customer_id : null;

  const baseLabor =
    contract?.labor_cost ?? job.labor_cost ?? job.total_price ?? job.fixed_price ?? 0;
  const materialsCost = contract?.materials_cost ?? job.materials_cost ?? 0;
  const sosSurcharge = job.sos_surcharge ?? 0;
  const discountAmount = job.discount_amount ?? 0;
  const loyaltyDiscount = job.loyalty_discount_amount ?? 0;
  const basePrice =
    contract?.total_price ??
    job.total_price ??
    job.fixed_price ??
    baseLabor + materialsCost + sosSurcharge;
  const netPaid = Math.max(0, basePrice - discountAmount - loyaltyDiscount);

  const paymentMethodLabel = (() => {
    switch (job.payment_method) {
      case 'wallet':
        return lang === 'en' ? 'GreenHouse Escrow Wallet' : 'Ví ký quỹ GreenHouse';
      case 'momo':
        return lang === 'en' ? 'MoMo / ZaloPay' : 'Ví điện tử MoMo / ZaloPay';
      case 'vietqr':
        return lang === 'en' ? 'Bank Transfer (VietQR)' : 'Chuyển khoản VietQR';
      case 'cash':
        return lang === 'en' ? 'Direct Cash' : 'Tiền mặt trực tiếp';
      default:
        return lang === 'en' ? 'Electronic Payment' : 'Thanh toán điện tử';
    }
  })();

  const handleDownloadPdf = async () => {
    try {
      await downloadInvoicePdf(jobId);
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'Receipt downloaded' : 'Đã tải biên lai thành công',
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Failed to download receipt' : 'Không thể tải biên lai',
      });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: fs(18) }]}>
          {lang === 'en' ? 'Payment Receipt' : 'Biên lai thanh toán'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Receipt Card */}
        <View style={styles.receiptCard}>
          {/* Top Brand Banner */}
          <View style={styles.brandBanner}>
            <View style={styles.successIcon}>
              <CheckCircle2 size={32} color="#10B981" />
            </View>
            <Text style={[styles.brandName, { fontSize: fs(20) }]}>GREENHOUSE</Text>
            <Text style={[styles.brandSubtitle, { fontSize: fs(12) }]}>
              {lang === 'en'
                ? 'Official Electronic Payment Receipt'
                : 'Biên lai thanh toán điện tử chính thức'}
            </Text>
            <View style={styles.paidBadge}>
              <ShieldCheck size={14} color="#059669" />
              <Text style={[styles.paidBadgeText, { fontSize: fs(11) }]}>
                {lang === 'en' ? 'ESCROW SETTLED & VERIFIED' : 'ĐÃ QUYẾT TOÁN ESCROW'}
              </Text>
            </View>
          </View>

          {/* Amount Box */}
          <View style={styles.amountBox}>
            <Text style={[styles.amountLabel, { fontSize: fs(13) }]}>
              {lang === 'en' ? 'Total Amount Paid' : 'Tổng số tiền đã thanh toán'}
            </Text>
            <PriceText amount={netPaid} size={28} color={COLORS.primaryDark} />
            <Text style={[styles.paymentMethodText, { fontSize: fs(12) }]}>
              {paymentMethodLabel}
            </Text>
          </View>

          <Separator my={16} />

          {/* Details list */}
          <View style={styles.detailsList}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Receipt ID' : 'Mã biên lai'}
              </Text>
              <Text style={[styles.detailValMono, { fontSize: fs(13) }]}>
                #{job.code || String(job._id).slice(-8).toUpperCase()}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Service / Job' : 'Dịch vụ'}
              </Text>
              <Text style={[styles.detailVal, { fontSize: fs(13) }]} numberOfLines={2}>
                {job.title}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Customer' : 'Khách hàng'}
              </Text>
              <Text style={[styles.detailVal, { fontSize: fs(13) }]}>
                {customer?.full_name || (lang === 'en' ? 'Customer' : 'Khách hàng')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Service Partner' : 'Thợ thực hiện'}
              </Text>
              <Text style={[styles.detailVal, { fontSize: fs(13) }]}>
                {helper?.full_name || (lang === 'en' ? 'GreenHouse Partner' : 'Thợ đối tác')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Settlement Time' : 'Thời gian quyết toán'}
              </Text>
              <Text style={[styles.detailVal, { fontSize: fs(13) }]}>
                {formatDateTime(dayjs(job.updated_at || job.created_at))}
              </Text>
            </View>

            <Separator my={12} />

            {/* Breakdown */}
            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                {lang === 'en' ? 'Base Labor Cost' : 'Tiền công thợ'}
              </Text>
              <PriceText amount={baseLabor} size={13} color={COLORS.gray[800]} bold={false} />
            </View>

            {materialsCost > 0 && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                  {lang === 'en' ? 'Materials Cost' : 'Chi phí vật tư'}
                </Text>
                <PriceText amount={materialsCost} size={13} color={COLORS.gray[800]} bold={false} />
              </View>
            )}

            {sosSurcharge > 0 && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { fontSize: fs(13) }]}>
                  {lang === 'en' ? 'SOS Emergency Surcharge' : 'Phụ phí khẩn cấp SOS'}
                </Text>
                <PriceText amount={sosSurcharge} size={13} color={COLORS.gray[800]} bold={false} />
              </View>
            )}

            {discountAmount > 0 && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { fontSize: fs(13), color: COLORS.success }]}>
                  {lang === 'en' ? 'Voucher Discount' : 'Giảm giá Voucher'}
                </Text>
                <Text style={{ fontSize: fs(13), color: COLORS.success, fontWeight: '700' }}>
                  -{new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(discountAmount)}
                  ₫
                </Text>
              </View>
            )}

            {loyaltyDiscount > 0 && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { fontSize: fs(13), color: COLORS.success }]}>
                  {lang === 'en' ? 'Loyalty Points Discount' : 'Giảm điểm thưởng'}
                </Text>
                <Text style={{ fontSize: fs(13), color: COLORS.success, fontWeight: '700' }}>
                  -
                  {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(loyaltyDiscount)}
                  ₫
                </Text>
              </View>
            )}
          </View>

          {/* Footer stamp */}
          <View style={styles.stampFooter}>
            <Text style={[styles.stampText, { fontSize: fs(11) }]}>
              {lang === 'en'
                ? 'Thank you for choosing GreenHouse. This electronic receipt is stored on your permanent ledger.'
                : 'Cảm ơn quý khách đã tin dùng dịch vụ GreenHouse. Biên lai này được lưu vết bền vững trên hệ thống.'}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            title={lang === 'en' ? 'Download PDF Receipt' : 'Tải biên lai PDF'}
            variant="outline"
            icon={<Download size={18} color={COLORS.primary} />}
            onPress={handleDownloadPdf}
          />
          <Button
            title={lang === 'en' ? 'Back to Job Details' : 'Quay lại chi tiết đơn'}
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  brandBanner: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 16,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  brandName: {
    fontWeight: '900',
    color: '#10B981',
    letterSpacing: 1,
  },
  brandSubtitle: {
    color: '#6B7280',
    fontWeight: '500',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginTop: 6,
  },
  paidBadgeText: {
    fontWeight: '800',
    color: '#059669',
  },
  amountBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  amountLabel: {
    color: '#6B7280',
    fontWeight: '600',
  },
  paymentMethodText: {
    color: '#4B5563',
    fontWeight: '500',
  },
  detailsList: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailKey: {
    color: '#6B7280',
    fontWeight: '500',
  },
  detailVal: {
    fontWeight: '700',
    maxWidth: '60%',
    textAlign: 'right',
  },
  detailValMono: {
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  stampFooter: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
  },
  stampText: {
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
  },
  actions: {
    gap: 10,
  },
});
