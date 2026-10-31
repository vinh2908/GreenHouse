import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth.store';
import { useHelperProfile, useUpdateBankAccount, useTransactions } from '@/hooks/use-api';
import { Button, Card, LoadingSpinner, COLORS, Separator, EmptyState } from '@/components/ui';

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

const CUSTOMER_PAYMENT_OPTIONS = [
  {
    id: 'vietqr',
    title: 'Chuyển khoản ngân hàng 24/7 (VietQR)',
    subtitle: 'Quét mã QR thanh toán nhanh sau khi nghiệm thu công việc',
    badge: 'Khuyên dùng',
  },
  {
    id: 'momo',
    title: 'Ví điện tử MoMo / ZaloPay',
    subtitle: 'Thanh toán không tiền mặt an toàn, tự động giữ tiền bảo đảm (Escrow)',
    badge: 'Miễn phí',
  },
  {
    id: 'cash',
    title: 'Tiền mặt trực tiếp cho thợ',
    subtitle: 'Thanh toán trực tiếp sau khi kiểm tra chất lượng bàn giao',
    badge: 'Linh hoạt',
  },
];

export default function BankAccountScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
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
  const { data: txData, isLoading: txLoading } = useTransactions(1);
  const updateBank = useUpdateBankAccount();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [preferredMethod, setPreferredMethod] = useState('vietqr');

  const currentBank = profile?.bank_account;

  useEffect(() => {
    if (currentBank) {
      setBankName(currentBank.bank_name || '');
      setAccountNumber(currentBank.account_number || '');
      setAccountName(currentBank.account_name || '');
    }
  }, [currentBank]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
  };

  const handleSave = async () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng điền đầy đủ thông tin ngân hàng' });
      return;
    }
    if (accountNumber.trim().length < 6) {
      Toast.show({ type: 'error', text1: 'Số tài khoản ngân hàng không hợp lệ' });
      return;
    }

    try {
      await updateBank.mutateAsync({
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim().toUpperCase(),
      });
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật tài khoản thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  if (isHelper && isLoading) return <LoadingSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
          {isHelper ? 'Tài khoản ngân hàng liên kết' : 'Phương thức thanh toán & Ví'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {!isHelper ? (
        /* ── GIAO DIỆN DÀNH CHO KHÁCH HÀNG ────────────────────────────── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        >
          <Card style={{ backgroundColor: '#0F172A', padding: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={20} color="#34D399" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                Bảo vệ thanh toán Escrow 100%
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 }}>
              Bạn chỉ thanh toán sau khi thợ đã hoàn thành công việc, gửi ảnh/video nghiệm thu và
              bạn xác nhận hài lòng.
            </Text>
          </Card>

          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
            Phương thức thanh toán mặc định
          </Text>

          <View style={{ gap: 10 }}>
            {CUSTOMER_PAYMENT_OPTIONS.map(opt => {
              const selected = preferredMethod === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    setPreferredMethod(opt.id);
                    Toast.show({
                      type: 'success',
                      text1: 'Đã chọn phương thức mặc định',
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
                      <Text style={{ fontWeight: '800', fontSize: 14.5, color: COLORS.gray[900] }}>
                        {opt.title}
                      </Text>
                      {selected ? (
                        <Check size={18} color={COLORS.primary} />
                      ) : (
                        <Text
                          style={{
                            fontSize: 11,
                            color: COLORS.primary,
                            fontWeight: '700',
                          }}
                        >
                          {opt.badge}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 18 }}>
                      {opt.subtitle}
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900], marginTop: 6 }}>
            Lịch sử giao dịch gần đây
          </Text>

          {txLoading ? (
            <LoadingSpinner size="small" />
          ) : !txData?.transactions?.length ? (
            <Card>
              <EmptyState
                emoji="💳"
                title="Chưa có giao dịch thanh toán"
                subtitle="Các hóa đơn thanh toán công việc của bạn sẽ được lưu trữ tại đây."
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
                      <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.gray[900] }}>
                        {tx.description}
                      </Text>
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                      >
                        <Clock size={12} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                          {dayjs(tx.created_at).format('DD/MM/YYYY HH:mm')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontWeight: '800', fontSize: 14.5, color: COLORS.gray[900] }}>
                      {new Intl.NumberFormat('vi-VN').format(tx.amount)}₫
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
                borderRadius: 20,
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
                      fontSize: 16,
                      letterSpacing: 0.5,
                    }}
                  >
                    {bankName || 'NGÂN HÀNG LIÊN KẾT'}
                  </Text>
                </View>
                {currentBank?.account_number && (
                  <View
                    style={{
                      backgroundColor: '#10B98133',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '800' }}>
                      ● ĐÃ LIÊN KẾT
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ marginVertical: 12 }}>
                <Text
                  style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}
                >
                  SỐ TÀI KHOẢN
                </Text>
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 20,
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
                  <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>
                    CHỦ TÀI KHOẢN
                  </Text>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 14,
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
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                Chọn ngân hàng thụ hưởng
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
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isSelected ? COLORS.primary : COLORS.gray[200],
                        backgroundColor: isSelected ? COLORS.primaryLight : '#fff',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
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
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                Thông tin tài khoản nhận tiền
              </Text>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Tên ngân hàng *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="VD: Vietcombank, MB Bank..."
                  value={bankName}
                  onChangeText={setBankName}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Số tài khoản ngân hàng *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 17,
                    fontWeight: '800',
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                    letterSpacing: 1,
                  }}
                  placeholder="Nhập số tài khoản ngân hàng"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Tên chủ tài khoản (in hoa, không dấu) *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    fontWeight: '800',
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="VD: NGUYEN VAN A"
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
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.secondary }}>
                  Bảo mật & Quy chuẩn rút tiền
                </Text>
              </View>
              <Text style={{ fontSize: 12.5, color: '#1E40AF', lineHeight: 18 }}>
                • Tên chủ tài khoản ngân hàng nên trùng khớp với họ tên đã xác minh trên CCCD
                (e-KYC) để quá trình rút tiền diễn ra tự động 24/7.{'\n'}• Tiền rút từ ví thu nhập
                sẽ được xử lý chuyển khoản liên ngân hàng nhanh chóng.
              </Text>
            </Card>

            <Button
              title={
                currentBank?.account_number
                  ? 'Cập nhật tài khoản ngân hàng'
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
    </View>
  );
}
