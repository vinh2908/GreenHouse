import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, Lock, Eye, EyeOff, ShieldCheck, Wrench } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useLogin } from '@/hooks/use-api';
import { Button, Input, COLORS } from '@/components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const login = useLogin();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập số điện thoại và mật khẩu' });
      return;
    }
    try {
      const { data } = await login.mutateAsync({ phone, password });
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
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Đăng nhập không thành công';
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
                width: 80,
                height: 80,
                borderRadius: 26,
                backgroundColor: COLORS.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 14,
                elevation: 8,
              }}
            >
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 60, height: 60 }}
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
              label="Số điện thoại"
              placeholder="Nhập số điện thoại của bạn"
              keyboardType="phone-pad"
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

            <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: -2 }}>
              <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>
                Quên mật khẩu?
              </Text>
            </TouchableOpacity>

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

          {/* ── Register Link ──────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ color: COLORS.gray[600], fontSize: 14 }}>Chưa có tài khoản?</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14 }}>
                Đăng ký ngay
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
