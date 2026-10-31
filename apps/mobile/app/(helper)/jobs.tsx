import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, MapPin, Clock, Navigation } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAvailableJobs,
  useHelperJobs,
  useHelperProfile,
  useTeamInvitations,
  useRespondTeamInvitation,
  useAcceptFixedPrice,
} from '@/hooks/use-api';
import { Button, Card, JobStatusBadge, Badge, COLORS, EmptyState } from '@/components/ui';
import { OfflineBanner } from '@/components/common/offline-banner';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const TABS = [
  { key: 'available', label: 'Đơn mới quanh đây' },
  { key: 'active', label: 'Đang thực hiện' },
  { key: 'history', label: 'Lịch sử hoàn tất' },
];

export default function HelperJobsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  // ── Đơn nhóm: lời mời vào nhóm đang chờ (Roadmap Phase 1) ────────────────
  const { data: teamInvitations } = useTeamInvitations();
  const respondInvitation = useRespondTeamInvitation();
  // Feature 7/9: nhận việc trực tiếp (giá cam kết / đơn bảo hành)
  const acceptFixed = useAcceptFixedPrice();
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const { data: helperProfile, isLoading: pLoading } = useHelperProfile();
  const kycStatus = helperProfile?.verification_status as string | undefined;
  const isVerified = kycStatus === 'approved';
  const {
    data: available,
    isLoading: aLoading,
    isRefetching: aRefetching,
    refetch: ra,
  } = useAvailableJobs(undefined, 1, Boolean(isAuth && isVerified !== false));
  const {
    data: active,
    isLoading: acLoading,
    isRefetching: acRefetching,
    refetch: rac,
  } = useHelperJobs(
    'confirmed,helper_on_the_way,helper_arrived,in_progress,pending_review,disputed',
  );
  const {
    data: history,
    isLoading: hLoading,
    isRefetching: hRefetching,
    refetch: rh,
  } = useHelperJobs('completed,cancelled,refunded');

  const datasets = [
    { data: available?.jobs, loading: aLoading, refetching: aRefetching, refetch: ra },
    { data: active, loading: acLoading, refetching: acRefetching, refetch: rac },
    { data: history, loading: hLoading, refetching: hRefetching, refetch: rh },
  ];

  const current = datasets[tab];
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);

  useEffect(() => {
    if (!isAuthLoading && user && user.active_role === 'customer') {
      router.replace('/(customer)/jobs');
    }
  }, [isAuthLoading, user?.active_role, router]);

  if (isAuthLoading || (user && user.active_role === 'customer')) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: 14,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          <View
            style={{
              width: 140,
              height: 24,
              borderRadius: 6,
              backgroundColor: COLORS.gray[200],
            }}
          />
          <View
            style={{
              width: 200,
              height: 14,
              borderRadius: 4,
              backgroundColor: COLORS.gray[100],
              marginTop: 6,
            }}
          />
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map(i => (
            <View
              key={i}
              style={{
                height: 110,
                borderRadius: 16,
                backgroundColor: COLORS.gray[200],
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <OfflineBanner />
      {/* Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.gray[900] }}>
          Quản lý công việc
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
          Xem các đơn hàng mới cần thợ và theo dõi tiến độ công việc
        </Text>
        {/* Bản đồ nhu cầu (Feature 15) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/demand-map')}
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: COLORS.primaryLight,
            borderWidth: 1,
            borderColor: COLORS.primary,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 15 }}>🗺</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 13.5, color: COLORS.gray[900] }}>
              Bản đồ nhu cầu
            </Text>
            <Text style={{ fontSize: 11.5, color: COLORS.gray[500] }}>
              Xem khu vực nào đang có nhiều đơn chờ báo giá nhất
            </Text>
          </View>
          <ChevronRight size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Lời mời vào nhóm (Đơn nhóm) ─────────────────────────────────── */}
      {(teamInvitations ?? []).length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
          <Text style={{ fontWeight: '800', fontSize: 14.5, color: COLORS.gray[900] }}>
            👥 Lời mời vào nhóm ({teamInvitations!.length})
          </Text>
          {teamInvitations!.map(inv => (
            <Card key={inv.job_id} style={{ gap: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.gray[900] }}>
                {inv.title}
              </Text>
              <Text style={{ fontSize: 12.5, color: COLORS.gray[600], lineHeight: 18 }}>
                {inv.address_text ? `📍 ${inv.address_text}\n` : ''}Bạn sẽ nhận {inv.split_percent}%
                tiền công của đơn (sau phí sàn) khi hoàn thành cùng nhóm {inv.helpers_needed} thợ.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="✓ Nhận lời"
                  size="sm"
                  loading={respondInvitation.isPending}
                  onPress={() => respondInvitation.mutate({ jobId: inv.job_id, action: 'accept' })}
                />
                <Button
                  title="Từ chối"
                  size="sm"
                  variant="outline"
                  onPress={() => respondInvitation.mutate({ jobId: inv.job_id, action: 'decline' })}
                />
                <Button
                  title="Xem đơn"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    router.push({
                      pathname: '/helper-job-detail/[id]',
                      params: { id: inv.job_id },
                    })
                  }
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Tabs */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          {TABS.map((t, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={() => setTab(i)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: tab === i ? COLORS.primary : COLORS.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: tab === i ? '800' : '600',
                  color: tab === i ? '#fff' : COLORS.gray[600],
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={current.loading || current.refetching}
            onRefresh={current.refetch}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {tab === 0 && (pLoading || (aLoading && !available)) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
              Đang kiểm tra trạng thái và tải đơn mới...
            </Text>
          </Card>
        ) : tab === 0 && !pLoading && helperProfile && !isVerified ? (
          <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <EmptyState
              emoji={kycStatus === 'pending' ? '⏳' : '🪪'}
              title={
                kycStatus === 'pending'
                  ? 'Hồ sơ e-KYC đang chờ duyệt'
                  : 'Cần xác thực e-KYC để nhận việc'
              }
              subtitle={
                kycStatus === 'pending'
                  ? 'Bạn sẽ thấy đơn mới ngay khi hồ sơ được duyệt (thường trong 24h).'
                  : kycStatus === 'rejected'
                    ? `Hồ sơ bị từ chối${helperProfile?.rejection_reason ? ': ' + helperProfile.rejection_reason : ''}. Vui lòng nộp lại.`
                    : 'Chỉ thợ đã xác thực danh tính mới được xem đơn và gửi báo giá cho khách.'
              }
            />
            {kycStatus !== 'pending' && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/kyc')}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Xác thực ngay</Text>
              </TouchableOpacity>
            )}
          </Card>
        ) : !current.loading && (!current.data || current.data.length === 0) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
            <EmptyState
              emoji={
                tab === 0
                  ? available?.empty_reason === 'outside_working_hours'
                    ? '⏰'
                    : '🔍'
                  : tab === 1
                    ? '📋'
                    : '📚'
              }
              title={
                tab === 0
                  ? available?.empty_reason === 'outside_working_hours'
                    ? 'Không có việc trong khung giờ làm'
                    : 'Chưa có đơn mới'
                  : tab === 1
                    ? 'Không có đơn đang làm'
                    : 'Chưa có lịch sử'
              }
              subtitle={
                tab === 0
                  ? available?.empty_reason === 'outside_working_hours'
                    ? 'Hiện có việc mới nhưng ngoài khung giờ hoạt động bạn đã đăng ký. Bạn có thể cập nhật Lịch làm việc trong Hồ sơ để nhận thêm đơn.'
                    : 'Hệ thống đang quét đơn mới. Đơn sẽ xuất hiện ngay khi có khách đăng việc.'
                  : undefined
              }
            />
          </Card>
        ) : (
          (current.data ?? []).map(
            (job: {
              _id: string;
              title: string;
              status: string;
              service_id: { name: string } | null;
              address: { district: string; city: string };
              total_quotes_count: number;
              created_at: string;
              preferred_time_start?: string;
              distance_km?: number;
              estimated_minutes?: number;
              recurring_plan_id?: string;
              is_recurring?: boolean;
              is_private_offer?: boolean;
              is_fixed_price?: boolean;
              fixed_price?: number;
              is_warranty?: boolean;
            }) => (
              <TouchableOpacity
                key={job._id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/helper-job-detail/[id]', params: { id: job._id } })
                }
              >
                <Card style={{ gap: 10, padding: 16 }}>
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
                        lineHeight: 20,
                      }}
                      numberOfLines={2}
                    >
                      {job.title}
                    </Text>
                    <JobStatusBadge status={job.status} />
                  </View>
                  <View
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Badge
                      label={(job.service_id as { name: string } | null)?.name ?? 'Dịch vụ'}
                      size="sm"
                    />
                    {job.is_private_offer ? (
                      <Badge
                        label="⭐ Gửi riêng cho bạn"
                        size="sm"
                        color="#FDF2F8"
                        textColor="#9D174D"
                      />
                    ) : null}
                    {job.is_recurring || job.recurring_plan_id ? (
                      <Badge label="🔁 Định kỳ" size="sm" color="#EFF6FF" textColor="#1D4ED8" />
                    ) : null}
                    {job.is_fixed_price ? (
                      <Badge
                        label={`🏷️ Giá cam kết ${new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0)}₫`}
                        size="sm"
                        color="#ECFDF5"
                        textColor="#065F46"
                      />
                    ) : null}
                    {job.is_warranty ? (
                      <Badge
                        label="🛡 Bảo hành — Miễn phí"
                        size="sm"
                        color="#FFFBEB"
                        textColor="#92400E"
                      />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={13} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: 12, color: COLORS.gray[600], fontWeight: '500' }}>
                        {job.address?.district || job.address?.city || 'Chưa rõ'}
                      </Text>
                    </View>
                    {job.distance_km != null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Navigation size={13} color={COLORS.primary} />
                        <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>
                          {job.distance_km} km ~ {job.estimated_minutes ?? '?'} phút
                        </Text>
                      </View>
                    )}
                    {job.preferred_time_start && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Clock size={13} color={COLORS.gray[400]} />
                        <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                          🕐 {job.preferred_time_start}
                        </Text>
                      </View>
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
                    <Text style={{ fontSize: 12, color: COLORS.gray[400] }}>
                      {dayjs(job.created_at).fromNow()}
                    </Text>
                    {tab === 0 && (job.is_fixed_price || job.is_warranty) ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={acceptFixed.isPending}
                        onPress={() =>
                          acceptFixed.mutate(job._id, {
                            onSuccess: () =>
                              router.push({
                                pathname: '/helper-job-detail/[id]',
                                params: { id: job._id },
                              }),
                            onError: (err: any) => {
                              const msg =
                                err?.response?.data?.message || 'Nhận việc thất bại. Thử lại sau.';
                              Toast.show({ type: 'error', text1: msg });
                            },
                          })
                        }
                        style={{
                          backgroundColor: COLORS.primary,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                          {job.is_warranty
                            ? '🛡 Nhận việc bảo hành'
                            : `Nhận việc ngay • ${new Intl.NumberFormat('vi-VN').format(job.fixed_price ?? 0)}₫`}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                          {tab === 0 ? 'Báo giá ngay' : 'Xem chi tiết'}
                        </Text>
                        <ChevronRight size={14} color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            ),
          )
        )}
      </ScrollView>
    </View>
  );
}
