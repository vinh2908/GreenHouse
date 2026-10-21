import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle,
  X,
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
} from '@/components/ui';
import dayjs from 'dayjs';
import { EarningsReport } from '@/components/helper/earnings-report';
import { useTranslation } from '@/hooks/use-i18n';

const TX_ICONS: Record<string, string> = {
  earning: '💰',
  topup: '📥',
  payment: '💳',
  commission: '🧾',
  withdrawal: '📤',
  refund: '↩️',
};

const TX_COLORS: Record<string, string> = {
  earning: COLORS.success,
  topup: COLORS.success,
  commission: COLORS.warning,
  withdrawal: COLORS.error,
  refund: COLORS.secondary,
  payment: COLORS.gray[700],
};

export default function HelperEarningsScreen() {
  const { t, fs } = useTranslation();
  const { data: wallet, isLoading } = useWallet();
  const { data: txData } = useTransactions(1);
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
      Toast.show({ type: 'error', text1: 'Số tiền rút tối thiểu là 50,000₫' });
      return;
    }
    if (wallet && amt > wallet.balance) {
      Toast.show({
        type: 'error',
        text1: 'Số dư không đủ',
        text2: `Số dư ví hiện tại là: ${new Intl.NumberFormat('vi-VN').format(wallet.balance)}₫`,
      });
      return;
    }
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng điền đầy đủ thông tin tài khoản ngân hàng' });
      return;
    }

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
      const msg = err?.response?.data?.message || 'Yêu cầu rút tiền thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleTopup = async () => {
    const amt = Number(topupAmount);
    if (!amt || isNaN(amt) || amt < 50000) {
      Toast.show({ type: 'error', text1: 'Số tiền nạp tối thiểu là 50,000₫' });
      return;
    }
    try {
      await topup.mutateAsync({ amount: amt, payment_method: 'vietqr' });
      setShowTopup(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Nạp tiền thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  if (isLoading) return <LoadingSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
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
              fontSize: 13,
              marginBottom: 4,
              fontWeight: '600',
            }}
          >
            {t('earn_wallet_balance_label')}
          </Text>
          <PriceText amount={wallet?.balance ?? 0} size={36} color="#fff" />
          <Text
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: 13,
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
                  fontSize: 11,
                  color: COLORS.gray[500],
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
                  fontSize: 11,
                  color: COLORS.gray[500],
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
            style={{ fontSize: 12, color: COLORS.gray[500], textAlign: 'center', lineHeight: 18 }}
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
            style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900], marginBottom: 12 }}
          >
            {t('earn_history_title')}
          </Text>

          {!txData?.transactions?.length ? (
            <EmptyState
              emoji="💸"
              title={t('earn_no_transactions')}
              subtitle={t('earn_no_transactions_sub')}
            />
          ) : (
            <Card style={{ gap: 0 }}>
              {txData.transactions.map(
                (
                  tx: {
                    _id: string;
                    type: string;
                    description: string;
                    amount: number;
                    status: string;
                    created_at: string;
                  },
                  i: number,
                ) => {
                  const isCredit =
                    tx.type === 'earning' || tx.type === 'refund' || tx.type === 'topup';
                  return (
                    <View key={tx._id}>
                      {i > 0 && <Separator my={0} />}
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
                            borderRadius: 21,
                            backgroundColor: isCredit ? '#ECFDF5' : COLORS.gray[100],
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>{TX_ICONS[tx.type] ?? '💳'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontWeight: '700', fontSize: 14, color: COLORS.gray[900] }}
                          >
                            {tx.description}
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                            {dayjs(tx.created_at).format('DD/MM/YYYY HH:mm')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              fontSize: 15,
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
                              style={{ fontSize: 11, color: COLORS.gray[400], fontWeight: '600' }}
                            >
                              {tx.status === 'success' ? 'Thành công' : 'Đang xử lý'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                },
              )}
            </Card>
          )}
        </View>
      </ScrollView>

      {/* ── Top-up Deposit Wallet Modal ────────────────────────────────── */}
      <Modal visible={showTopup} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowTopup(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}
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
                <Text style={{ fontSize: 13, color: COLORS.primaryDark, fontWeight: '800' }}>
                  {t('earn_current_balance')}
                </Text>
                <PriceText amount={wallet?.balance ?? 0} size={24} />
                <Text style={{ fontSize: 12, color: COLORS.gray[700], lineHeight: 18 }}>
                  Duy trì số dư ví giúp tự động quyết toán phí nền tảng (15%) khi bạn nhận các đơn
                  khách trả tiền mặt trực tiếp.
                </Text>
              </Card>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Chọn nhanh mệnh giá nạp
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {['100000', '200000', '500000', '1000000'].map(preset => (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setTopupAmount(preset)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
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
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Số tiền nạp (₫) *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 22,
                    fontWeight: '800',
                    color: COLORS.gray[900],
                  }}
                  placeholder="Tối thiểu 50,000₫"
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <Button
                title="Xác nhận nạp tiền qua VietQR"
                loading={topup.isPending}
                onPress={handleTopup}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Withdraw Modal ─────────────────────────────────────────────── */}
      <Modal visible={showWithdraw} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowWithdraw(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}
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
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>
                  {t('earn_current_balance_short')}
                </Text>
                <PriceText amount={wallet?.balance ?? 0} size={24} />
              </Card>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>
                  Số tiền rút (₫) *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 22,
                    fontWeight: '800',
                    color: COLORS.gray[900],
                  }}
                  placeholder="Tối thiểu 50,000₫"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {[
                {
                  label: 'Tên ngân hàng *',
                  value: bankName,
                  set: setBankName,
                  placeholder: 'VD: Vietcombank, MB Bank',
                },
                {
                  label: 'Số tài khoản *',
                  value: accountNumber,
                  set: setAccountNumber,
                  placeholder: 'VD: 0123456789',
                },
                {
                  label: 'Tên chủ tài khoản (in hoa) *',
                  value: accountName,
                  set: setAccountName,
                  placeholder: 'VD: NGUYEN VAN A',
                },
              ].map(f => (
                <View key={f.label} style={{ gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>{f.label}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1.5,
                      borderColor: COLORS.gray[200],
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      color: COLORS.gray[900],
                    }}
                    placeholder={f.placeholder}
                    value={f.value}
                    onChangeText={f.set}
                    placeholderTextColor={COLORS.gray[400]}
                    autoCapitalize={f.label.includes('chủ') ? 'characters' : 'none'}
                  />
                </View>
              ))}

              <Button
                title="Xác nhận yêu cầu rút tiền"
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
