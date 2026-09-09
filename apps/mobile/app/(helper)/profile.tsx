import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ShieldCheck,
  LogOut,
  ChevronRight,
  Star,
  CreditCard,
  FileText,
  Home,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useHelperProfile, useSetHelperStatus, useSwitchRole } from '@/hooks/use-api';
import { Avatar, Card, COLORS, Separator, Badge, StarRating } from '@/components/ui';
import { useState, useEffect } from 'react';

export default function HelperProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const { data: profile } = useHelperProfile();
  const setStatus = useSetHelperStatus();
  const switchRole = useSwitchRole();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (profile?.status) setIsOnline(profile.status === 'online');
  }, [profile?.status]);

  const handleSwitchToCustomer = async () => {
    try {
      await switchRole.mutateAsync('customer');
      useAuthStore.getState().switchRole('customer');
      router.replace('/(customer)/home');
    } catch {
      useAuthStore.getState().switchRole('customer');
      router.replace('/(customer)/home');
    }
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất?', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const KYC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    unsubmitted: { label: 'Chưa xác minh', color: COLORS.error, bg: '#FEF2F2' },
    pending: { label: 'Chờ duyệt hồ sơ', color: '#D97706', bg: '#FFFBEB' },
    approved: { label: 'Đã xác thực e-KYC ✓', color: COLORS.success, bg: '#ECFDF5' },
    rejected: { label: 'Hồ sơ bị từ chối', color: COLORS.error, bg: '#FEF2F2' },
  };

  const KYC_STATUS =
    KYC_CONFIG[profile?.verification_status || 'unsubmitted'] || KYC_CONFIG['unsubmitted'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* Header */}
        <View
          style={{
            backgroundColor: '#fff',
            padding: 24,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <Avatar name={user?.full_name} size={80} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginTop: 12 }}>
            {user?.full_name}
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.gray[500], marginTop: 4, fontWeight: '600' }}>
            {user?.phone}
          </Text>

          {/* Stats */}
          {profile && (
            <View
              style={{
                flexDirection: 'row',
                gap: 24,
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: COLORS.gray[100],
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
                  {profile.total_completed ?? 0}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Đơn hoàn tất
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#D97706' }}>
                  ★ {profile.average_rating?.toFixed(1) ?? '5.0'}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Điểm uy tín
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.gray[200] }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.success }}>100%</Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                  Nhận việc
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          {/* Switch to customer button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleSwitchToCustomer}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              borderWidth: 1.5,
              borderColor: COLORS.primary,
              borderRadius: 16,
              backgroundColor: COLORS.primaryLight,
            }}
          >
            <Home size={18} color={COLORS.primary} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>
              Chuyển sang chế độ Thuê dịch vụ / Khách hàng
            </Text>
          </TouchableOpacity>

          {/* Online toggle */}
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                Trạng thái nhận đơn
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2 }}>
                {isOnline ? '🟢 Đang nhận việc mới' : '⚫ Ngoại tuyến'}
              </Text>
            </View>
            <Switch
              value={isOnline}
              onValueChange={async v => {
                setIsOnline(v);
                await setStatus.mutateAsync(v ? 'online' : 'offline');
              }}
              trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
              thumbColor="#fff"
            />
          </Card>

          {/* KYC Status Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/kyc' } as any)}
          >
            <Card
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: KYC_STATUS.bg,
              }}
            >
              <ShieldCheck size={24} color={KYC_STATUS.color} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 14, color: KYC_STATUS.color }}>
                  Xác minh danh tính Thợ (e-KYC)
                </Text>
                <Text
                  style={{ fontSize: 13, color: KYC_STATUS.color, marginTop: 2, fontWeight: '600' }}
                >
                  {KYC_STATUS.label}
                </Text>
              </View>
              <ChevronRight size={16} color={KYC_STATUS.color} />
            </Card>
          </TouchableOpacity>

          {/* Menu Items */}
          <Card style={{ gap: 0 }}>
            {[
              { icon: CreditCard, label: 'Tài khoản ngân hàng liên kết', route: '/bank-account' },
              { icon: Star, label: 'Đánh giá & Phản hồi từ khách hàng', route: null },
              { icon: FileText, label: 'Hồ sơ kỹ năng & Chứng chỉ nghề', route: null },
            ].map((item, i) => (
              <View key={item.label}>
                {i > 0 && <Separator my={0} />}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => (item.route ? router.push(item.route as any) : null)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 14,
                  }}
                >
                  <item.icon size={20} color={COLORS.gray[600]} />
                  <Text
                    style={{ flex: 1, fontSize: 15, color: COLORS.gray[900], fontWeight: '600' }}
                  >
                    {item.label}
                  </Text>
                  <ChevronRight size={16} color={COLORS.gray[400]} />
                </TouchableOpacity>
              </View>
            ))}
          </Card>

          {/* Logout */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLogout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              borderWidth: 1.5,
              borderColor: '#FFE4E1',
              borderRadius: 14,
              backgroundColor: '#FFF5F5',
            }}
          >
            <LogOut size={18} color={COLORS.error} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.error }}>Đăng xuất</Text>
          </TouchableOpacity>

          <Text
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: COLORS.gray[400],
              fontWeight: '500',
            }}
          >
            HomeMate Đối Tác v1.0.0 • Vua Thợ Ecosystem
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
