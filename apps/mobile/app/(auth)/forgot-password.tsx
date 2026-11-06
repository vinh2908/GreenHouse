import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import apiClient from '@/services/api-client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [requested, setRequested] = useState(false);

  const cleanId = identifier.trim();
  const isEmail = cleanId.includes('@');
  const isValidIdentifier = isEmail ? cleanId.length >= 5 && cleanId.includes('.') : /^0\d{9}$/.test(cleanId);

  const send = useMutation({
    mutationFn: () =>
      apiClient.post(
        '/auth/forgot-password',
        isEmail ? { email: cleanId.toLowerCase() } : { phone: cleanId },
      ),
    onSuccess: () => setRequested(true),
  });

  const reset = useMutation({
    mutationFn: () =>
      apiClient.post('/auth/reset-password', {
        email: isEmail ? cleanId.toLowerCase() : undefined,
        phone: !isEmail ? cleanId : undefined,
        otp: otp.trim(),
        new_password: password,
      }),
  });

  const error = (send.error || reset.error) as any;

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: fs(24), color: '#111827' }}>
        {lang === 'en' ? 'Reset Password' : 'Đặt lại mật khẩu'}
      </Text>
      <Text style={{ fontSize: fs(14), color: '#4B5563', lineHeight: 20 }}>
        {lang === 'en'
          ? 'Enter your registered email address to receive a 6-digit verification code.'
          : 'Nhập email đã đăng ký của bạn để nhận mã xác minh OTP 6 số qua email.'}
      </Text>

      <Input
        label={lang === 'en' ? 'Registered Email' : 'Email đã đăng ký'}
        value={identifier}
        onChangeText={v => {
          setIdentifier(v);
          setRequested(false);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder={lang === 'en' ? 'example@email.com' : 'vd: yourname@gmail.com'}
      />

      <Button
        title={
          requested
            ? lang === 'en'
              ? 'Resend verification code'
              : 'Gửi lại mã OTP qua email'
            : lang === 'en'
              ? 'Send verification code'
              : 'Gửi mã OTP xác minh'
        }
        disabled={!isValidIdentifier}
        loading={send.isPending}
        onPress={() => send.mutate()}
      />

      {requested && (
        <View style={{ gap: 14, marginTop: 8 }}>
          <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0' }}>
            <Text style={{ fontSize: fs(13), color: '#166534', fontWeight: '500', lineHeight: 18 }}>
              {lang === 'en'
                ? `A 6-digit verification code has been sent to ${cleanId}. Please check your inbox (and spam folder). Code expires in 5 minutes.`
                : `Mã xác minh 6 số đã được gửi tới email ${cleanId}. Vui lòng kiểm tra hộp thư đến (hoặc thư rác). Mã có hiệu lực trong 5 phút.`}
            </Text>
          </View>

          <Input
            label={lang === 'en' ? 'Verification Code (6 digits)' : 'Mã OTP xác minh (6 số)'}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
          />
          <Input
            label={lang === 'en' ? 'New Password' : 'Mật khẩu mới'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={lang === 'en' ? 'At least 8 characters' : 'Tối thiểu 8 ký tự'}
          />
          <Input
            label={lang === 'en' ? 'Confirm New Password' : 'Nhập lại mật khẩu mới'}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder={lang === 'en' ? 'Re-enter new password' : 'Nhập lại mật khẩu mới'}
          />
          <Button
            title={lang === 'en' ? 'Change Password' : 'Đổi mật khẩu'}
            disabled={!/^\d{6}$/.test(otp) || password.length < 8 || password !== confirm}
            loading={reset.isPending}
            onPress={() => reset.mutate()}
          />
        </View>
      )}

      {!!error && (
        <View style={{ backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' }}>
          <Text accessibilityRole="alert" style={{ color: '#DC2626', fontSize: fs(13), fontWeight: '500' }}>
            {error.response?.data?.message ||
              (lang === 'en' ? 'Action failed. Please try again.' : 'Thao tác không thành công. Vui lòng thử lại.')}
          </Text>
        </View>
      )}

      {reset.isSuccess && (
        <View style={{ backgroundColor: '#F0FDF4', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#86EFAC' }}>
          <Text accessibilityRole="alert" style={{ color: '#15803D', fontSize: fs(14), fontWeight: '600' }}>
            {lang === 'en'
              ? 'Password successfully changed! You can now log in with your new password.'
              : 'Đã đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.'}
          </Text>
        </View>
      )}

      <Button
        title={lang === 'en' ? 'Back to Login' : 'Về trang đăng nhập'}
        variant="outline"
        onPress={() => router.replace('/(auth)/login')}
      />
    </ScrollView>
  );
}
