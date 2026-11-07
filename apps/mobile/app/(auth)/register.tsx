import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock, User, Eye, EyeOff, ArrowLeft, Mail } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { useRegister } from '@/hooks/use-api';
import { mapAuthErrorMessage } from '@/services/i18n';
import { VIETNAMESE_PHONE_REGEX } from '@homemate/utils';
import { Button, Input, COLORS, useThemeColors } from '@/components/ui';

export default function RegisterScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const register = useRegister();
  const setAuth = useAuthStore(s => s.setAuth);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleRegister = async () => {
    const cleanPhone = phone.trim().replace(/\s+/g, '').replace(/^\+84/, '0');
    const cleanEmail = email.trim().toLowerCase();
    if (!fullName.trim() || !cleanPhone || !cleanEmail || !password.trim()) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Please fill in all information' : 'Vui lòng điền đầy đủ thông tin',
      });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Invalid email format' : 'Email không đúng định dạng',
      });
      return;
    }
    // P2-23: kiểm tra định dạng SĐT phía client (cùng regex với server +
    // modal quên mật khẩu) thay vì đợi submit rồi mới bị server từ chối.
    if (!VIETNAMESE_PHONE_REGEX.test(cleanPhone)) {
      Toast.show({
        type: 'error',
        text1: t('auth_err_invalid_phone'),
      });
      return;
    }
    if (password !== confirmPassword) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en' ? 'Confirmation password does not match' : 'Mật khẩu xác nhận không khớp',
      });
      return;
    }
    if (password.length < 8) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Password must have at least 8 characters'
            : 'Mật khẩu phải có ít nhất 8 ký tự',
      });
      return;
    }
    try {
      const res = await register.mutateAsync({
        phone: cleanPhone,
        email: cleanEmail,
        full_name: fullName.trim(),
        password,
      });
      const data = res.data?.data;
      // G5 (F16): chỉ báo "đã gửi mã" khi gửi thật thành công. API trả lỗi rõ
      // khi gửi mail OTP thất bại (prod) nên 2xx = mail đã được gửi. Nếu API
      // trả cờ trạng thái gửi mail thì tôn trọng cờ đó, không báo gửi giả.
      const otpSentFlag =
        (data as any)?.email_otp_sent ?? (data as any)?.otp_sent ?? (data as any)?.otpSent;
      if (otpSentFlag === false) {
        Toast.show({
          type: 'error',
          text1:
            lang === 'en'
              ? 'Could not send the verification code to your email. Please try again.'
              : 'Không gửi được mã xác minh đến email của bạn. Vui lòng thử lại.',
        });
        return;
      }
      if (data?.access_token && data?.user) {
        await setAuth(data.user, data.access_token, data.refresh_token);
        Toast.show({
          type: 'success',
          text1: lang === 'en' ? 'Registration successful!' : 'Đăng ký thành công!',
          text2:
            lang === 'en'
              ? 'A verification code has been sent to your email'
              : 'Mã xác minh OTP đã được gửi đến email của bạn',
        });
        router.replace({
          pathname: '/(auth)/otp',
          params: { email: cleanEmail, phone: cleanPhone },
        });
      } else {
        // Phản hồi đăng ký không đầy đủ (không có token): không báo thành công giả.
        Toast.show({
          type: 'error',
          text1:
            lang === 'en'
              ? 'Registration failed. Please try again.'
              : 'Đăng ký không thành công. Vui lòng thử lại.',
        });
      }
    } catch (err: unknown) {
      const responseData = (err as any)?.response?.data;
      const rawMsg = responseData?.message;
      const firstMsg = Array.isArray(rawMsg) ? rawMsg[0] : rawMsg;
      // P2-16: dịch message backend sang tiếng Anh khi ở chế độ English
      const displayMsg =
        mapAuthErrorMessage(firstMsg, lang) ||
        (lang === 'en' ? 'Registration failed' : 'Đăng ký không thành công');
      Toast.show({ type: 'error', text1: displayMsg });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/login');
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.surface }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header (Safe Insets) */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: Math.max(insets.top + 6, 18),
              paddingBottom: 16,
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
            <Text
              style={{
                fontSize: fs(18),
                fontWeight: '800',
                color: tc.text,
                marginLeft: 12,
              }}
            >
              {lang === 'en' ? 'Create New Account' : 'Tạo tài khoản mới'}
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
            <Text
              style={{
                fontSize: fs(14),
                color: tc.textMuted,
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              {lang === 'en'
                ? 'A single account to book services or earn income as a helper.'
                : 'Một tài khoản duy nhất để đặt dịch vụ hoặc nhận việc kiếm thêm thu nhập.'}
            </Text>

            <View style={{ gap: 14 }}>
              <Input
                label={lang === 'en' ? 'Full Name' : 'Họ và tên'}
                placeholder={lang === 'en' ? 'E.g. John Doe' : 'VD: Nguyễn Văn A'}
                value={fullName}
                onChangeText={setFullName}
                leftIcon={<User size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label={lang === 'en' ? 'Email' : 'Email'}
                placeholder={lang === 'en' ? 'E.g. user@gmail.com' : 'VD: nguyenvana@gmail.com'}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                leftIcon={<Mail size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label={lang === 'en' ? 'Phone Number' : 'Số điện thoại'}
                placeholder={lang === 'en' ? 'E.g. 0901 234 567' : 'VD: 0901 234 567'}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label={lang === 'en' ? 'Password' : 'Mật khẩu'}
                placeholder={lang === 'en' ? 'At least 8 characters' : 'Tối thiểu 8 ký tự'}
                secureTextEntry={!showPw}
                value={password}
                onChangeText={setPassword}
                leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
                rightIcon={
                  <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                    {showPw ? (
                      <EyeOff size={18} color={COLORS.gray[400]} />
                    ) : (
                      <Eye size={18} color={COLORS.gray[400]} />
                    )}
                  </TouchableOpacity>
                }
              />
              <Input
                label={lang === 'en' ? 'Confirm Password' : 'Xác nhận mật khẩu'}
                placeholder={lang === 'en' ? 'Re-enter password' : 'Nhập lại mật khẩu'}
                secureTextEntry={!showPw}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
              />

              {/* Terms */}
              <Text
                style={{
                  fontSize: fs(12),
                  color: tc.textMuted,
                  textAlign: 'center',
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                {lang === 'en' ? (
                  <>
                    By registering, you agree to the{' '}
                    <Text
                      onPress={() =>
                        router.push({ pathname: '/policy-insurance', params: { tab: 'terms' } })
                      }
                      style={{ color: COLORS.primary, fontWeight: '700' }}
                    >
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text
                      onPress={() =>
                        router.push({ pathname: '/policy-insurance', params: { tab: 'privacy' } })
                      }
                      style={{ color: COLORS.primary, fontWeight: '700' }}
                    >
                      Privacy Policy
                    </Text>{' '}
                    of Green House.
                  </>
                ) : (
                  <>
                    Bằng cách đăng ký, bạn đồng ý với{' '}
                    <Text
                      onPress={() =>
                        router.push({ pathname: '/policy-insurance', params: { tab: 'terms' } })
                      }
                      style={{ color: COLORS.primary, fontWeight: '700' }}
                    >
                      Điều khoản dịch vụ
                    </Text>{' '}
                    và{' '}
                    <Text
                      onPress={() =>
                        router.push({ pathname: '/policy-insurance', params: { tab: 'privacy' } })
                      }
                      style={{ color: COLORS.primary, fontWeight: '700' }}
                    >
                      Chính sách bảo mật
                    </Text>{' '}
                    của Green House.
                  </>
                )}
              </Text>

              <Button
                title={lang === 'en' ? 'Create Account' : 'Đăng ký tài khoản'}
                loading={register.isPending}
                onPress={handleRegister}
                style={{ marginTop: 8 }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6 }}>
              <Text style={{ color: tc.textSecondary, fontSize: fs(14) }}>
                {lang === 'en' ? 'Already have an account?' : 'Đã có tài khoản?'}
              </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: fs(14) }}>
                  {lang === 'en' ? 'Log in' : 'Đăng nhập'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
