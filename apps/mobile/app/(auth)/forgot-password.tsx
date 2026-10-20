import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@/components/ui';
import apiClient from '@/services/api-client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
        Đặt lại mật khẩu
      </Text>
      <Input
        label="Số điện thoại"
        value={phone}
        onChangeText={v => {
          setPhone(v);
          setRequested(false);
        }}
        keyboardType="phone-pad"
        placeholder="Số điện thoại đã đăng ký"
      />
      <Button
        title={requested ? 'Gửi lại mã xác minh' : 'Gửi mã xác minh'}
        disabled={!/^0\d{9}$/.test(phone.trim())}
        loading={send.isPending}
        onPress={() => send.mutate()}
      />
      {requested && (
        <>
          <Text>
            Nếu số điện thoại đã đăng ký và dịch vụ gửi mã khả dụng, bạn sẽ nhận được mã xác minh.
          </Text>
          <Input
            label="Mã xác minh"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Input label="Mật khẩu mới" value={password} onChangeText={setPassword} secureTextEntry />
          <Input
            label="Nhập lại mật khẩu mới"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />
          <Button
            title="Đổi mật khẩu"
            disabled={!/^\d{6}$/.test(otp) || password.length < 8 || password !== confirm}
            loading={reset.isPending}
            onPress={() => reset.mutate()}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert">
          {error.response?.data?.message || 'Chưa thực hiện được. Vui lòng thử lại.'}
        </Text>
      )}
      {reset.isSuccess && (
        <Text accessibilityRole="alert">
          Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.
        </Text>
      )}
      <Button
        title="Về đăng nhập"
        variant="outline"
        onPress={() => router.replace('/(auth)/login')}
      />
    </ScrollView>
  );
}
