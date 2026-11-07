import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Smartphone } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { useVerifyOtp, useResendOtp } from '@/hooks/use-api';
import { mapAuthErrorMessage } from '@/services/i18n';
import apiClient from '@/services/api-client';
import { Button, COLORS, useThemeColors } from '@/components/ui';

export default function OtpScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const setAuth = useAuthStore(s => s.setAuth);
  const setUser = useAuthStore(s => s.setUser);

  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  // P2-19: cờ xác minh chung cho cả 2 nhánh (email gọi apiClient trực tiếp nên
  // verifyOtp.isPending không phủ được) — chặn double-submit / auto-submit + tap.
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) inputs.current[index + 1]?.focus();
    if (!text && index > 0) inputs.current[index - 1]?.focus();
    // Auto-submit when filled
    if (newOtp.every(d => d) && newOtp.join('').length === 6) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code ?? otp.join('');
    if (otpCode.length !== 6) {
      Toast.show({
        type: 'error',
        text1: lang === 'en' ? 'Enter 6-digit OTP code' : 'Nhập đủ 6 ký tự OTP',
      });
      return;
    }
    // P2-19: chặn lần xác minh thứ 2 trong khi lần đầu đang bay (auto-submit
    // khi đủ 6 số + bấm nút Xác nhận sẽ bắn trùng, lần 2 fail "OTP không đúng"
    // dù lần 1 đã thành công).
    if (verifying) return;
    setVerifying(true);
    try {
      if (email) {
        await apiClient.post('/auth/verify-email', { email: email.trim(), otp: otpCode });
        // P0-7: đồng bộ cờ xác minh vào store + cache profile để banner biến
        // mất ngay, không chờ refetch.
        const currentUser = useAuthStore.getState().user;
        if (currentUser) setUser({ ...currentUser, is_verified: true });
        queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
        Toast.show({
          type: 'success',
          text1: lang === 'en' ? 'Email verified successfully!' : 'Xác minh email thành công!',
        });
        router.replace('/(auth)/select-role');
      } else {
        const res = await verifyOtp.mutateAsync({ phone: phone!, otp: otpCode });
        const data = res.data?.data;
        if (data?.access_token && data?.user) {
          await setAuth(data.user, data.access_token, data.refresh_token);
          // Sau khi đăng ký & OTP xong, đưa sang màn hình chọn Role
          router.replace('/(auth)/select-role');
        } else {
          Toast.show({
            type: 'success',
            text1: lang === 'en' ? 'Verified successfully' : 'Xác minh thành công',
            text2: lang === 'en' ? 'Please log in' : 'Vui lòng đăng nhập',
          });
          router.replace('/(auth)/login');
        }
      }
    } catch (err: unknown) {
      const rawMsg = (err as { response?: { data?: { message?: unknown } } })?.response?.data
        ?.message;
      const msg =
        mapAuthErrorMessage(rawMsg, lang) ??
        (lang === 'en' ? 'Invalid or expired OTP code' : 'Mã OTP không đúng hoặc đã hết hạn');
      Toast.show({ type: 'error', text1: msg });
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    try {
      if (email) {
        await apiClient.post('/auth/verify-email/resend', { email: email.trim() });
      } else {
        await resendOtp.mutateAsync(phone!);
      }
      setCountdown(60);
      Toast.show({ type: 'success', text1: lang === 'en' ? 'OTP resent' : 'Đã gửi lại OTP' });
    } catch (err: unknown) {
      // P2-17: hiện lý do thật thay vì "Failed to resend OTP" chung chung —
      // 429 (quá 5 lần/giờ) khóa nút tới hết khung 1 giờ, lỗi gửi mail thì
      // giữ countdown = 0 để bấm thử lại ngay.
      const res = (err as { response?: { status?: number; data?: { message?: unknown } } })
        ?.response;
      const msg =
        mapAuthErrorMessage(res?.data?.message, lang) ??
        (lang === 'en' ? 'Failed to resend OTP' : 'Gửi lại OTP thất bại');
      if (res?.status === 429) setCountdown(3600);
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setResending(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/register');
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: tc.surface, paddingTop: Math.max(insets.top, 16) }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 16,
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
        <Text style={{ fontSize: fs(18), fontWeight: '700', color: tc.text, marginLeft: 12 }}>
          {lang === 'en' ? 'Verify OTP' : 'Xác minh OTP'}
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              backgroundColor: COLORS.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Smartphone size={36} color={COLORS.primary[600]} />
          </View>
          <Text
            style={{
              fontSize: fs(18),
              fontWeight: '700',
              color: tc.text,
              textAlign: 'center',
            }}
          >
            {lang === 'en' ? 'Enter Verification Code' : 'Nhập mã xác minh'}
          </Text>
          <Text
            style={{
              fontSize: fs(14),
              color: tc.textMuted,
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            {lang === 'en'
              ? `A 6-digit OTP was sent to\n`
              : `Mã OTP 6 số đã được gửi đến ${email ? 'email' : 'số điện thoại'}\n`}
            <Text style={{ fontWeight: '700', color: tc.text }}>{email || phone}</Text>
          </Text>
          <Text
            style={{
              fontSize: fs(13),
              color: tc.textMuted,
              textAlign: 'center',
              marginTop: 6,
              lineHeight: 18,
            }}
          >
            {lang === 'en'
              ? "Can't find the code? Please check your Spam / Junk folder."
              : 'Không thấy mã? Vui lòng kiểm tra thư mục Spam / Thư rác.'}
          </Text>
        </View>

        {/* OTP inputs */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={el => {
                inputs.current[i] = el;
              }}
              value={digit}
              onChangeText={text => handleChange(text.slice(-1), i)}
              maxLength={1}
              keyboardType="number-pad"
              style={{
                width: 48,
                height: 56,
                borderRadius: 14,
                textAlign: 'center',
                fontSize: fs(22),
                fontWeight: '700',
                color: tc.text,
                borderWidth: 2,
                borderColor: digit ? COLORS.primary : COLORS.gray[200],
                backgroundColor: digit ? COLORS.primaryLight : COLORS.gray[50],
              }}
            />
          ))}
        </View>

        <Button
          title={lang === 'en' ? 'Confirm' : 'Xác nhận'}
          loading={verifyOtp.isPending || verifying}
          disabled={verifying}
          onPress={() => handleVerify()}
        />

        {/* Resend */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          {countdown > 0 ? (
            <Text style={{ color: tc.textMuted, fontSize: fs(14) }}>
              {lang === 'en' ? 'Resend in ' : 'Gửi lại sau '}
              <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                {countdown >= 120 ? `${Math.ceil(countdown / 60)} min` : `${countdown}s`}
              </Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text
                style={{
                  color: COLORS.primary,
                  fontWeight: '600',
                  fontSize: fs(14),
                  opacity: resending ? 0.6 : 1,
                }}
              >
                {lang === 'en' ? 'Resend OTP' : 'Gửi lại OTP'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
