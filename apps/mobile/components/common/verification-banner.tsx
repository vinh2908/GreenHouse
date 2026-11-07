// components/common/verification-banner.tsx — P0-7: người dùng đăng ký xong
// nhưng rời màn OTP (quay lại / tắt app) sẽ đăng nhập mà chưa xác minh, rồi
// chỉ phát hiện khi tạo đơn/nhận việc bị server chặn mà không có lối quay lại.
// Banner này xuất hiện ở profile + home khi is_verified === false, kèm nút
// gửi lại mã để quay về màn OTP. Dùng chung cho customer + helper.
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { MailWarning } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useResendEmailOtp } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { mapAuthErrorMessage } from '@/services/i18n';
import { COLORS } from '@/components/ui';

/** Gửi lại mã OTP email rồi đưa sang màn hình nhập mã. Dùng chung cho banner + booking pre-check. */
export function useResendVerification() {
  const router = useRouter();
  const { t } = useTranslation();
  const resendEmailOtp = useResendEmailOtp();

  const resendAndGoToOtp = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    await resendEmailOtp.mutateAsync(cleanEmail);
    Toast.show({ type: 'success', text1: t('verify_banner_sent') });
    router.push({ pathname: '/(auth)/otp', params: { email: cleanEmail } });
  };

  return { resendAndGoToOtp, isResending: resendEmailOtp.isPending };
}

export function VerificationBanner() {
  const { t, fs, lang } = useTranslation();
  const storedUser = useAuthStore(s => s.user);
  const { data: profile } = useMyProfile();
  const { resendAndGoToOtp, isResending } = useResendVerification();
  const [error, setError] = useState<string | null>(null);

  const user = profile ?? storedUser;
  // Chỉ hiện khi biết chắc chưa xác minh; khách vãng lai (user null) hoặc
  // tài khoản đã xác minh thì không hiện.
  if (!user || user.is_verified !== false) return null;

  const email = (user as { email?: string })?.email;
  const hasEmail = Boolean(email?.trim());

  const handleResend = async () => {
    if (!hasEmail || isResending) return;
    setError(null);
    try {
      await resendAndGoToOtp(email!);
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setError(
        mapAuthErrorMessage(raw, lang) ??
          (lang === 'en'
            ? 'Could not resend the code. Please try again.'
            : 'Không gửi lại được mã. Vui lòng thử lại.'),
      );
    }
  };

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <MailWarning size={22} color="#D97706" style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: fs(14.5), fontWeight: '800', color: '#92400E' }}>
          {t('verify_banner_title')}
        </Text>
        <Text style={{ fontSize: fs(13), color: '#78350F', lineHeight: 18 }}>
          {hasEmail ? t('verify_banner_desc') : t('verify_banner_no_email')}
        </Text>
        {error && (
          <Text style={{ fontSize: fs(13), color: COLORS.error, fontWeight: '600' }}>{error}</Text>
        )}
        {hasEmail && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleResend}
            disabled={isResending}
            style={{
              alignSelf: 'flex-start',
              marginTop: 6,
              backgroundColor: COLORS.primary,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: isResending ? 0.6 : 1,
            }}
          >
            {isResending && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13) }}>
              {t('verify_banner_action')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
