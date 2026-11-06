// app/delete-account.tsx — B24: Xoá tài khoản (lớp xác nhận 2: mật khẩu).
// Lớp 1 là Alert xác nhận ở màn Tài khoản; màn này là lớp 2: nhập mật khẩu.
// Backend xoá mềm (DELETE /auth/me): is_deleted=true, vô hiệu mọi token,
// dữ liệu đơn cũ vẫn còn cho admin tra cứu.
import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-i18n';
import { useDeleteAccount } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, COLORS, useThemeColors } from '@/components/ui';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const logout = useAuthStore(s => s.logout);
  const deleteAccount = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/profile');
  };

  const handleDelete = () => {
    if (!password.trim()) {
      setError(t('delete_account_password_label'));
      return;
    }
    setError('');
    deleteAccount.mutate(
      { password: password.trim() },
      {
        onSuccess: async () => {
          Toast.show({ type: 'success', text1: t('delete_account_success') });
          queryClient.clear();
          await logout();
          router.replace('/(auth)/login');
        },
        onError: (err: any) => {
          const status = err?.response?.status;
          setError(
            status === 401
              ? t('delete_account_wrong_password')
              : err?.response?.data?.message ||
                  (lang === 'en' ? 'Failed to delete account. Please try again.' : 'Xoá tài khoản thất bại. Vui lòng thử lại.'),
          );
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
          {t('delete_account_title')}
        </Text>
      </View>

      <View style={{ padding: 20, gap: 16 }}>
        <View
          style={{
            backgroundColor: COLORS.errorLight,
            borderWidth: 1,
            borderColor: '#FECACA',
            borderRadius: 14,
            padding: 16,
            gap: 10,
            flexDirection: 'row',
          }}
        >
          <AlertTriangle size={22} color={COLORS.error} />
          <Text style={{ flex: 1, fontSize: fs(14), color: '#991B1B', lineHeight: 20 }}>
            {t('delete_account_warn')}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.text }}>
            {t('delete_account_password_label')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: error ? COLORS.error : COLORS.gray[200],
              borderRadius: 14,
              backgroundColor: tc.surface,
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              value={password}
              onChangeText={v => {
                setPassword(v);
                setError('');
              }}
              placeholder={t('delete_account_password_placeholder')}
              placeholderTextColor={COLORS.gray[400]}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={{ flex: 1, paddingVertical: 14, fontSize: fs(15), color: tc.text }}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={10}>
              {showPassword ? (
                <EyeOff size={20} color={COLORS.gray[500]} />
              ) : (
                <Eye size={20} color={COLORS.gray[500]} />
              )}
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={{ fontSize: fs(13), color: COLORS.error }}>{error}</Text>
          ) : null}
        </View>

        <Button
          title={t('delete_account')}
          variant="danger"
          icon={<Trash2 size={18} color="#fff" />}
          loading={deleteAccount.isPending}
          disabled={!password.trim()}
          onPress={handleDelete}
        />
      </View>
    </View>
  );
}
