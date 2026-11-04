import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import apiClient from '@/services/api-client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [requested, setRequested] = useState(false);
  const send = useMutation({
    mutationFn: () => apiClient.post('/auth/forgot-password', { phone: phone.trim() }),
    onSuccess: () => setRequested(true),
  });
  const reset = useMutation({
    mutationFn: () =>
      apiClient.post('/auth/reset-password', {
        phone: phone.trim(),
        otp: otp.trim(),
        new_password: password,
      }),
  });
  const error = (send.error || reset.error) as any;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: 24 }}>
        {lang === 'en' ? 'Reset Password' : 'Đặt lại mật khẩu'}
      </Text>
      <Input
        label={lang === 'en' ? 'Phone Number' : 'Số điện thoại'}
        value={phone}
        onChangeText={v => {
          setPhone(v);
          setRequested(false);
        }}
        keyboardType="phone-pad"
        placeholder={lang === 'en' ? 'Registered phone number' : 'Số điện thoại đã đăng ký'}
      />
      <Button
        title={requested ? (lang === 'en' ? 'Resend verification code' : 'Gửi lại mã xác minh') : (lang === 'en' ? 'Send verification code' : 'Gửi mã xác minh')}
        disabled={!/^0\d{9}$/.test(phone.trim())}
        loading={send.isPending}
        onPress={() => send.mutate()}
      />
      {requested && (
        <>
          <Text>
            {lang === 'en'
              ? 'If the phone number is registered, you will receive a verification code.'
              : 'Nếu số điện thoại đã đăng ký và dịch vụ gửi mã khả dụng, bạn sẽ nhận được mã xác minh.'}
          </Text>
          <Input
            label={lang === 'en' ? 'Verification Code' : 'Mã xác minh'}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Input
            label={lang === 'en' ? 'New Password' : 'Mật khẩu mới'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Input
            label={lang === 'en' ? 'Confirm New Password' : 'Nhập lại mật khẩu mới'}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />
          <Button
            title={lang === 'en' ? 'Change Password' : 'Đổi mật khẩu'}
            disabled={!/^\d{6}$/.test(otp) || password.length < 8 || password !== confirm}
            loading={reset.isPending}
            onPress={() => reset.mutate()}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert">
          {error.response?.data?.message || (lang === 'en' ? 'Action failed. Please try again.' : 'Chưa thực hiện được. Vui lòng thử lại.')}
        </Text>
      )}
      {reset.isSuccess && (
        <Text accessibilityRole="alert">
          {lang === 'en'
            ? 'Password changed. You can now log in with your new password.'
            : 'Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.'}
        </Text>
      )}
      <Button
        title={lang === 'en' ? 'Back to Login' : 'Về đăng nhập'}
        variant="outline"
        onPress={() => router.replace('/(auth)/login')}
      />
    </ScrollView>
  );
}
