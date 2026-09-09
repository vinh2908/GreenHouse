import { useState, useRef, useEffect } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useVerifyOtp, useResendOtp } from '@/hooks/use-api';
import { Button, COLORS } from '@/components/ui';

export default function OtpScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const setAuth = useAuthStore(s => s.setAuth);

  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
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
      Toast.show({ type: 'error', text1: 'Nhập đủ 6 ký tự OTP' });
      return;
    }
    try {
      const res = await verifyOtp.mutateAsync({ phone: phone!, otp: otpCode });
      const data = res.data?.data;
      if (data?.access_token && data?.user) {
        await setAuth(data.user, data.access_token, data.refresh_token);
        // Sau khi đăng ký & OTP xong, đưa sang màn hình chọn Role
        router.replace('/(auth)/select-role');
      } else {
        Toast.show({ type: 'success', text1: 'Xác minh thành công', text2: 'Vui lòng đăng nhập' });
        router.replace('/(auth)/login');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Mã OTP không đúng hoặc đã hết hạn';
      Toast.show({ type: 'error', text1: msg });
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await resendOtp.mutateAsync(phone!);
      setCountdown(60);
      Toast.show({ type: 'success', text1: 'Đã gửi lại OTP' });
    } catch {
      Toast.show({ type: 'error', text1: 'Gửi lại OTP thất bại' });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/register');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
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
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.gray[900], marginLeft: 12 }}>
          Xác minh OTP
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: COLORS.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 36 }}>📱</Text>
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: COLORS.gray[900],
              textAlign: 'center',
            }}
          >
            Nhập mã xác minh
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.gray[500],
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            Mã OTP 6 số đã được gửi đến số{'\n'}
            <Text style={{ fontWeight: '700', color: COLORS.gray[800] }}>{phone}</Text>
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
                borderRadius: 12,
                textAlign: 'center',
                fontSize: 22,
                fontWeight: '700',
                color: COLORS.gray[900],
                borderWidth: 2,
                borderColor: digit ? COLORS.primary : COLORS.gray[200],
                backgroundColor: digit ? COLORS.primaryLight : COLORS.gray[50],
              }}
            />
          ))}
        </View>

        <Button title="Xác nhận" loading={verifyOtp.isPending} onPress={() => handleVerify()} />

        {/* Resend */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          {countdown > 0 ? (
            <Text style={{ color: COLORS.gray[500], fontSize: 14 }}>
              Gửi lại sau{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{countdown}s</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend}>
              <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 14 }}>
                Gửi lại OTP
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
