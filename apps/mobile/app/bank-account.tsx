import { useState, useEffect } from 'react';
import { formatDateTime } from '@/utils/date-format';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Check,
  Clock,
  PlusCircle,
  X,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHelperProfile,
  useUpdateBankAccount,
  useTransactions,
  useWallet,
  useTopupWallet,
} from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Button, Card, LoadingSpinner, COLORS, Separator, EmptyState, useThemeColors } from '@/components/ui';

const POPULAR_BANKS = [
  { code: 'VCB', name: 'Vietcombank', shortName: 'VCB' },
  { code: 'MB', name: 'MB Bank (Quân Đội)', shortName: 'MB' },
  { code: 'TCB', name: 'Techcombank', shortName: 'TCB' },
  { code: 'CTG', name: 'VietinBank', shortName: 'CTG' },
  { code: 'BIDV', name: 'BIDV', shortName: 'BIDV' },
  { code: 'ACB', name: 'ACB (Á Châu)', shortName: 'ACB' },
  { code: 'VPB', name: 'VPBank', shortName: 'VPB' },
  { code: 'TPB', name: 'TPBank', shortName: 'TPB' },
];

export default function BankAccountScreen() {
  const router = useRouter();
  const { t, fs, lang, formatTxDesc } = useTranslation();
  const tc = useThemeColors();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const customerPaymentOptions = [
    {
      id: 'vietqr',
      title: lang === 'en' ? '24/7 Bank Transfer (VietQR)' : 'Chuyển khoản ngân hàng 24/7 (VietQR)',
      subtitle:
        lang === 'en'
          ? 'Scan QR code for quick payment after job completion'
          : 'Quét mã QR thanh toán nhanh sau khi nghiệm thu công việc',
      badge: lang === 'en' ? 'Recommended' : 'Khuyên dùng',
    },
    {
      id: 'momo',
      title: lang === 'en' ? 'E-Wallet (MoMo / ZaloPay)' : 'Ví điện tử MoMo / ZaloPay',
      subtitle:
        lang === 'en'
          ? 'Safe cashless payment with automatic Escrow protection'
          : 'Thanh toán không tiền mặt an toàn, tự động giữ tiền bảo đảm (Escrow)',
      badge: lang === 'en' ? 'Free' : 'Miễn phí',
    },
    {
      id: 'cash',
      title: lang === 'en' ? 'Direct Cash to Helper' : 'Tiền mặt trực tiếp cho thợ',
      subtitle:
        lang === 'en'
          ? 'Pay cash directly upon inspection and handover'
          : 'Thanh toán trực tiếp sau khi kiểm tra chất lượng bàn giao',
      badge: lang === 'en' ? 'Flexible' : 'Linh hoạt',
    },
  ];
  const { user } = useAuthStore();
  const searchRole =
    typeof globalThis !== 'undefined' && (globalThis as any).location?.search
      ? new URLSearchParams((globalThis as any).location.search).get('role')
      : null;
  const localRole =
    typeof globalThis !== 'undefined'
      ? (globalThis as any).localStorage?.getItem('homemate_active_role')
      : null;
  const isHelper =
    role === 'helper' ||
    searchRole === 'helper' ||
    (role !== 'customer' &&
      searchRole !== 'customer' &&
      (user?.active_role === 'helper' ||
        (!user?.active_role &&
          (localRole === 'helper' ||
            (Array.isArray(user?.roles) && (user.roles as any[]).includes('helper'))))));

  const { data: profile, isLoading, refetch } = useHelperProfile();
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useTransactions(1);
  const { data: wallet, isLoading: isWalletLoading, refetch: refetchWallet } = useWallet();
  const topup = useTopupWallet();
  const updateBank = useUpdateBankAccount();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [preferredMethod, setPreferredMethod] = useState('vietqr');
  const [showCustomerTopup, setShowCustomerTopup] = useState(false);
  const [customerTopupAmount, setCustomerTopupAmount] = useState('100000');

  const currentBank = profile?.bank_account;

  useEffect(() => {
    if (currentBank) {
      setBankName(currentBank.bank_name || '');
      setAccountNumber(currentBank.account_number || '');
      setAccountName(currentBank.account_name || '');
    }
  }, [currentBank]);

  const handleCustomerTopup = async () => {
    const num = Number(customerTopupAmount.replace(/\D/g, ''));
    if (isNaN(num) || num < 50000) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Minimum top-up amount is 50,000₫'
            : 'Số tiền nạp tối thiểu là 50.000₫',
      });
      return;
    }
    try {
      await topup.mutateAsync({ amount: num, payment_method: 'vietqr' });
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'Wallet top-up successful!' : 'Nạp tiền vào ví thành công!',
        text2:
          lang === 'en'
            ? `+${num.toLocaleString('en-US')}₫ added to your balance`
            : `+${num.toLocaleString('vi-VN')}₫ đã được cộng vào ví`,
      });
      setShowCustomerTopup(false);
      setCustomerTopupAmount('100000');
      refetchWallet();
      refetchTx();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1:
          err?.response?.data?.message ||
          (lang === 'en' ? 'Top-up failed' : 'Nạp tiền thất bại'),
      });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
  };

  const handleSave = async () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please fill in all bank details'
            : 'Vui lòng điền đầy đủ thông tin ngân hàng',
      });
      return;
    }
    if (accountNumber.trim().length < 6) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Invalid bank account number' : 'Số tài khoản ngân hàng không hợp lệ',
      });
      return;
    }

    try {
      await updateBank.mutateAsync({
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim().toUpperCase(),
      });
      Toast.show({
        type: 'success',
        text1:
          lang === 'en' ? 'Bank account updated successfully' : 'Cập nhật tài khoản thành công',
      });
      refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (lang === 'en' ? 'Failed to update bank account' : 'Cập nhật tài khoản thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  if (isHelper && isLoading) return <LoadingSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
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
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
          {isHelper
            ? lang === 'en'
              ? 'Linked Bank Account'
              : 'Tài khoản ngân hàng liên kết'
            : lang === 'en'
              ? 'Payment Methods & Wallet'
              : 'Phương thức thanh toán & Ví'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {!isHelper ? (
        /* ── GIAO DIỆN DÀNH CHO KHÁCH HÀNG ────────────────────────────── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        >
          {/* Customer Wallet Balance Card */}
          <Card
            style={{
              backgroundColor: '#0F172A',
              padding: 20,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <WalletIcon size={16} color="#38BDF8" />
                  <Text style={{ color: '#94A3B8', fontSize: fs(12.5), fontWeight: '700' }}>
                    {lang === 'en' ? 'GreenHouse Wallet Balance' : 'Số dư ví GreenHouse'}
                  </Text>
                </View>
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: fs(24),
                    fontWeight: '900',
                    marginTop: 2,
                    letterSpacing: 0.5,
                  }}
                >
                  {isWalletLoading
                    ? '...'
                    : `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(wallet?.balance ?? 0)}₫`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowCustomerTopup(true)}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <PlusCircle size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13.5) }}>
                  {lang === 'en' ? 'Top up' : 'Nạp tiền'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          <Card style={{ backgroundColor: '#1E293B', padding: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={20} color="#34D399" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(15) }}>
                {lang === 'en' ? '100% Escrow Payment Protection' : 'Bảo vệ thanh toán Escrow 100%'}
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: fs(13), lineHeight: 19 }}>
              {lang === 'en'
                ? 'You only pay after the helper completes the job, submits completion photos/videos, and you confirm your satisfaction.'
                : 'Bạn chỉ thanh toán sau khi thợ đã hoàn thành công việc, gửi ảnh/video nghiệm thu và bạn xác nhận hài lòng.'}
            </Text>
          </Card>

          <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Default Payment Method' : 'Phương thức thanh toán mặc định'}
          </Text>

          <View style={{ gap: 10 }}>
            {customerPaymentOptions.map(opt => {
              const selected = preferredMethod === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    setPreferredMethod(opt.id);
                    Toast.show({
                      type: 'success',
                      text1:
                        lang === 'en' ? 'Default method selected' : 'Đã chọn phương thức mặc định',
                      text2: opt.title,
                    });
                  }}
                >
                  <Card
                    style={{
                      borderWidth: 2,
                      borderColor: selected ? COLORS.primary : COLORS.gray[200],
                      backgroundColor: selected ? COLORS.primaryLight : '#fff',
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{ fontWeight: '800', fontSize: fs(14.5), color: tc.text }}
                      >
                        {opt.title}
                      </Text>
                      {selected ? (
                        <Check size={18} color={COLORS.primary} />
                      ) : (
                        <Text
                          style={{
                            fontSize: fs(11),
                            color: COLORS.primary,
                            fontWeight: '700',
                          }}
                        >
                          {opt.badge}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, lineHeight: 18 }}>
                      {opt.subtitle}
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text
            style={{ fontSize: fs(15), fontWeight: '800', color: tc.text, marginTop: 6 }}
          >
            {lang === 'en' ? 'Recent Transactions' : 'Lịch sử giao dịch gần đây'}
          </Text>

          {txLoading ? (
            <LoadingSpinner size="small" />
          ) : !txData?.transactions?.length ? (
            <Card>
              <EmptyState
                icon={<CreditCard size={36} color={COLORS.gray[400]} />}
                title={lang === 'en' ? 'No transactions yet' : 'Chưa có giao dịch thanh toán'}
                subtitle={
                  lang === 'en'
                    ? 'Your job payment receipts and history will appear here.'
                    : 'Các hóa đơn thanh toán công việc của bạn sẽ được lưu trữ tại đây.'
                }
              />
            </Card>
          ) : (
            <Card style={{ gap: 0 }}>
              {txData.transactions.map((tx: any, i: number) => (
                <View key={tx._id}>
                  {i > 0 && <Separator my={0} />}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 12,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text
                        style={{ fontWeight: '700', fontSize: fs(14), color: tc.text }}
                      >
                        {formatTxDesc(tx.description)}
                      </Text>
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                      >
                        <Clock size={12} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
                          {formatDateTime(dayjs(tx.created_at))}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{ fontWeight: '800', fontSize: fs(14.5), color: tc.text }}
                    >
                      {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(tx.amount)}₫
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      ) : (
        /* ── GIAO DIỆN DÀNH CHO THỢ (LIÊN KẾT NGÂN HÀNG RÚT TIỀN) ───────── */
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
          >
            <View
              style={{
                backgroundColor: '#1E293B',
                borderRadius: 14,
                padding: 22,
                minHeight: 180,
                justifyContent: 'space-between',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 8,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={22} color="#38BDF8" />
                  <Text
                    style={{
                      color: '#F8FAFC',
                      fontWeight: '800',
                      fontSize: fs(16),
                      letterSpacing: 0.5,
                    }}
                  >
                    {bankName || (lang === 'en' ? 'LINKED BANK' : 'NGÂN HÀNG LIÊN KẾT')}
                  </Text>
                </View>
                {currentBank?.account_number && (
                  <View
                    style={{
                      backgroundColor: '#10B98133',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#34D399', fontSize: fs(11), fontWeight: '800' }}>
                      {lang === 'en' ? '● LINKED' : '● ĐÃ LIÊN KẾT'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ marginVertical: 12 }}>
                <Text
                  style={{
                    color: '#94A3B8',
                    fontSize: fs(11),
                    fontWeight: '600',
                    letterSpacing: 1,
                  }}
                >
                  {lang === 'en' ? 'ACCOUNT NUMBER' : 'SỐ TÀI KHOẢN'}
                </Text>
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: fs(20),
                    fontWeight: '900',
                    letterSpacing: 2,
                    marginTop: 4,
                  }}
                >
                  {accountNumber
                    ? accountNumber.replace(/(\d{4})/g, '$1 ').trim()
                    : '•••• •••• •••• ••••'}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}
              >
                <View>
                  <Text style={{ color: '#94A3B8', fontSize: fs(10), fontWeight: '600' }}>
                    {lang === 'en' ? 'ACCOUNT HOLDER' : 'CHỦ TÀI KHOẢN'}
                  </Text>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: fs(14),
                      fontWeight: '800',
                      marginTop: 2,
                      letterSpacing: 0.5,
                    }}
                  >
                    {accountName ? accountName.toUpperCase() : 'NGUYEN VAN A'}
                  </Text>
                </View>
                <ShieldCheck size={26} color="#38BDF8" />
              </View>
            </View>

            <Card style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontSize: fs(14), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Select Beneficiary Bank' : 'Chọn ngân hàng thụ hưởng'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {POPULAR_BANKS.map(bank => {
                  const isSelected =
                    bankName.toLowerCase().includes(bank.name.toLowerCase()) ||
                    bankName === bank.name;
                  return (
                    <TouchableOpacity
                      key={bank.code}
                      activeOpacity={0.75}
                      onPress={() => setBankName(bank.name)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: isSelected ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: isSelected ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs(12.5),
                          fontWeight: '700',
                          color: isSelected ? COLORS.primary : COLORS.gray[700],
                        }}
                      >
                        {bank.shortName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

            <Card style={{ padding: 16, gap: 14 }}>
              <Text style={{ fontSize: fs(15), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Receiving Bank Account Details' : 'Thông tin tài khoản nhận tiền'}
              </Text>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Bank name *' : 'Tên ngân hàng *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(15),
                    color: tc.text,
                    backgroundColor: tc.background,
                  }}
                  placeholder={
                    lang === 'en' ? 'e.g. Vietcombank, MB Bank...' : 'VD: Vietcombank, MB Bank...'
                  }
                  value={bankName}
                  onChangeText={setBankName}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Bank account number *' : 'Số tài khoản ngân hàng *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(17),
                    fontWeight: '800',
                    color: tc.text,
                    backgroundColor: tc.background,
                    letterSpacing: 1,
                  }}
                  placeholder={
                    lang === 'en' ? 'Enter bank account number' : 'Nhập số tài khoản ngân hàng'
                  }
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en'
                    ? 'Account holder name (UPPERCASE, unaccented) *'
                    : 'Tên chủ tài khoản (in hoa, không dấu) *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(15),
                    fontWeight: '800',
                    color: tc.text,
                    backgroundColor: tc.background,
                  }}
                  placeholder={lang === 'en' ? 'e.g. NGUYEN VAN A' : 'VD: NGUYEN VAN A'}
                  value={accountName}
                  onChangeText={text => setAccountName(text.toUpperCase())}
                  autoCapitalize="characters"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>
            </Card>

            <Card
              style={{
                backgroundColor: '#EFF6FF',
                borderWidth: 1.5,
                borderColor: '#BFDBFE',
                padding: 14,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Lock size={16} color={COLORS.secondary} />
                <Text style={{ fontSize: fs(13.5), fontWeight: '800', color: COLORS.secondary }}>
                  {lang === 'en' ? 'Security & Payout Rules' : 'Bảo mật & Quy chuẩn rút tiền'}
                </Text>
              </View>
              <Text style={{ fontSize: fs(12.5), color: '#1E40AF', lineHeight: 18 }}>
                {lang === 'en'
                  ? `• The bank account holder name should match your verified ID (e-KYC) for 24/7 automated payouts.\n• Payouts from your earnings wallet are processed quickly via interbank transfer.`
                  : `• Tên chủ tài khoản ngân hàng nên trùng khớp với họ tên đã xác minh trên CCCD (e-KYC) để quá trình rút tiền diễn ra tự động 24/7.\n• Tiền rút từ ví thu nhập sẽ được xử lý chuyển khoản liên ngân hàng nhanh chóng.`}
              </Text>
            </Card>

            <Button
              title={
                currentBank?.account_number
                  ? lang === 'en'
                    ? 'Update Bank Account'
                    : 'Cập nhật tài khoản ngân hàng'
                  : lang === 'en'
                    ? 'Save & Link Account'
                    : 'Lưu & Liên kết tài khoản'
              }
              loading={updateBank.isPending}
              onPress={handleSave}
              icon={<CheckCircle2 size={18} color="#fff" />}
              style={{ marginTop: 4 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Customer Top-up Modal ─────────────────────────────────── */}
      <Modal
        visible={showCustomerTopup}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerTopup(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: tc.surface,
            paddingTop: Math.max(insets.top, 16),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: tc.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowCustomerTopup(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={COLORS.gray[700]} />
              </TouchableOpacity>
              <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Top-up GreenHouse Wallet' : 'Nạp tiền vào ví GreenHouse'}
              </Text>
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}
              keyboardShouldPersistTaps="handled"
            >
              <Card style={{ backgroundColor: COLORS.primaryLight, padding: 16, gap: 6 }}>
                <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, fontWeight: '600' }}>
                  {lang === 'en' ? 'Current Balance' : 'Số dư hiện tại'}
                </Text>
                <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.primary }}>
                  {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(
                    wallet?.balance ?? 0,
                  )}₫
                </Text>
              </Card>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: fs(14), color: tc.text }}>
                  {lang === 'en' ? 'Select quick amount' : 'Chọn nhanh số tiền nạp'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['50000', '100000', '200000', '500000', '1000000'].map(preset => {
                    const isSelected = customerTopupAmount === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        activeOpacity={0.8}
                        onPress={() => setCustomerTopupAmount(preset)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: isSelected ? COLORS.primary : COLORS.gray[200],
                          backgroundColor: isSelected ? COLORS.primaryLight : '#fff',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(13),
                            fontWeight: '700',
                            color: isSelected ? COLORS.primaryDark : COLORS.gray[700],
                          }}
                        >
                          {new Intl.NumberFormat('vi-VN').format(Number(preset))}₫
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: fs(14), color: tc.text }}>
                  {lang === 'en' ? 'Or enter custom amount (₫) *' : 'Hoặc nhập số tiền khác (₫) *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(20),
                    fontWeight: '800',
                    color: tc.text,
                    backgroundColor: tc.background,
                  }}
                  placeholder={lang === 'en' ? 'Minimum 50,000₫' : 'Tối thiểu 50.000₫'}
                  value={customerTopupAmount}
                  onChangeText={setCustomerTopupAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Card style={{ backgroundColor: '#F8FAFC', padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color={COLORS.success} />
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.text }}>
                    {lang === 'en' ? 'VietQR 24/7 Fast Top-up' : 'Nạp nhanh qua VietQR 24/7'}
                  </Text>
                </View>
                <Text style={{ fontSize: fs(12), color: tc.textSecondary, lineHeight: 18 }}>
                  {lang === 'en'
                    ? 'Funds are added immediately to your wallet to pay for services seamlessly.'
                    : 'Tiền sẽ được cộng tức thì vào ví để bạn sẵn sàng thanh toán dịch vụ tiện lợi.'}
                </Text>
              </Card>

              <Button
                title={lang === 'en' ? 'Confirm Top-up' : 'Xác nhận nạp tiền'}
                loading={topup.isPending}
                onPress={handleCustomerTopup}
                icon={<CheckCircle2 size={18} color="#fff" />}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
