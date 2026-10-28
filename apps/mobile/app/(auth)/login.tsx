import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock, Eye, EyeOff, X, KeyRound } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useLogin, useForgotPassword, useResetPassword } from '@/hooks/use-api';
import { Button, Input, COLORS } from '@/components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const login = useLogin();
  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPassword();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ── Forgot Password Modal States ──────────────────────────────────────────
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'phone' | 'reset'>('phone');
  const [resetPhone, setResetPhone] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogin = async () => {
    setLoginError(null);
    const identifier = phone.trim();
    if (!identifier || !password.trim()) {
      const emptyMsg = 'Vui lòng nhập số điện thoại hoặc email và mật khẩu';
      setLoginError(emptyMsg);
      Toast.show({ type: 'error', text1: emptyMsg });
      return;
    }
    const cleanIdentifier = identifier.includes('@')
      ? identifier.toLowerCase()
      : identifier.replace(/\s+/g, '').replace(/^\+84/, '0');

    try {
      const { data } = await login.mutateAsync({ phone: cleanIdentifier, password });
      const { access_token, refresh_token, user } = data.data;
      await setAuth(user, access_token, refresh_token);

      Toast.show({ type: 'success', text1: `Xin chào ${user.full_name ?? 'bạn'}!` });

      // Redirect by active role
      if (user.active_role === 'helper') {
        router.replace('/(helper)/dashboard');
      } else {
        router.replace('/(customer)/home');
      }
    } catch (err: unknown) {
      const dataMsg = (err as any)?.response?.data?.message;
      const msg = Array.isArray(dataMsg)
        ? dataMsg[0]
        : dataMsg || 'Số điện thoại hoặc mật khẩu không chính xác';
      setLoginError(msg);
      Toast.show({ type: 'error', text1: 'Đăng nhập thất bại', text2: msg });
    }
  };

  const handleSendResetOtp = async () => {
    const cleanPhone = resetPhone.trim().replace(/\s+/g, '').replace(/^\+84/, '0');
    if (!/^(0[3|5|7|8|9])+([0-9]{8})$/.test(cleanPhone)) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập số điện thoại 10 số hợp lệ' });
      return;
    }
    try {
      await forgotPassword.mutateAsync(cleanPhone);
      setResetPhone(cleanPhone);
      setForgotStep('reset');
      Toast.show({
        type: 'success',
        text1: 'Đã gửi mã OTP đặt lại mật khẩu',
        text2: 'Kiểm tra tin nhắn điện thoại của bạn',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Không thể gửi OTP lúc này';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleConfirmResetPassword = async () => {
    if (resetOtp.trim().length !== 6) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập mã OTP gồm 6 chữ số' });
      return;
    }
    if (newPassword.trim().length < 8) {
      Toast.show({ type: 'error', text1: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
      return;
    }
    try {
      await resetPassword.mutateAsync({
        phone: resetPhone,
        otp: resetOtp.trim(),
        new_password: newPassword,
      });
      setShowForgotModal(false);
      setForgotStep('phone');
      setPhone(resetPhone);
      setPassword(newPassword);
      setResetOtp('');
      setNewPassword('');
      Toast.show({
        type: 'success',
        text1: 'Đặt lại mật khẩu thành công!',
        text2: 'Bạn có thể đăng nhập bằng mật khẩu mới',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Mã OTP không đúng hoặc đã hết hạn';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Brand Logo & Header ────────────────────────────────────── */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 24,
                backgroundColor: '#F0FDF4',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 4,
              }}
            >
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 84, height: 84, borderRadius: 24 }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: '900',
                  color: COLORS.primary,
                  letterSpacing: -0.5,
                }}
              >
                GREEN
              </Text>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: '900',
                  color: COLORS.gray[900],
                  letterSpacing: -0.5,
                }}
              >
                HOUSE
              </Text>
            </View>
            <Text
              style={{ fontSize: 14, color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}
            >
              Dịch vụ gia đình & Thợ chuyên nghiệp 24/7
            </Text>
          </View>

          {/* ── Form Inputs ────────────────────────────────────────────── */}
          <View style={{ gap: 14 }}>
            <Input
              label="Số điện thoại hoặc Email"
              placeholder="Nhập SĐT hoặc email của bạn"
              autoCapitalize="none"
              value={phone}
              onChangeText={setPhone}
              leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
            />
            <Input
              label="Mật khẩu"
              placeholder="Nhập mật khẩu"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={18} color={COLORS.gray[400]} />
                  ) : (
                    <Eye size={18} color={COLORS.gray[400]} />
                  )}
                </TouchableOpacity>
              }
            />

            <TouchableOpacity
              onPress={() => {
                setResetPhone(phone.includes('@') ? '' : phone);
                setForgotStep('phone');
                setShowForgotModal(true);
              }}
              style={{ alignSelf: 'flex-end', marginTop: -2 }}
            >
              <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>
                Quên mật khẩu?
              </Text>
            </TouchableOpacity>

            {loginError && (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    color: '#DC2626',
                    fontSize: 13,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  ⚠️ {loginError}
                </Text>
              </View>
            )}

            <Button
              title="Đăng nhập"
              loading={login.isPending}
              onPress={handleLogin}
              style={{ marginTop: 8 }}
            />
          </View>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.gray[200] }} />
            <Text
              style={{
                marginHorizontal: 12,
                color: COLORS.gray[400],
                fontSize: 13,
                fontWeight: '500',
              }}
            >
              hoặc
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.gray[200] }} />
          </View>

          {/* ── Register Link & Guest Mode ──────────────────────────────────────── */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}
          >
            <Text style={{ color: COLORS.gray[600], fontSize: 14 }}>Chưa có tài khoản?</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                Đăng ký ngay
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(customer)/home')}
            style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }}
          >
            <Text style={{ color: COLORS.gray[500], fontSize: 13, fontWeight: '700' }}>
              Bỏ qua, khám phá dịch vụ ngay →
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal Quên Mật Khẩu & Đặt Lại Mật Khẩu ─────────────────────────── */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForgotModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(17,24,39,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom + 16, 28),
              gap: 16,
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
                <KeyRound size={20} color={COLORS.primary} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
                  {forgotStep === 'phone' ? 'Quên mật khẩu' : 'Đặt lại mật khẩu mới'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowForgotModal(false)}>
                <X size={22} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>

            {forgotStep === 'phone' ? (
              <>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                  Nhập số điện thoại đã đăng ký tài khoản để nhận mã xác thực OTP đặt lại mật khẩu.
                </Text>
                <Input
                  label="Số điện thoại đăng ký *"
                  placeholder="VD: 0901234567"
                  keyboardType="phone-pad"
                  value={resetPhone}
                  onChangeText={setResetPhone}
                  leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
                />
                <Button
                  title="Gửi mã OTP"
                  loading={forgotPassword.isPending}
                  onPress={handleSendResetOtp}
                />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                  Nhập mã OTP 6 chữ số đã gửi tới{' '}
                  <Text style={{ fontWeight: '800' }}>{resetPhone}</Text> và mật khẩu mới.
                </Text>
                {__DEV__ && (
                  <TouchableOpacity
                    onPress={() => setResetOtp('123456')}
                    style={{
                      backgroundColor: '#F0FDF4',
                      borderColor: '#86EFAC',
                      borderWidth: 1,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ fontSize: 12.5, color: '#16A34A', fontWeight: '700' }}>
                      💡 Mã OTP thử nghiệm (Dev): 123456 (Chạm để điền)
                    </Text>
                  </TouchableOpacity>
                )}
                <Input
                  label="Mã OTP (6 số) *"
                  placeholder="Nhập 6 chữ số OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetOtp}
                  onChangeText={setResetOtp}
                />
                <Input
                  label="Mật khẩu mới (tối thiểu 8 ký tự) *"
                  placeholder="Nhập mật khẩu mới"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title="Quay lại"
                    variant="outline"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    onPress={() => setForgotStep('phone')}
                  />
                  <Button
                    title="Xác nhận đổi"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    loading={resetPassword.isPending}
                    onPress={handleConfirmResetPassword}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
