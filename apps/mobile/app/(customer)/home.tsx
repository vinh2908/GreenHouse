import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  MapPin,
  Search,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Wrench,
  Zap,
  CheckCircle2,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useServices, useMyJobs, useUnreadCount, useSwitchRole } from '@/hooks/use-api';
import { locationService } from '@/services/location.service';
import {
  Card,
  JobStatusBadge,
  EmptyState,
  LoadingSpinner,
  COLORS,
  SectionHeader,
  Badge,
} from '@/components/ui';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

// ─── Danh mục dịch vụ chuẩn Vua Thợ ───────────────────────────────────────────
const SERVICE_CATEGORIES = [
  {
    id: 'housekeeping_hourly',
    name: 'Giúp việc\ntheo giờ',
    emoji: '🧹',
    bg: '#FFF4ED',
    slug: 'housekeeping_hourly',
  },
  {
    id: 'deep_cleaning',
    name: 'Tổng vệ sinh\nnhà cửa',
    emoji: '✨',
    bg: '#ECFDF5',
    slug: 'deep_cleaning',
  },
  {
    id: 'electrician',
    name: 'Sửa điện\ngia dụng',
    emoji: '⚡',
    bg: '#FEF3C7',
    slug: 'electrician',
  },
  {
    id: 'plumbing',
    name: 'Sửa ống nước\nthông cống',
    emoji: '🚰',
    bg: '#EFF6FF',
    slug: 'plumbing',
  },
  { id: 'ac_repair', name: 'Vệ sinh\nmáy lạnh', emoji: '❄️', bg: '#E0F2FE', slug: 'ac_repair' },
  { id: 'cooking', name: 'Nấu ăn\ngia đình', emoji: '🍳', bg: '#FFFBEB', slug: 'cooking' },
  { id: 'appliance', name: 'Sửa máy giặt\ntủ lạnh', emoji: '🧺', bg: '#F5F3FF', slug: 'appliance' },
  { id: 'locksmith', name: 'Sửa khóa\nlắp camera', emoji: '🔑', bg: '#F3F4F6', slug: 'locksmith' },
];

export default function CustomerHomeScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const switchRole = useSwitchRole();
  const { data: services, isLoading: sLoading } = useServices();
  const { data: recentJobs, isLoading: jLoading, refetch } = useMyJobs();
  const { data: unread } = useUnreadCount();

  const [currentLocationName, setCurrentLocationName] = useState('Hồ Chí Minh • Quận 1');

  useEffect(() => {
    locationService
      .getCurrentLocationDetails()
      .then(details => {
        if (details?.district) {
          setCurrentLocationName(`${details.city || 'Hồ Chí Minh'} • ${details.district}`);
        }
      })
      .catch(() => {});
  }, []);

  const activeJobs =
    recentJobs?.filter((j: { status: string }) => !['completed', 'cancelled'].includes(j.status)) ??
    [];

  const handleSwitchToWorker = async () => {
    try {
      await switchRole.mutateAsync('helper');
      useAuthStore.getState().switchRole('helper');
      router.replace('/(helper)/dashboard');
    } catch {
      useAuthStore.getState().switchRole('helper');
      router.replace('/(helper)/dashboard');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={jLoading} onRefresh={refetch} colors={[COLORS.primary]} />
        }
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── 1. Top Header Bar (Vua Thợ Style) ────────────────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            {/* Location selector */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                marginRight: 12,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: COLORS.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MapPin size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: COLORS.gray[400], fontWeight: '600' }}>
                  Vị trí của bạn
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}
                    numberOfLines={1}
                  >
                    {currentLocationName}
                  </Text>
                  <ChevronRight size={14} color={COLORS.gray[500]} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Role switch pill & Notification bell */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Quick Mode Toggle */}
              <TouchableOpacity
                onPress={handleSwitchToWorker}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: '#FFF4ED',
                  borderWidth: 1,
                  borderColor: '#FFD9C5',
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Wrench size={14} color={COLORS.primary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                  Làm Thợ
                </Text>
              </TouchableOpacity>

              {/* Notification icon */}
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                activeOpacity={0.7}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: COLORS.gray[100],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={18} color={COLORS.gray[700]} />
                {!!unread && unread > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: COLORS.error,
                      borderWidth: 1.5,
                      borderColor: '#fff',
                    }}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Search bar */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/(customer)/booking')}
            style={{
              backgroundColor: '#F3F4F6',
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginTop: 14,
              gap: 10,
            }}
          >
            <Search size={18} color={COLORS.gray[400]} />
            <Text style={{ flex: 1, color: COLORS.gray[400], fontSize: 14, fontWeight: '500' }}>
              Tìm thợ sửa điện, dọn nhà, sửa máy lạnh...
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. SOS Emergency Express Banner (Cứu hộ khẩn cấp) ──────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/sos')}
            style={{
              backgroundColor: '#DC2626',
              borderRadius: 20,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 24 }}>🚨</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontWeight: '900',
                      fontSize: 16,
                      letterSpacing: 0.3,
                    }}
                  >
                    CỨU HỘ SOS KHẨN CẤP
                  </Text>
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '900' }}>
                      15P CÓ MẶT
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 12,
                    marginTop: 2,
                    fontWeight: '500',
                  }}
                >
                  Chập điện, vỡ ống nước, kẹt khóa cửa ngoài...
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* ── 3. AI Hero Assistant Banner (Vua Thợ AI Feature) ───────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/(customer)/booking')}
            style={{
              backgroundColor: '#1E1E24',
              borderRadius: 20,
              padding: 18,
              position: 'relative',
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                <Sparkles size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    Trợ lý AI HomeMate
                  </Text>
                  <View
                    style={{
                      backgroundColor: '#FF6B1A33',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '800' }}>
                      THÔNG MINH
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12.5,
                    marginTop: 3,
                    lineHeight: 18,
                  }}
                >
                  Nhập sự cố hoặc việc cần làm, AI tự động gợi ý giải pháp & ước tính giá chuẩn.
                </Text>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.4)" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 3. Danh mục 8 nghiệp vụ (4x2 Grid chuẩn Vua Thợ) ────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
          <SectionHeader
            title="Dịch vụ nổi bật"
            action="Tất cả 63 nghề"
            onAction={() => router.push('/(customer)/booking')}
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'space-between',
            }}
          >
            {SERVICE_CATEGORIES.map(category => (
              <TouchableOpacity
                key={category.id}
                activeOpacity={0.75}
                onPress={() => {
                  const match = services?.find(s => s.slug === category.slug);
                  router.push({
                    pathname: '/(customer)/booking',
                    params: { service_id: match?._id ?? '', service_slug: category.slug },
                  });
                }}
                style={{
                  width: '23%',
                  alignItems: 'center',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderWidth: 1,
                  borderColor: COLORS.gray[100],
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: category.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{category.emoji}</Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: COLORS.gray[800],
                    textAlign: 'center',
                    lineHeight: 14,
                  }}
                  numberOfLines={2}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 4. Quyền lợi cam kết & Bảo hiểm (Vua Thợ Badge) ──────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: COLORS.gray[100],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={18} color={COLORS.success} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray[800] }}>
                Thợ e-KYC 100%
              </Text>
            </View>
            <View style={{ width: 1, height: 16, backgroundColor: COLORS.gray[200] }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={18} color={COLORS.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray[800] }}>
                Bảo hành dịch vụ
              </Text>
            </View>
            <View style={{ width: 1, height: 16, backgroundColor: COLORS.gray[200] }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Zap size={18} color={COLORS.warning} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray[800] }}>
                Có mặt sau 15p
              </Text>
            </View>
          </View>
        </View>

        {/* ── 5. Công việc đang thực hiện (Active Job Tracker) ────────── */}
        {activeJobs.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <SectionHeader
              title="Đơn đang thực hiện"
              subtitle="Theo dõi tiến độ thợ theo thời gian thực"
              action="Tất cả"
              onAction={() => router.push('/(customer)/jobs')}
            />
            <View style={{ gap: 10 }}>
              {activeJobs
                .slice(0, 2)
                .map(
                  (job: {
                    _id: string;
                    title: string;
                    status: string;
                    service_id: { name: string } | null;
                    created_at: string;
                    helper_id?: { full_name: string; avatar?: string } | null;
                  }) => (
                    <TouchableOpacity
                      key={job._id}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })
                      }
                    >
                      <Card style={{ borderWidth: 1.5, borderColor: '#FFE4D6', gap: 10 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: '800',
                              fontSize: 15,
                              color: COLORS.gray[900],
                              flex: 1,
                              marginRight: 8,
                            }}
                            numberOfLines={1}
                          >
                            {job.title}
                          </Text>
                          <JobStatusBadge status={job.status} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Badge
                            label={(job.service_id as { name: string } | null)?.name ?? 'Dịch vụ'}
                            size="sm"
                          />
                          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                            {dayjs(job.created_at).fromNow()}
                          </Text>
                        </View>

                        {job.helper_id && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 4,
                              paddingTop: 8,
                              borderTopWidth: 1,
                              borderTopColor: COLORS.gray[100],
                            }}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: COLORS.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                {(job.helper_id as { full_name: string }).full_name?.[0] ?? 'T'}
                              </Text>
                            </View>
                            <Text
                              style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}
                            >
                              Thợ: {(job.helper_id as { full_name: string }).full_name}
                            </Text>
                            <Text
                              style={{
                                marginLeft: 'auto',
                                fontSize: 12,
                                color: COLORS.primary,
                                fontWeight: '700',
                              }}
                            >
                              Chi tiết →
                            </Text>
                          </View>
                        )}
                      </Card>
                    </TouchableOpacity>
                  ),
                )}
            </View>
          </View>
        )}

        {/* ── 6. Lịch sử đặt việc gần đây ──────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <SectionHeader
            title="Lịch sử đặt việc"
            action="Xem tất cả"
            onAction={() => router.push('/(customer)/jobs')}
          />
          {jLoading ? (
            <LoadingSpinner size="small" />
          ) : !recentJobs?.length ? (
            <Card>
              <EmptyState
                emoji="🔧"
                title="Chưa có yêu cầu nào"
                subtitle="Đăng việc ngay để thợ xung quanh bạn báo giá nhanh chóng!"
                action="Đăng việc ngay"
                onAction={() => router.push('/(customer)/booking')}
              />
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {recentJobs
                .slice(0, 4)
                .map(
                  (job: {
                    _id: string;
                    title: string;
                    status: string;
                    service_id: { name: string } | null;
                    address: { district: string };
                    created_at: string;
                  }) => (
                    <TouchableOpacity
                      key={job._id}
                      activeOpacity={0.8}
                      onPress={() =>
                        router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })
                      }
                    >
                      <Card style={{ gap: 8 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: '700',
                              fontSize: 14,
                              color: COLORS.gray[900],
                              flex: 1,
                              marginRight: 8,
                            }}
                            numberOfLines={1}
                          >
                            {job.title}
                          </Text>
                          <JobStatusBadge status={job.status} />
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                            📍 {job.address?.district ?? 'TP.HCM'} •{' '}
                            {dayjs(job.created_at).format('DD/MM/YYYY')}
                          </Text>
                          <ChevronRight size={14} color={COLORS.gray[400]} />
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ),
                )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
