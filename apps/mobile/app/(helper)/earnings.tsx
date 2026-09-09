import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, SafeAreaView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { TrendingUp, ArrowDownCircle, Clock, CheckCircle, X } from 'lucide-react-native';
import { useWallet, useTransactions, useRequestWithdrawal, useHelperProfile } from '@/hooks/use-api';
import {
  Card, Button, COLORS, LoadingSpinner, Separator, PriceText, EmptyState,
} from '@/components/ui';
import dayjs from 'dayjs';

const TX_ICONS: Record<string, string> = {
  earning: '💰', payment: '💳', withdrawal: '📤', refund: '↩️',
};

const TX_COLORS: Record<string, string> = {
  earning: COLORS.success, withdrawal: COLORS.error, refund: COLORS.secondary, payment: COLORS.gray[700],
};

export default function HelperEarningsScreen() {
  const { data: wallet, isLoading } = useWallet();
  const { data: txData } = useTransactions(1);
  const { data: profile } = useHelperProfile();
  const withdraw = useRequestWithdrawal();

  const [showWithdraw, setShowWithdraw] = useState(false);
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
    if (amt < 50000) return;
    await withdraw.mutateAsync({
      amount: amt,
      bank_account: { bank_name: bankName, account_number: accountNumber, account_name: accountName },
    });
    setShowWithdraw(false);
    setAmount('');
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* ── Wallet header ──────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: COLORS.primary, paddingHorizontal: 24,
            paddingTop: 24, paddingBottom: 60,
            borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 4, fontWeight: '600' }}>
            Số dư khả dụng trong ví
          </Text>
          <PriceText amount={wallet?.balance ?? 0} size={36} color="#fff" />
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6, fontWeight: '500' }}>
            Tổng thu nhập đã nhận: {new Intl.NumberFormat('vi-VN').format(wallet?.total_earned ?? 0)}₫
          </Text>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: -28 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <TrendingUp size={22} color={COLORS.success} />
              <PriceText amount={wallet?.total_earned ?? 0} size={14} color={COLORS.gray[900]} />
              <Text style={{ fontSize: 11, color: COLORS.gray[500], textAlign: 'center', fontWeight: '600' }}>
                Tổng thu nhập
              </Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <ArrowDownCircle size={22} color={COLORS.secondary} />
              <PriceText amount={wallet?.total_withdrawn ?? 0} size={14} color={COLORS.gray[900]} />
              <Text style={{ fontSize: 11, color: COLORS.gray[500], textAlign: 'center', fontWeight: '600' }}>
                Đã rút về TK
              </Text>
            </Card>
          </View>
        </View>

        {/* ── Withdraw button ────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Button
            title="Rút tiền về tài khoản ngân hàng"
            variant={wallet?.balance >= 50000 ? 'primary' : 'secondary'}
            disabled={!wallet || wallet.balance < 50000}
            onPress={() => setShowWithdraw(true)}
            icon={<ArrowDownCircle size={18} color={wallet?.balance >= 50000 ? '#fff' : COLORS.gray[400]} />}
          />
          {wallet?.balance < 50000 && (
            <Text style={{ fontSize: 12, color: COLORS.gray[500], textAlign: 'center', marginTop: 8 }}>
              Số dư tối thiểu để rút tiền là 50,000₫
            </Text>
          )}
        </View>

        {/* ── Transactions ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 40 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900], marginBottom: 12 }}>
            Lịch sử biến động số dư
          </Text>

          {!txData?.transactions?.length ? (
            <EmptyState emoji="💸" title="Chưa có giao dịch nào" subtitle="Các khoản thu nhập nhận được từ công việc sẽ hiển thị tại đây" />
          ) : (
            <Card style={{ gap: 0 }}>
              {txData.transactions.map((tx: {
                _id: string; type: string; description: string;
                amount: number; status: string; created_at: string;
              }, i: number) => (
                <View key={tx._id}>
                  {i > 0 && <Separator my={0} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                    <View
                      style={{
                        width: 42, height: 42, borderRadius: 21,
                        backgroundColor: tx.type === 'earning' ? '#ECFDF5' : COLORS.gray[100],
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{TX_ICONS[tx.type] ?? '💳'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.gray[900] }}>
                        {tx.description}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                        {dayjs(tx.created_at).format('DD/MM/YYYY HH:mm')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontSize: 15, fontWeight: '800',
                        color: TX_COLORS[tx.type] ?? COLORS.gray[900],
                      }}>
                        {tx.type === 'earning' || tx.type === 'refund' ? '+' : '-'}
                        {new Intl.NumberFormat('vi-VN').format(tx.amount)}₫
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        {tx.status === 'success'
                          ? <CheckCircle size={12} color={COLORS.success} />
                          : <Clock size={12} color={COLORS.warning} />}
                        <Text style={{ fontSize: 11, color: COLORS.gray[400], fontWeight: '600' }}>
                          {tx.status === 'success' ? 'Thành công' : 'Đang xử lý'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      {/* ── Withdraw Modal ─────────────────────────────────────────────── */}
      <Modal visible={showWithdraw} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setShowWithdraw(false)}>
              <X size={24} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 12, color: COLORS.gray[900] }}>
              Rút tiền về tài khoản
            </Text>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              <Card style={{ backgroundColor: COLORS.primaryLight, gap: 6 }}>
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Số dư hiện tại</Text>
                <PriceText amount={wallet?.balance ?? 0} size={24} />
              </Card>

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>Số tiền rút (₫) *</Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 12,
                    padding: 14, fontSize: 22, fontWeight: '800', color: COLORS.gray[900],
                  }}
                  placeholder="Tối thiểu 50,000₫"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {[
                { label: 'Tên ngân hàng *', value: bankName, set: setBankName, placeholder: 'VD: Vietcombank, MB Bank' },
                { label: 'Số tài khoản *', value: accountNumber, set: setAccountNumber, placeholder: 'VD: 0123456789' },
                { label: 'Tên chủ tài khoản (in hoa) *', value: accountName, set: setAccountName, placeholder: 'VD: NGUYEN VAN A' },
              ].map(f => (
                <View key={f.label} style={{ gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.gray[700] }}>{f.label}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 12,
                      padding: 14, fontSize: 15, color: COLORS.gray[900],
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
                disabled={!amount || Number(amount) < 50000 || !bankName || !accountNumber || !accountName}
                onPress={handleWithdraw}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
