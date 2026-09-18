import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useSwitchRole } from '@/hooks/use-api';
import { Button, Card, COLORS } from '@/components/ui';

export default function SelectRoleScreen() {
  const router = useRouter();
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
            ? 'Chào mừng bạn đến với HomeMate!'
            : 'Chào mừng đối tác HomeMate!',
        text2:
          selectedRole === 'customer'
            ? 'Bắt đầu tìm kiếm dịch vụ tiện ích'
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
        'Đã có lỗi xảy ra';
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
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }}>
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
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>H</Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: COLORS.gray[900],
                textAlign: 'center',
              }}
            >
              Chào mừng, {user?.full_name?.split(' ').slice(-1)[0] ?? 'bạn'}!
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: COLORS.gray[500],
                textAlign: 'center',
                marginTop: 8,
                lineHeight: 22,
              }}
            >
              Bạn muốn sử dụng HomeMate như thế nào?{'\n'}
              <Text style={{ fontSize: 13, color: COLORS.gray[400] }}>
                (Bạn có thể chuyển đổi linh hoạt bất kỳ lúc nào)
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
                    <Text style={{ fontSize: 28 }}>🏠</Text>
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
                  <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.gray[900] }}>
                    Tôi cần thuê dịch vụ
                  </Text>
                  <Text
                    style={{ fontSize: 14, color: COLORS.gray[600], marginTop: 4, lineHeight: 20 }}
                  >
                    Tìm người giúp việc, tổng vệ sinh, nấu ăn, sửa chữa điện nước gia đình nhanh
                    chóng, tin cậy.
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
                    <Text style={{ fontSize: 28 }}>🔧</Text>
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
                  <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.gray[900] }}>
                    Tôi muốn nhận việc
                  </Text>
                  <Text
                    style={{ fontSize: 14, color: COLORS.gray[600], marginTop: 4, lineHeight: 20 }}
                  >
                    Trở thành đối tác giúp việc, thợ sửa chữa để kết nối với hàng nghìn khách hàng
                    xung quanh bạn.
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Button */}
        <View style={{ marginTop: 24 }}>
          <Button
            title="Bắt đầu trải nghiệm"
            loading={loading}
            onPress={handleConfirmRole}
            icon={<ArrowRight size={18} color="#fff" />}
          />
        </View>
      </ScrollView>
    </View>
  );
}
