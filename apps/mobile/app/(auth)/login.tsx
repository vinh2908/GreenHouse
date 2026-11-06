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
import { useTranslation } from '@/hooks/use-i18n';
import { useLogin, useForgotPassword, useResetPassword } from '@/hooks/use-api';
import { VIETNAMESE_PHONE_REGEX } from '@homemate/utils';
import { Button, Input, COLORS, useThemeColors } from '@/components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
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
      const emptyMsg =
        lang === 'en'
          ? 'Please enter phone number or email and password'
          : 'Vui lòng nhập số điện thoại hoặc email và mật khẩu';
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

      Toast.show({
        type: 'success',
        text1:
          lang === 'en'
            ? `Welcome ${user.full_name ?? ''}!`
            : `Xin chào ${user.full_name ?? 'bạn'}!`,
      });

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
        : dataMsg ||
          (lang === 'en'
            ? 'Incorrect phone number or password'
            : 'Số điện thoại hoặc mật khẩu không chính xác');
      setLoginError(msg);
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Login failed' : 'Đăng nhập thất bại',
        text2: msg,
      });
    }
  };

  const handleSendResetOtp = async () => {
    const cleanPhone = resetPhone.trim().replace(/\s+/g, '').replace(/^\+84/, '0');
    if (!VIETNAMESE_PHONE_REGEX.test(cleanPhone)) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please enter a valid 10-digit phone number'
            : 'Vui lòng nhập số điện thoại 10 số hợp lệ',
      });
      return;
    }
    try {
      await forgotPassword.mutateAsync(cleanPhone);
      setResetPhone(cleanPhone);
      setForgotStep('reset');
      Toast.show({
        type: 'success',
        text1: lang === 'en' ? 'Password reset OTP sent' : 'Đã gửi mã OTP đặt lại mật khẩu',
        text2:
          lang === 'en'
            ? 'Check your email inbox for the OTP code'
            : 'Kiểm tra hộp thư email của bạn để lấy mã OTP',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'en' ? 'Unable to send OTP at this time' : 'Không thể gửi OTP lúc này');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleConfirmResetPassword = async () => {
    if (resetOtp.trim().length !== 6) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Please enter 6-digit OTP' : 'Vui lòng nhập mã OTP gồm 6 chữ số',
      });
      return;
    }
    if (newPassword.trim().length < 8) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'New password must have at least 8 characters'
            : 'Mật khẩu mới phải có ít nhất 8 ký tự',
      });
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
        text1: lang === 'en' ? 'Password reset successful!' : 'Đặt lại mật khẩu thành công!',
        text2:
          lang === 'en'
            ? 'You can now log in with your new password'
            : 'Bạn có thể đăng nhập bằng mật khẩu mới',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'en' ? 'Invalid or expired OTP' : 'Mã OTP không đúng hoặc đã hết hạn');
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tc.surface,
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
                borderRadius: 14,
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
                style={{ width: 84, height: 84, borderRadius: 14 }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: fs(30),
                  fontWeight: '900',
                  color: COLORS.primary,
                  letterSpacing: -0.5,
                }}
              >
                GREEN
              </Text>
              <Text
                style={{
                  fontSize: fs(30),
                  fontWeight: '900',
                  color: tc.text,
                  letterSpacing: -0.5,
                }}
              >
                HOUSE
              </Text>
            </View>
            <Text
              style={{ fontSize: fs(14), color: tc.textMuted, marginTop: 4, fontWeight: '600' }}
            >
              {lang === 'en'
                ? 'Home Services & Professional Helpers 24/7'
                : 'Dịch vụ gia đình & Thợ chuyên nghiệp 24/7'}
            </Text>
          </View>

          {/* ── Form Inputs ────────────────────────────────────────────── */}
          <View style={{ gap: 14 }}>
            <Input
              label={lang === 'en' ? 'Phone Number or Email' : 'Số điện thoại hoặc Email'}
              placeholder={
                lang === 'en' ? 'Enter phone number or email' : 'Nhập SĐT hoặc email của bạn'
              }
              autoCapitalize="none"
              value={phone}
              onChangeText={setPhone}
              leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
            />
            <Input
              label={lang === 'en' ? 'Password' : 'Mật khẩu'}
              placeholder={lang === 'en' ? 'Enter password' : 'Nhập mật khẩu'}
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
              <Text style={{ color: COLORS.primary, fontSize: fs(13), fontWeight: '700' }}>
                {lang === 'en' ? 'Forgot password?' : 'Quên mật khẩu?'}
              </Text>
            </TouchableOpacity>

            {loginError && (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                  borderRadius: 8,
                  padding: 10,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    color: '#DC2626',
                    fontSize: fs(13),
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  {loginError}
                </Text>
              </View>
            )}

            <Button
              title={lang === 'en' ? 'Log in' : 'Đăng nhập'}
              loading={login.isPending}
              onPress={handleLogin}
              style={{ marginTop: 8 }}
            />
          </View>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: tc.border }} />
            <Text
              style={{
                marginHorizontal: 12,
                color: tc.textMuted,
                fontSize: fs(13),
                fontWeight: '500',
              }}
            >
              {lang === 'en' ? 'or' : 'hoặc'}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: tc.border }} />
          </View>

          {/* ── Register Link & Guest Mode ──────────────────────────────────────── */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}
          >
            <Text style={{ color: tc.textSecondary, fontSize: fs(14) }}>
              {lang === 'en' ? "Don't have an account?" : 'Chưa có tài khoản?'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: fs(14) }}>
                {lang === 'en' ? 'Register now' : 'Đăng ký ngay'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(customer)/home')}
            style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }}
          >
            <Text style={{ color: tc.textMuted, fontSize: fs(13), fontWeight: '700' }}>
              {lang === 'en' ? 'Skip, explore services now →' : 'Bỏ qua, khám phá dịch vụ ngay →'}
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
              backgroundColor: tc.surface,
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
                <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
                  {forgotStep === 'phone'
                    ? lang === 'en'
                      ? 'Forgot Password'
                      : 'Quên mật khẩu'
                    : lang === 'en'
                      ? 'Reset New Password'
                      : 'Đặt lại mật khẩu mới'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowForgotModal(false)}>
                <X size={22} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>

            {forgotStep === 'phone' ? (
              <>
                <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, lineHeight: 20 }}>
                  {lang === 'en'
                    ? 'Enter your registered phone number — the verification OTP will be sent to the email registered with this phone number.'
                    : 'Nhập số điện thoại đã đăng ký tài khoản — mã OTP sẽ được gửi tới email đã đăng ký với số điện thoại này.'}
                </Text>
                <Input
                  label={lang === 'en' ? 'Registered Phone Number *' : 'Số điện thoại đăng ký *'}
                  placeholder={lang === 'en' ? 'E.g. 0365290805' : 'VD: 0365290805'}
                  keyboardType="phone-pad"
                  value={resetPhone}
                  onChangeText={setResetPhone}
                  leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
                />
                <Button
                  title={lang === 'en' ? 'Send OTP code' : 'Gửi mã OTP'}
                  loading={forgotPassword.isPending}
                  onPress={handleSendResetOtp}
                />
              </>
            ) : (
              <>
                <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, lineHeight: 20 }}>
                  {lang === 'en' ? (
                    <>
                      Enter the 6-digit OTP sent to the email registered with{' '}
                      <Text style={{ fontWeight: '800' }}>{resetPhone}</Text> and your new password.
                    </>
                  ) : (
                    <>
                      Nhập mã OTP 6 chữ số đã gửi tới email đăng ký với số{' '}
                      <Text style={{ fontWeight: '800' }}>{resetPhone}</Text> và mật khẩu mới.
                    </>
                  )}
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
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontSize: fs(12.5), color: '#16A34A', fontWeight: '700' }}>
                      {lang === 'en'
                        ? 'Dev test OTP: 123456 (Tap to fill)'
                        : 'Mã OTP thử nghiệm (Dev): 123456 (Chạm để điền)'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Input
                  label={lang === 'en' ? 'OTP Code (6 digits) *' : 'Mã OTP (6 số) *'}
                  placeholder={lang === 'en' ? 'Enter 6-digit OTP' : 'Nhập 6 chữ số OTP'}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetOtp}
                  onChangeText={setResetOtp}
                />
                <Input
                  label={
                    lang === 'en'
                      ? 'New Password (min 8 characters) *'
                      : 'Mật khẩu mới (tối thiểu 8 ký tự) *'
                  }
                  placeholder={lang === 'en' ? 'Enter new password' : 'Nhập mật khẩu mới'}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title={lang === 'en' ? 'Back' : 'Quay lại'}
                    variant="outline"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    onPress={() => setForgotStep('phone')}
                  />
                  <Button
                    title={lang === 'en' ? 'Confirm Reset' : 'Xác nhận đổi'}
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
