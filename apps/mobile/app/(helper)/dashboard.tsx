import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  Briefcase,
  TrendingUp,
  Star,
  MapPin,
  Clock,
  ShieldCheck,
  Home,
  AlertTriangle,
  Flame,
  X,
  PhoneCall,
  Check,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHelperProfile,
  useSetHelperStatus,
  useAvailableJobs,
  useHelperJobs,
  useWallet,
  useUnreadCount,
  useSwitchRole,
  useAcceptSosJob,
} from '@/hooks/use-api';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import {
  Card,
  JobStatusBadge,
  Avatar,
  EmptyState,
  LoadingSpinner,
  COLORS,
  SectionHeader,
  PriceText,
  Badge,
  Button,
  Separator,
} from '@/components/ui';
import Toast from 'react-native-toast-message';

dayjs.extend(relativeTime);
dayjs.locale('vi');

export default function HelperDashboardScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const switchRole = useSwitchRole();
  const { data: profile, isLoading: pLoading } = useHelperProfile();
  const { data: availableJobs, refetch: refetchJobs } = useAvailableJobs(
    undefined,
    1,
    profile?.verification_status === 'approved',
  );
  const { data: myJobs, refetch: refetchMyJobs } = useHelperJobs(
    'confirmed,helper_on_the_way,helper_arrived,in_progress',
  );
  const { data: wallet } = useWallet();
  const { data: unread } = useUnreadCount();
  const setStatus = useSetHelperStatus();
  const acceptSos = useAcceptSosJob();

  const [isOnline, setIsOnline] = useState(false);
  const [sosBroadcast, setSosBroadcast] = useState<any>(null);

  useEffect(() => {
    if (profile?.status) {
      setIsOnline(profile.status === 'online' || profile.status === 'busy');
    }
  }, [profile?.status]);

  // ── Lắng nghe tín hiệu cứu hộ SOS khẩn cấp qua WebSocket ─────────────────
  useEffect(() => {
    const unsub = socketService.on(SOCKET_EVENTS.SOS_BROADCAST, (data: any) => {
      setSosBroadcast(data);
      Toast.show({
        type: 'error',
        text1: '🚨 CỨU HỘ KHẨN CẤP SOS GẦN BẠN!',
        text2: `${data.title} tại ${data.district}. Phụ phí +${data.surcharge?.toLocaleString()}đ`,
        visibilityTime: 10000,
      });
    });
    return () => {
      unsub();
    };
  }, []);

  const handleAcceptSos = async () => {
    if (!sosBroadcast?.job_id) return;
    try {
      await acceptSos.mutateAsync(sosBroadcast.job_id);
      const targetId = sosBroadcast.job_id;
      setSosBroadcast(null);
      refetchMyJobs();
      router.push({ pathname: '/helper-job-detail/[id]', params: { id: targetId } });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Không thể nhận đơn cứu hộ';
      Toast.show({ type: 'error', text1: msg });
      setSosBroadcast(null);
    }
  };

  const handleToggleOnline = async (value: boolean) => {
    if (value && profile?.verification_status !== 'approved') {
      Toast.show({
        type: 'error',
        text1: 'Cần xác minh danh tính e-KYC',
        text2: 'Vui lòng nộp CCCD/CMND trong mục Tài khoản để bật nhận việc.',
      });
      return;
    }
    setIsOnline(value);
    await setStatus.mutateAsync(value ? 'online' : 'offline');
  };

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

  const activeJob = myJobs?.[0];
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={pLoading} onRefresh={refetchJobs} colors={[COLORS.primary]} />
        }
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── 1. Top Header Thợ (Safe Insets) ──────────────────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 18,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={user?.full_name} size={44} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                    {user?.full_name}
                  </Text>
                  {profile?.verification_status === 'approved' && (
                    <ShieldCheck size={16} color={COLORS.success} />
                  )}
                </View>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 1 }}>
                  Đối tác Thợ / Người giúp việc
                </Text>
              </View>
            </View>

            {/* Quick Switch to Customer Mode & Bell */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={handleSwitchToCustomer}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: COLORS.secondaryLight,
                  borderWidth: 1,
                  borderColor: '#D0E1FD',
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Home size={14} color={COLORS.secondary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.secondary }}>
                  Đặt việc
                </Text>
              </TouchableOpacity>

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
        </View>

        {/* ── Banner Nhắc nhở e-KYC nếu chưa được duyệt ──────────────── */}
        {profile?.verification_status !== 'approved' && (
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/kyc')}
              style={{
                backgroundColor: profile?.verification_status === 'pending' ? '#FFFBEB' : '#FEF2F2',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1.5,
                borderColor: profile?.verification_status === 'pending' ? '#FDE68A' : '#FECACA',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor:
                    profile?.verification_status === 'pending' ? '#FEF3C7' : '#FEE2E2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {profile?.verification_status === 'pending' ? (
                  <Clock size={20} color="#D97706" />
                ) : (
                  <ShieldCheck size={20} color="#DC2626" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: profile?.verification_status === 'pending' ? '#92400E' : '#991B1B',
                  }}
                >
                  {profile?.verification_status === 'pending'
                    ? 'Hồ sơ e-KYC đang được xét duyệt'
                    : 'Yêu cầu xác thực e-KYC để nhận việc'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: profile?.verification_status === 'pending' ? '#B45309' : '#B91C1C',
                    marginTop: 2,
                    lineHeight: 16,
                  }}
                >
                  {profile?.verification_status === 'pending'
                    ? 'Admin đang kiểm tra CCCD. Bạn sẽ có thể nhận việc ngay khi được duyệt.'
                    : 'Vui lòng chụp CCCD để mở khóa tính năng nhận việc và gửi báo giá.'}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: profile?.verification_status === 'pending' ? '#D97706' : '#DC2626',
                }}
              >
                {profile?.verification_status === 'pending' ? 'Xem →' : 'Xác thực →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 2. Trạng thái Nhận việc Online Toggle ─────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View
            style={{
              backgroundColor: isOnline ? '#1E1E24' : '#FFFFFF',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: isOnline ? 'transparent' : COLORS.gray[200],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: isOnline ? '#10B981' : COLORS.gray[400],
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '800',
                      color: isOnline ? '#FFFFFF' : COLORS.gray[900],
                    }}
                  >
                    {isOnline ? 'Đang nhận đơn mới' : 'Ngoại tuyến (Tắt nhận việc)'}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: isOnline ? 'rgba(255,255,255,0.7)' : COLORS.gray[500],
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  {isOnline
                    ? 'Bạn sẽ nhận được thông báo ngay khi có khách hàng đăng việc gần bạn.'
                    : 'Gạt công tắc để mở radar quét đơn hàng trong bán kính 15km.'}
                </Text>
              </View>

              <Switch
                value={isOnline}
                onValueChange={handleToggleOnline}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
                thumbColor="#FFFFFF"
                disabled={setStatus.isPending}
              />
            </View>
          </View>
        </View>

        {/* ── 3. Thống kê Ví doanh thu & Hiệu suất ─────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Ví tiền */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(helper)/earnings')}
              style={{ flex: 1 }}
            >
              <Card style={{ padding: 14, gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
                    VÍ THU NHẬP
                  </Text>
                  <TrendingUp size={16} color={COLORS.success} />
                </View>
                <PriceText amount={wallet?.balance ?? 0} size={17} color={COLORS.gray[900]} />
                <Text
                  style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 2 }}
                >
                  Rút tiền →
                </Text>
              </Card>
            </TouchableOpacity>

            {/* Đơn hoàn thành */}
            <View style={{ flex: 1 }}>
              <Card style={{ padding: 14, gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
                    ĐÃ LÀM
                  </Text>
                  <Briefcase size={16} color={COLORS.secondary} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
                  {profile?.total_completed ?? 0} đơn
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.gray[400], marginTop: 2 }}>
                  Tỷ lệ nhận 100%
                </Text>
              </Card>
            </View>

            {/* Đánh giá sao */}
            <View style={{ flex: 1 }}>
              <Card style={{ padding: 14, gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
                    UY TÍN
                  </Text>
                  <Star size={16} color="#F59E0B" />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#F59E0B' }}>
                  ★ {profile?.average_rating?.toFixed(1) ?? '5.0'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.gray[400], marginTop: 2 }}>
                  Thợ xuất sắc
                </Text>
              </Card>
            </View>
          </View>
        </View>

        {/* ── 4. Đơn hàng đang nhận làm (Active Job) ─────────────────── */}
        {activeJob && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <SectionHeader
              title="Công việc đang tiến hành"
              subtitle="Nhấn để cập nhật trạng thái di chuyển / hoàn thành"
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: '/helper-job-detail/[id]', params: { id: activeJob._id } })
              }
            >
              <Card style={{ borderWidth: 2, borderColor: COLORS.primary, gap: 10 }}>
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
                    {activeJob.title}
                  </Text>
                  <JobStatusBadge status={activeJob.status} />
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} color={COLORS.gray[500]} />
                    <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                      {activeJob.address?.district}
                    </Text>
                  </View>
                  {activeJob.preferred_time_start && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock size={14} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: 13, color: COLORS.gray[700] }}>
                        {activeJob.preferred_time_start}
                      </Text>
                    </View>
                  )}
                </View>

                <Button
                  title="Cập nhật tiến độ & Nghiệm thu →"
                  size="sm"
                  onPress={() =>
                    router.push({
                      pathname: '/helper-job-detail/[id]',
                      params: { id: activeJob._id },
                    })
                  }
                />
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 5. Đơn hàng mới có thể nhận ─────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <SectionHeader
            title="Đơn hàng gần bạn"
            subtitle={isOnline ? 'Tự động cập nhật đơn mới mỗi 30s' : 'Đang ở chế độ ngoại tuyến'}
            action={isOnline ? 'Xem tất cả' : undefined}
            onAction={() => router.push('/(helper)/jobs')}
          />

          {!isOnline ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
              <EmptyState
                emoji="📴"
                title="Đang tắt nhận việc"
                subtitle="Bật công tắc 'Đang nhận đơn mới' ở trên để xem các công việc đang cần thợ xung quanh bạn."
              />
            </Card>
          ) : !availableJobs?.jobs?.length ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
              <EmptyState
                emoji="🔍"
                title="Chưa có đơn mới xung quanh"
                subtitle="Hệ thống đang quét đơn trong bán kính 15km. Đơn mới sẽ tự động hiển thị tại đây."
              />
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {availableJobs.jobs.map(
                (job: {
                  _id: string;
                  title: string;
                  status: string;
                  service_id: { name: string } | null;
                  address: { district: string; city: string; full_address?: string };
                  total_quotes_count: number;
                  created_at: string;
                  preferred_time_start?: string;
                }) => (
                  <TouchableOpacity
                    key={job._id}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({ pathname: '/helper-job-detail/[id]', params: { id: job._id } })
                    }
                  >
                    <Card style={{ gap: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
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
                        <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>
                          {dayjs(job.created_at).fromNow()}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 8,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Badge
                          label={(job.service_id as { name: string } | null)?.name ?? 'Dịch vụ'}
                          size="sm"
                        />
                        <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                          📍 {job.address?.district ?? 'Quận 1'}
                        </Text>
                        {job.preferred_time_start && (
                          <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
                            • 🕐 {job.preferred_time_start}
                          </Text>
                        )}
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingTop: 8,
                          borderTopWidth: 1,
                          borderTopColor: COLORS.gray[100],
                        }}
                      >
                        <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                          {job.total_quotes_count > 0
                            ? `${job.total_quotes_count} thợ đã báo giá`
                            : 'Chưa có báo giá nào'}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                          Gửi báo giá ngay →
                        </Text>
                      </View>
                    </Card>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── MODAL BÁO ĐỘNG CỨU HỘ SOS KHẨN CẤP CHO THỢ ─────────────── */}
      <Modal visible={!!sosBroadcast} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              gap: 16,
              borderTopWidth: 4,
              borderTopColor: '#DC2626',
            }}
          >
            {/* Header Modal */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#FEF2F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Flame size={24} color="#DC2626" />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#DC2626' }}>
                    YÊU CẦU CỨU HỘ SOS!
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
                    Có mặt khẩn cấp sau 15 - 20 phút
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setSosBroadcast(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: COLORS.gray[100],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} color={COLORS.gray[700]} />
              </TouchableOpacity>
            </View>

            {/* Chi tiết sự cố */}
            <Card
              style={{
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                borderWidth: 1.5,
                padding: 14,
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#991B1B' }}>
                {sosBroadcast?.title}
              </Text>
              <Text style={{ fontSize: 13, color: '#B91C1C', lineHeight: 18 }}>
                {sosBroadcast?.description}
              </Text>
              <Separator my={2} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={16} color="#DC2626" />
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[900], flex: 1 }}
                  numberOfLines={1}
                >
                  {sosBroadcast?.address}
                </Text>
              </View>
            </Card>

            {/* Quyền lợi thu nhập khẩn cấp */}
            <View
              style={{
                backgroundColor: '#ECFDF5',
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#A7F3D0',
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13.5, color: '#065F46', fontWeight: '700' }}>
                  Thu nhập tối thiểu nhận về ví:
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.success }}>
                  255.000₫
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#047857' }}>
                (Bao gồm công cơ bản 200.000₫ + Phụ phí khẩn cấp 100.000₫ - phí sàn 15%)
              </Text>
            </View>

            {/* Nút Nhận cứu hộ ngay */}
            <TouchableOpacity
              activeOpacity={0.88}
              disabled={acceptSos.isPending}
              onPress={handleAcceptSos}
              style={{
                backgroundColor: '#DC2626',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.45,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <Check size={22} color="#FFFFFF" strokeWidth={3} />
              <Text
                style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 }}
              >
                {acceptSos.isPending ? 'ĐANG KHỚP ĐƠN...' : '🚨 NHẬN CỨU HỘ SOS NGAY'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
