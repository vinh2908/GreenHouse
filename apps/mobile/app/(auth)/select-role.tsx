import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2, Home, Wrench } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import { useSwitchRole } from '@/hooks/use-api';
import { Button, Card, COLORS } from '@/components/ui';

export default function SelectRoleScreen() {
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const { user, switchRole: updateStoreRole } = useAuthStore();
  const switchRoleMutation = useSwitchRole();
  const [selectedRole, setSelectedRole] = useState<'customer' | 'helper'>('customer');
  const [loading, setLoading] = useState(false);

  const handleConfirmRole = async () => {
    setLoading(true);
    try {
      await switchRoleMutation.mutateAsync(selectedRole);
      updateStoreRole(selectedRole);

      Toast.show({
        type: 'success',
        text1:
          selectedRole === 'customer'
            ? lang === 'en'
              ? 'Welcome to Green House!'
              : 'Chào mừng bạn đến với Green House!'
            : lang === 'en'
              ? 'Welcome Green House Partner!'
              : 'Chào mừng đối tác Green House!',
        text2:
          selectedRole === 'customer'
            ? lang === 'en'
              ? 'Start searching for handy services'
              : 'Bắt đầu tìm kiếm dịch vụ tiện ích'
            : lang === 'en'
              ? 'Start receiving jobs and earning income'
              : 'Bắt đầu nhận công việc và gia tăng thu nhập',
      });

      if (selectedRole === 'helper') {
        router.replace('/(helper)/dashboard');
      } else {
        router.replace('/(customer)/home');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'en' ? 'An error occurred' : 'Đã có lỗi xảy ra');
      Toast.show({ type: 'error', text1: msg });
      // Fallback redirect
      if (selectedRole === 'helper') {
        router.replace('/(helper)/dashboard');
      } else {
        router.replace('/(customer)/home');
      }
    } finally {
      setLoading(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'space-between' }}
      >
        <View>
          {/* Header */}
          <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 32 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: COLORS.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              <Text style={{ color: '#fff', fontSize: fs(28), fontWeight: '800' }}>G</Text>
            </View>
            <Text
              style={{
                fontSize: fs(24),
                fontWeight: '800',
                color: COLORS.gray[900],
                textAlign: 'center',
              }}
            >
              {lang === 'en'
                ? `Welcome, ${user?.full_name?.split(' ').slice(-1)[0] ?? 'friend'}!`
                : `Chào mừng, ${user?.full_name?.split(' ').slice(-1)[0] ?? 'bạn'}!`}
            </Text>
            <Text
              style={{
                fontSize: fs(15),
                color: COLORS.gray[500],
                textAlign: 'center',
                marginTop: 8,
                lineHeight: 22,
              }}
            >
              {lang === 'en'
                ? 'How would you like to use Green House?\n'
                : 'Bạn muốn sử dụng Green House như thế nào?\n'}
              <Text style={{ fontSize: fs(13), color: COLORS.gray[500] }}>
                {lang === 'en'
                  ? '(You can switch anytime in settings)'
                  : '(Bạn có thể chuyển đổi linh hoạt bất kỳ lúc nào)'}
              </Text>
            </Text>
          </View>

          {/* Role Cards */}
          <View style={{ gap: 16 }}>
            {/* Customer Option */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedRole('customer')}>
              <Card
                style={{
                  borderWidth: 2,
                  borderColor: selectedRole === 'customer' ? COLORS.primary : COLORS.gray[200],
                  backgroundColor: selectedRole === 'customer' ? COLORS.primaryLight : '#fff',
                  padding: 20,
                  borderRadius: 20,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      backgroundColor: selectedRole === 'customer' ? '#fff' : COLORS.gray[100],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Home
                      size={28}
                      color={selectedRole === 'customer' ? COLORS.primary : COLORS.gray[600]}
                    />
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selectedRole === 'customer' ? COLORS.primary : COLORS.gray[300],
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selectedRole === 'customer' ? COLORS.primary : 'transparent',
                    }}
                  >
                    {selectedRole === 'customer' && <CheckCircle2 size={18} color="#fff" />}
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: fs(18), fontWeight: '700', color: COLORS.gray[900] }}>
                    {lang === 'en' ? 'I need services' : 'Tôi cần thuê dịch vụ'}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(14),
                      color: COLORS.gray[600],
                      marginTop: 4,
                      lineHeight: 20,
                    }}
                  >
                    {lang === 'en'
                      ? 'Find home cleaners, cooks, electricians and plumbers quickly and reliably.'
                      : 'Tìm người giúp việc, tổng vệ sinh, nấu ăn, sửa chữa điện nước gia đình nhanh chóng, tin cậy.'}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>

            {/* Helper / Worker Option */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedRole('helper')}>
              <Card
                style={{
                  borderWidth: 2,
                  borderColor: selectedRole === 'helper' ? COLORS.primary : COLORS.gray[200],
                  backgroundColor: selectedRole === 'helper' ? COLORS.primaryLight : '#fff',
                  padding: 20,
                  borderRadius: 20,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      backgroundColor: selectedRole === 'helper' ? '#fff' : COLORS.gray[100],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Wrench
                      size={28}
                      color={selectedRole === 'helper' ? COLORS.primary : COLORS.gray[600]}
                    />
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selectedRole === 'helper' ? COLORS.primary : COLORS.gray[300],
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selectedRole === 'helper' ? COLORS.primary : 'transparent',
                    }}
                  >
                    {selectedRole === 'helper' && <CheckCircle2 size={18} color="#fff" />}
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: fs(18), fontWeight: '700', color: COLORS.gray[900] }}>
                    {lang === 'en' ? 'I want to work' : 'Tôi muốn nhận việc'}
                  </Text>
                  <Text
                    style={{
                      fontSize: fs(14),
                      color: COLORS.gray[600],
                      marginTop: 4,
                      lineHeight: 20,
                    }}
                  >
                    {lang === 'en'
                      ? 'Become a helper partner to connect with thousands of customers around you.'
                      : 'Trở thành đối tác giúp việc, thợ sửa chữa để kết nối với hàng nghìn khách hàng xung quanh bạn.'}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Button */}
        <View style={{ marginTop: 24 }}>
          <Button
            title={lang === 'en' ? 'Get Started' : 'Bắt đầu trải nghiệm'}
            loading={loading}
            onPress={handleConfirmRole}
            icon={<ArrowRight size={18} color="#fff" />}
          />
        </View>
      </ScrollView>
    </View>
  );
}
