import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Building2,
  User,
  Hash,
  Lock,
  Check,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useHelperProfile, useUpdateBankAccount } from '@/hooks/use-api';
import { Button, Card, LoadingSpinner, COLORS, Separator, Input } from '@/components/ui';

// Danh sách ngân hàng phổ biến tại Việt Nam
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
  const { data: profile, isLoading, refetch } = useHelperProfile();
  const updateBank = useUpdateBankAccount();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const currentBank = profile?.bank_account;

  useEffect(() => {
    if (currentBank) {
      setBankName(currentBank.bank_name || '');
      setAccountNumber(currentBank.account_number || '');
      setAccountName(currentBank.account_name || '');
    }
  }, [currentBank]);

  if (isLoading) return <LoadingSpinner />;

  const { user } = useAuthStore();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/profile' : '/(customer)/profile');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
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
          Tài khoản ngân hàng liên kết
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        >
          {/* ── 1. Thẻ ATM mô phỏng thực tế (Card Visualizer) ──────────── */}
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
            {/* Top row */}
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
                  style={{ color: '#F8FAFC', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 }}
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

            {/* Chip icon & Card number */}
            <View style={{ marginVertical: 12 }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>
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

            {/* Bottom row */}
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

          {/* ── 2. Danh sách chọn nhanh ngân hàng ──────────────────────── */}
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

          {/* ── 3. Form nhập thông tin ngân hàng ───────────────────────── */}
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

          {/* ── 4. Lưu ý bảo mật & Rút tiền ───────────────────────────── */}
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
              • Tên chủ tài khoản ngân hàng nên trùng khớp với họ tên đã xác minh trên CCCD (e-KYC)
              để quá trình rút tiền diễn ra tự động 24/7.{'\n'}• Tiền rút từ ví thu nhập sẽ được xử
              lý chuyển khoản liên ngân hàng nhanh chóng.
            </Text>
          </Card>

          {/* ── 5. Nút Lưu tài khoản ───────────────────────────────────── */}
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
    </SafeAreaView>
  );
}
