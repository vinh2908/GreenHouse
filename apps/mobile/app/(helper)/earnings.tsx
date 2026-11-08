import { useState, useEffect } from 'react';
import { formatDateTime, formatTime } from '@/utils/date-format';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle,
  X,
  CreditCard,
  Receipt,
  RotateCcw,
  DollarSign,
} from 'lucide-react-native';
import {
  useWallet,
  useTransactions,
  useRequestWithdrawal,
  useTopupWallet,
  useHelperProfile,
} from '@/hooks/use-api';
import {
  Card,
  Button,
  COLORS,
  LoadingSpinner,
  Separator,
  PriceText,
  EmptyState,
  ErrorState,
  useThemeColors,
} from '@/components/ui';
import dayjs from 'dayjs';
import { EarningsReport } from '@/components/helper/earnings-report';
import { useTranslation } from '@/hooks/use-i18n';

function renderTxIcon(type: string, size = 20) {
  switch (type) {
    case 'earning':
      return <TrendingUp size={size} color={COLORS.success} />;
    case 'topup':
      return <ArrowDownCircle size={size} color={COLORS.success} />;
    case 'payment':
      return <CreditCard size={size} color={COLORS.primary} />;
    case 'commission':
      return <Receipt size={size} color={COLORS.warning} />;
    case 'withdrawal':
      return <ArrowUpCircle size={size} color={COLORS.error} />;
    case 'refund':
      return <RotateCcw size={size} color={COLORS.secondary} />;
    default:
      return <CreditCard size={size} color={COLORS.gray[500]} />;
  }
}

const TX_COLORS: Record<string, string> = {
  earning: COLORS.success,
  topup: COLORS.success,
  commission: COLORS.warning,
  withdrawal: COLORS.error,
  refund: COLORS.secondary,
  payment: COLORS.gray[700],
};

export default function HelperEarningsScreen() {
  const router = useRouter();
  const { t, fs, lang, formatTxDesc } = useTranslation();
  const tc = useThemeColors();
  const { data: wallet, isLoading, isError: isWalletError, refetch: refetchWallet } = useWallet();
  const [txPage, setTxPage] = useState(1);
  const {
    data: txData,
    isLoading: isTxLoading,
    isError: isTxError,
    refetch: refetchTx,
    dataUpdatedAt: txUpdatedAt,
  } = useTransactions(txPage);
  // P2-20: accumulate loaded pages so entries beyond page 1 are reachable.
  const [allTxs, setAllTxs] = useState<any[]>([]);
  useEffect(() => {
    if (!txData?.transactions) return;
    setAllTxs(prev => {
      if (txPage === 1) return txData.transactions;
      const seen = new Set(prev.map((t: any) => t._id));
      return [...prev, ...txData.transactions.filter((t: any) => !seen.has(t._id))];
    });
  }, [txData, txPage]);
  const { data: profile } = useHelperProfile();
  const withdraw = useRequestWithdrawal();
  const topup = useTopupWallet();

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('200000');
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const currentBank = profile?.bank_account;

  useEffect(() => {
    if (currentBank) {
      if (currentBank.bank_name) setBankName(currentBank.bank_name);
      if (currentBank.account_number) setAccountNumber(currentBank.account_number);
      if (currentBank.account_name) setAccountName(currentBank.account_name);
    }
  }, [currentBank, showWithdraw]);

  const handleWithdraw = async () => {
    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt < 50000) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Minimum withdrawal amount is 50,000₫'
            : 'Số tiền rút tối thiểu là 50,000₫',
      });
      return;
    }
    if (wallet && amt > wallet.balance) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Insufficient balance' : 'Số dư không đủ',
        text2:
          lang === 'en'
            ? `Current wallet balance is: ${new Intl.NumberFormat('vi-VN').format(wallet.balance)}₫`
            : `Số dư ví hiện tại là: ${new Intl.NumberFormat('vi-VN').format(wallet.balance)}₫`,
      });
      return;
    }
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please fill in full bank account details'
            : 'Vui lòng điền đầy đủ thông tin tài khoản ngân hàng',
      });
      return;
    }

    // A91: Xác nhận trước khi rút tiền — hiện số tiền, phí, tài khoản nhận (đã che).
    const maskedAccount = `***${accountNumber.trim().slice(-4)}`;
    const amountText = `${new Intl.NumberFormat('vi-VN').format(amt)}₫`;
    Alert.alert(
      lang === 'en' ? 'Confirm withdrawal' : 'Xác nhận rút tiền',
      lang === 'en'
        ? `Withdraw ${amountText}, fee 0₫, to account ${maskedAccount} (${bankName.trim()})?`
        : `Rút ${amountText}, phí 0₫, về tài khoản ${maskedAccount} (${bankName.trim()})?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Hủy', style: 'cancel' },
        {
          text: lang === 'en' ? 'Confirm' : 'Xác nhận',
          onPress: () => void doWithdraw(amt),
        },
      ],
    );
  };

  const doWithdraw = async (amt: number) => {
    try {
      await withdraw.mutateAsync({
        amount: amt,
        bank_account: {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          account_name: accountName.trim().toUpperCase(),
        },
      });
      setShowWithdraw(false);
      setAmount('');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (lang === 'en' ? 'Withdrawal request failed' : 'Yêu cầu rút tiền thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleTopup = async () => {
    const amt = Number(topupAmount);
    if (!amt || isNaN(amt) || amt < 50000) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Minimum top-up amount is 50,000₫' : 'Số tiền nạp tối thiểu là 50,000₫',
      });
      return;
    }
    // A91: Xác nhận trước khi nạp tiền — hiện số tiền + phương thức.
    // P0-1: đây là nạp thử MÔ PHỎNG (chưa có cổng thanh toán thật) — không
    // có thanh toán thật, số dư rút được không thay đổi.
    Alert.alert(
      lang === 'en' ? 'Confirm demo top-up (simulation)' : 'Xác nhận nạp tiền mô phỏng',
      lang === 'en'
        ? `Record a demo top-up of ${new Intl.NumberFormat('vi-VN').format(amt)}₫? No real payment is made and your withdrawable balance does not change.`
        : `Ghi nhận nạp thử ${new Intl.NumberFormat('vi-VN').format(amt)}₫? Chưa có thanh toán thật, số dư rút được không thay đổi.`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Hủy', style: 'cancel' },
        {
          text: lang === 'en' ? 'Confirm' : 'Xác nhận',
          onPress: () => void doTopup(amt),
        },
      ],
    );
  };

  const doTopup = async (amt: number) => {
    try {
      await topup.mutateAsync({ amount: amt, payment_method: 'vietqr' });
      setShowTopup(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || (lang === 'en' ? 'Top-up failed' : 'Nạp tiền thất bại');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  if (isLoading) return <LoadingSpinner />;

  if (isWalletError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <ErrorState
          title={lang === 'en' ? 'Unable to load wallet data' : 'Không thể tải thông tin ví'}
          subtitle={
            lang === 'en'
              ? 'Could not connect to wallet service. Please retry.'
              : 'Không thể kết nối đến máy chủ quản lý ví. Vui lòng bấm thử lại.'
          }
          onRetry={() => {
            refetchWallet();
            refetchTx();
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── Wallet header (Safe Insets) ─────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.primary,
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top + 8, 24),
            paddingBottom: 60,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
          }}
        >
          <Text
            style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: fs(13),
              marginBottom: 4,
              fontWeight: '600',
            }}
          >
            {t('earn_wallet_balance_label')}
          </Text>
          <PriceText amount={wallet?.balance ?? 0} size={36} color="#fff" />
          {/* P0-1: demo credit is shown separately — it is NOT withdrawable. */}
          {(wallet?.simulated_balance ?? 0) > 0 && (
            <Text
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: fs(12),
                marginTop: 4,
                fontWeight: '600',
              }}
            >
              {lang === 'en'
                ? `Demo credit (simulation, not withdrawable): ${new Intl.NumberFormat('vi-VN').format(wallet.simulated_balance)}₫`
                : `Số dư mô phỏng (không rút được): ${new Intl.NumberFormat('vi-VN').format(wallet.simulated_balance)}₫`}
            </Text>
          )}
          <Text
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: fs(13),
              marginTop: 6,
              fontWeight: '500',
            }}
          >
            {t('earn_total_received')}{' '}
            {new Intl.NumberFormat('vi-VN').format(wallet?.total_earned ?? 0)}₫
          </Text>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: -28 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <TrendingUp size={22} color={COLORS.success} />
              <PriceText amount={wallet?.total_earned ?? 0} size={14} color={COLORS.gray[900]} />
              <Text
                style={{
                  fontSize: fs(11),
                  color: tc.textMuted,
                  textAlign: 'center',
                  fontWeight: '600',
                }}
              >
                {t('earn_total_income')}
              </Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <ArrowDownCircle size={22} color={COLORS.secondary} />
              <PriceText amount={wallet?.total_withdrawn ?? 0} size={14} color={COLORS.gray[900]} />
              <Text
                style={{
                  fontSize: fs(11),
                  color: tc.textMuted,
                  textAlign: 'center',
                  fontWeight: '600',
                }}
              >
                {t('earn_withdrawn')}
              </Text>
            </Card>
          </View>
        </View>

        {/* ── Top-up & Withdraw buttons ──────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={t('earn_topup_wallet')}
              variant="outline"
              fullWidth={false}
              style={{ flex: 1 }}
              onPress={() => setShowTopup(true)}
              icon={<ArrowUpCircle size={18} color={COLORS.primary} />}
            />
            <Button
              title={t('earn_withdraw_bank')}
              variant={wallet?.balance >= 50000 ? 'primary' : 'secondary'}
              fullWidth={false}
              style={{ flex: 1 }}
              disabled={!wallet || wallet.balance < 50000}
              onPress={() => setShowWithdraw(true)}
              icon={
                <ArrowDownCircle
                  size={18}
                  color={wallet?.balance >= 50000 ? '#fff' : COLORS.gray[400]}
                />
              }
            />
          </View>
          <Text
            style={{
              fontSize: fs(12),
              color: tc.textMuted,
              textAlign: 'center',
              lineHeight: 18,
            }}
          >
            {t('earn_note')}
          </Text>
        </View>

        {/* ── Earnings report (Feature 14) ───────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <EarningsReport />
        </View>

        {/* ── Transactions ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 40 }}>
          <Text
            style={{
              fontSize: fs(17),
              fontWeight: '800',
              color: tc.text,
              marginBottom: 12,
            }}
          >
            {t('earn_history_title')}
          </Text>
          {/* A97: Thời gian cập nhật lần cuối */}
          {txUpdatedAt ? (
            <Text style={{ fontSize: fs(11), color: tc.textMuted, marginBottom: 12 }}>
              {lang === 'en' ? 'Updated at' : 'Cập nhật lúc'} {formatTime(txUpdatedAt)}
            </Text>
          ) : null}

          {isTxError ? (
            <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
              <ErrorState
                title={
                  lang === 'en' ? 'Unable to load transactions' : 'Không thể tải lịch sử giao dịch'
                }
                subtitle={
                  lang === 'en'
                    ? 'Connection to server failed. Please check your network and retry.'
                    : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
                }
                onRetry={() => {
                  refetchWallet();
                  refetchTx();
                }}
              />
            </Card>
          ) : isTxLoading ? (
            <Card style={{ gap: 14, padding: 16 }}>
              {[1, 2, 3].map(i => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      backgroundColor: tc.border,
                    }}
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View
                      style={{
                        width: '70%',
                        height: 14,
                        borderRadius: 8,
                        backgroundColor: tc.border,
                      }}
                    />
                    <View
                      style={{
                        width: '40%',
                        height: 11,
                        borderRadius: 8,
                        backgroundColor: tc.subtle,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      width: 60,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: tc.border,
                    }}
                  />
                </View>
              ))}
            </Card>
          ) : !allTxs.length ? (
            <EmptyState
              icon={<CreditCard size={36} color={COLORS.gray[400]} />}
              title={t('earn_no_transactions')}
              subtitle={t('earn_no_transactions_sub')}
            />
          ) : (
            <Card style={{ gap: 0 }}>
              {allTxs.map(
                (
                  tx: {
                    _id: string;
                    type: string;
                    description: string;
                    amount: number;
                    status: string;
                    created_at: string;
                    job_id?: string | { _id?: string };
                    metadata?: { job_id?: string };
                  },
                  i: number,
                ) => {
                  const isCredit =
                    tx.type === 'earning' || tx.type === 'refund' || tx.type === 'topup';
                  // A93: Giao dịch có đơn liên quan thì bấm vào mở được đơn đó.
                  const txJobId: string | undefined =
                    (typeof tx.job_id === 'string' && tx.job_id) ||
                    (typeof tx.job_id === 'object' && tx.job_id?._id) ||
                    tx.metadata?.job_id;
                  return (
                    <View key={tx._id}>
                      {i > 0 && <Separator my={0} />}
                      <TouchableOpacity
                        activeOpacity={txJobId ? 0.7 : 1}
                        onPress={() => {
                          if (txJobId) router.push(`/helper-job-detail/${txJobId}` as never);
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingVertical: 14,
                          }}
                        >
                          <View
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 14,
                              backgroundColor: isCredit ? '#ECFDF5' : COLORS.gray[100],
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {renderTxIcon(tx.type, 20)}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', fontSize: fs(14), color: tc.text }}>
                              {formatTxDesc(tx.description)}
                            </Text>
                            <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
                              {formatDateTime(dayjs(tx.created_at))}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              style={{
                                fontSize: fs(15),
                                fontWeight: '800',
                                color: TX_COLORS[tx.type] ?? COLORS.gray[900],
                              }}
                            >
                              {isCredit ? '+' : '-'}
                              {new Intl.NumberFormat('vi-VN').format(tx.amount)}₫
                            </Text>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                marginTop: 2,
                              }}
                            >
                              {tx.status === 'success' ? (
                                <CheckCircle size={12} color={COLORS.success} />
                              ) : (
                                <Clock size={12} color={COLORS.warning} />
                              )}
                              <Text
                                style={{
                                  fontSize: fs(11),
                                  color: tc.textMuted,
                                  fontWeight: '600',
                                }}
                              >
                                {tx.status === 'success'
                                  ? lang === 'en'
                                    ? 'Success'
                                    : 'Thành công'
                                  : lang === 'en'
                                    ? 'Processing'
                                    : 'Đang xử lý'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                },
              )}
            </Card>
          )}
          {/* P2-20: load older transactions (server already paginates) */}
          {txData && txPage < (txData.total_pages ?? 1) && (
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isTxLoading}
              onPress={() => setTxPage(p => p + 1)}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tc.surface,
                borderWidth: 1,
                borderColor: tc.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: fs(14), color: COLORS.primary }}>
                {isTxLoading
                  ? lang === 'en'
                    ? 'Loading…'
                    : 'Đang tải…'
                  : lang === 'en'
                    ? 'Load more transactions'
                    : 'Xem thêm giao dịch'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── Top-up Deposit Wallet Modal ────────────────────────────────── */}
      <Modal visible={showTopup} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowTopup(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                marginLeft: 12,
                color: tc.text,
              }}
            >
              {t('earn_topup_title')}
            </Text>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
              <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                <Text style={{ fontSize: fs(13), color: COLORS.primaryDark, fontWeight: '800' }}>
                  {t('earn_current_balance')}
                </Text>
                <PriceText amount={wallet?.balance ?? 0} size={24} />
                <Text
                  style={{
                    fontSize: fs(12),
                    color: tc.textSecondary,
                    lineHeight: Math.round(fs(18)),
                  }}
                >
                  {lang === 'en'
                    ? 'Maintaining a wallet balance helps automatically settle platform fees when customers pay you in cash.'
                    : 'Duy trì số dư ví giúp tự động quyết toán phí nền tảng theo từng dịch vụ khi bạn nhận các đơn khách trả tiền mặt trực tiếp.'}
                </Text>
              </Card>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Quick select amount' : 'Chọn nhanh mệnh giá nạp'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {['100000', '200000', '500000', '1000000'].map(preset => (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setTopupAmount(preset)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: topupAmount === preset ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: topupAmount === preset ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          color: topupAmount === preset ? COLORS.primaryDark : COLORS.gray[700],
                        }}
                      >
                        {new Intl.NumberFormat('vi-VN').format(Number(preset))}₫
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Top-up amount (₫) *' : 'Số tiền nạp (₫) *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(22),
                    fontWeight: '800',
                    color: tc.text,
                  }}
                  placeholder={lang === 'en' ? 'Minimum 50,000₫' : 'Tối thiểu 50,000₫'}
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title={lang === 'en' ? 'Confirm VietQR Top-up' : 'Xác nhận nạp tiền qua VietQR'}
                loading={topup.isPending}
                onPress={handleTopup}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Withdraw Modal ─────────────────────────────────────────────── */}
      <Modal visible={showWithdraw} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowWithdraw(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                marginLeft: 12,
                color: tc.text,
              }}
            >
              {t('earn_withdraw_title')}
            </Text>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                <Text style={{ fontSize: fs(12), color: COLORS.primary, fontWeight: '600' }}>
                  {t('earn_current_balance_short')}
                </Text>
                <PriceText amount={wallet?.balance ?? 0} size={24} />
              </Card>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: tc.textSecondary }}>
                  {lang === 'en' ? 'Withdrawal amount (₫) *' : 'Số tiền rút (₫) *'}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: tc.border,
                    borderRadius: 14,
                    padding: 14,
                    fontSize: fs(22),
                    fontWeight: '800',
                    color: tc.text,
                  }}
                  placeholder={lang === 'en' ? 'Minimum 50,000₫' : 'Tối thiểu 50,000₫'}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {[
                {
                  label: lang === 'en' ? 'Bank name *' : 'Tên ngân hàng *',
                  value: bankName,
                  set: setBankName,
                  placeholder:
                    lang === 'en' ? 'E.g. Vietcombank, MB Bank' : 'VD: Vietcombank, MB Bank',
                },
                {
                  label: lang === 'en' ? 'Account number *' : 'Số tài khoản *',
                  value: accountNumber,
                  set: setAccountNumber,
                  placeholder: lang === 'en' ? 'E.g. 0123456789' : 'VD: 0123456789',
                },
                {
                  label:
                    lang === 'en'
                      ? 'Account holder name (uppercase) *'
                      : 'Tên chủ tài khoản (in hoa) *',
                  value: accountName,
                  set: setAccountName,
                  placeholder: lang === 'en' ? 'E.g. NGUYEN VAN A' : 'VD: NGUYEN VAN A',
                },
              ].map(f => (
                <View key={f.label} style={{ gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: tc.textSecondary }}>{f.label}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1.5,
                      borderColor: tc.border,
                      borderRadius: 14,
                      padding: 14,
                      fontSize: fs(15),
                      color: tc.text,
                    }}
                    placeholder={f.placeholder}
                    value={f.value}
                    onChangeText={f.set}
                    placeholderTextColor={COLORS.gray[400]}
                    autoCapitalize={
                      f.label.includes('chủ') || f.label.includes('holder') ? 'characters' : 'none'
                    }
                  />
                </View>
              ))}

              <Button
                title={lang === 'en' ? 'Confirm withdrawal request' : 'Xác nhận yêu cầu rút tiền'}
                loading={withdraw.isPending}
                disabled={
                  !amount || Number(amount) < 50000 || !bankName || !accountNumber || !accountName
                }
                onPress={handleWithdraw}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
