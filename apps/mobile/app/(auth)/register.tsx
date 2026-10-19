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
import { useRegister } from '@/hooks/use-api';
import { Button, Input, COLORS } from '@/components/ui';

export default function RegisterScreen() {
  const router = useRouter();
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
      Toast.show({ type: 'error', text1: 'Vui lòng điền đầy đủ thông tin' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      Toast.show({ type: 'error', text1: 'Email không đúng định dạng' });
      return;
    }
    if (password !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Mật khẩu xác nhận không khớp' });
      return;
    }
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Mật khẩu phải có ít nhất 8 ký tự' });
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
      if (data?.access_token && data?.user) {
        await setAuth(data.user, data.access_token, data.refresh_token);
        Toast.show({
          type: 'success',
          text1: 'Đăng ký thành công!',
          text2: `Chào mừng ${data.user.full_name} đến với Green House`,
        });
        router.replace('/(auth)/select-role');
      } else {
        Toast.show({ type: 'success', text1: 'Đăng ký thành công! Vui lòng đăng nhập' });
        router.replace('/(auth)/login');
      }
    } catch (err: unknown) {
      const responseData = (err as any)?.response?.data;
      const msg = responseData?.message;
      const displayMsg = Array.isArray(msg) ? msg[0] : msg || 'Đăng ký không thành công';
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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
                borderRadius: 12,
                backgroundColor: COLORS.gray[100],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={20} color={COLORS.gray[800]} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900], marginLeft: 12 }}
            >
              Tạo tài khoản mới
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
            <Text
              style={{ fontSize: 14, color: COLORS.gray[500], marginBottom: 24, lineHeight: 20 }}
            >
              Một tài khoản duy nhất để đặt dịch vụ hoặc nhận việc kiếm thêm thu nhập.
            </Text>

            <View style={{ gap: 14 }}>
              <Input
                label="Họ và tên"
                placeholder="VD: Nguyễn Văn A"
                value={fullName}
                onChangeText={setFullName}
                leftIcon={<User size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label="Email"
                placeholder="VD: nguyenvana@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                leftIcon={<Mail size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label="Số điện thoại"
                placeholder="VD: 0901 234 567"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                leftIcon={<Phone size={18} color={COLORS.gray[400]} />}
              />
              <Input
                label="Mật khẩu"
                placeholder="Tối thiểu 8 ký tự"
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
                label="Xác nhận mật khẩu"
                placeholder="Nhập lại mật khẩu"
                secureTextEntry={!showPw}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                leftIcon={<Lock size={18} color={COLORS.gray[400]} />}
              />

              {/* Terms */}
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.gray[500],
                  textAlign: 'center',
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                Bằng cách đăng ký, bạn đồng ý với{' '}
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Điều khoản dịch vụ</Text>{' '}
                và{' '}
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Chính sách bảo mật</Text>{' '}
                của Green House.
              </Text>

              <Button
                title="Đăng ký tài khoản"
                loading={register.isPending}
                onPress={handleRegister}
                style={{ marginTop: 8 }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6 }}>
              <Text style={{ color: COLORS.gray[600], fontSize: 14 }}>Đã có tài khoản?</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                  Đăng nhập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
