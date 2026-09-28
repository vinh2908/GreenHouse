import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, MapPin, Clock } from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useAvailableJobs, useHelperJobs, useHelperProfile } from '@/hooks/use-api';
import { Card, JobStatusBadge, Badge, COLORS, EmptyState } from '@/components/ui';

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
  const { data: helperProfile, isLoading: pLoading } = useHelperProfile();
  const kycStatus = helperProfile?.verification_status as string | undefined;
  const isVerified = kycStatus === 'approved';
  const {
    data: available,
    isLoading: aLoading,
    isRefetching: aRefetching,
    refetch: ra,
  } = useAvailableJobs(undefined, 1, isVerified);
  const {
    data: active,
    isLoading: acLoading,
    isRefetching: acRefetching,
    refetch: rac,
  } = useHelperJobs('confirmed,helper_on_the_way,helper_arrived,in_progress,pending_review');
  const {
    data: history,
    isLoading: hLoading,
    isRefetching: hRefetching,
    refetch: rh,
  } = useHelperJobs('completed,cancelled');

  const datasets = [
    { data: available?.jobs, loading: aLoading, refetching: aRefetching, refetch: ra },
    { data: active, loading: acLoading, refetching: acRefetching, refetch: rac },
    { data: history, loading: hLoading, refetching: hRefetching, refetch: rh },
  ];

  const current = datasets[tab];
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#fff',
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
      </View>

      {/* Tabs */}
      <View
        style={{
          backgroundColor: '#fff',
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
        {tab === 0 && !pLoading && !isVerified ? (
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
              emoji={tab === 0 ? '🔍' : tab === 1 ? '📋' : '📚'}
              title={
                tab === 0
                  ? 'Chưa có đơn mới'
                  : tab === 1
                    ? 'Không có đơn đang làm'
                    : 'Chưa có lịch sử'
              }
              subtitle={
                tab === 0
                  ? 'Hệ thống đang quét đơn mới. Đơn sẽ xuất hiện ngay khi có khách đăng việc.'
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={13} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: 12, color: COLORS.gray[600], fontWeight: '500' }}>
                        {job.address?.district ?? 'Quận 1'}
                      </Text>
                    </View>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                        {tab === 0 ? 'Báo giá ngay' : 'Xem chi tiết'}
                      </Text>
                      <ChevronRight size={14} color={COLORS.primary} />
                    </View>
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
