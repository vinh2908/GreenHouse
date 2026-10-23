import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Clock, MapPin } from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useAuthStore } from '@/stores/auth.store';
import { useMyJobs } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Card, JobStatusBadge, EmptyState, COLORS, Badge } from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const TABS = [
  { key: undefined, labelKey: 'jobs_tab_all' },
  { key: 'open,receiving_quotes', labelKey: 'jobs_tab_waiting' },
  { key: 'confirmed,helper_on_the_way,helper_arrived,in_progress', labelKey: 'jobs_tab_working' },
  { key: 'pending_review,disputed', labelKey: 'jobs_tab_review' },
  { key: 'completed,refunded', labelKey: 'jobs_tab_done' },
  { key: 'cancelled', labelKey: 'jobs_tab_cancelled' },
];

export default function CustomerJobsScreen() {
  const router = useRouter();
  const { t, fs } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const user = useAuthStore(s => s.user);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const { data: jobs, isLoading, isRefetching, refetch } = useMyJobs(TABS[activeTab].key);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isAuthLoading && user?.active_role === 'helper') {
      router.replace('/(helper)/jobs');
    }
  }, [isAuthLoading, user?.active_role, router]);

  if (isAuthLoading || user?.active_role === 'helper') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
        {/* Header skeleton */}
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

        {/* Tab bar skeleton */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 10,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: COLORS.gray[100],
          }}
        >
          {[80, 100, 90, 80].map((w, i) => (
            <View
              key={i}
              style={{
                width: w,
                height: 32,
                borderRadius: 16,
                backgroundColor: COLORS.gray[100],
              }}
            />
          ))}
        </View>

        {/* Content skeleton cards */}
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
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <View>
          <Text style={{ fontSize: fs(20), fontWeight: '800', color: COLORS.gray[900] }}>
            {t('jobs_title')}
          </Text>
          <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 2 }}>
            {t('jobs_subtitle')}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/(customer)/booking')}
          style={{
            backgroundColor: COLORS.primary,
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: COLORS.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Tabs Pill Bar */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        >
          {TABS.map((tab, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={() => setActiveTab(i)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: activeTab === i ? COLORS.primary : COLORS.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: activeTab === i ? '800' : '600',
                  color: activeTab === i ? '#fff' : COLORS.gray[600],
                }}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Job Cards List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefetching}
            onRefresh={refetch}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {!isLoading && (!jobs || jobs.length === 0) ? (
          <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
            <EmptyState
              emoji="📋"
              title={t('jobs_empty_title')}
              subtitle={
                activeTab === 0
                  ? t('jobs_empty_sub_all')
                  : `${t('jobs_empty_title')} — "${t(TABS[activeTab].labelKey)}".`
              }
              action={t('jobs_empty_action')}
              onAction={() => router.push('/(customer)/booking')}
            />
          </Card>
        ) : (
          (jobs ?? []).map(
            (job: {
              _id: string;
              title: string;
              status: string;
              service_id: { name: string } | null;
              address: { district: string; city: string };
              total_quotes_count: number;
              created_at: string;
              helper_id?: { full_name: string } | null;
              recurring_plan_id?: string;
              private_offer_helper_id?: string;
              is_warranty?: boolean;
            }) => (
              <TouchableOpacity
                key={job._id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/job-detail/[id]', params: { id: job._id } })
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
                      label={
                        (job.service_id as { name: string } | null)?.name ??
                        t('jobs_service_fallback')
                      }
                      size="sm"
                    />
                    {job.recurring_plan_id ? (
                      <Badge
                        label={t('jobs_badge_recurring')}
                        size="sm"
                        color="#EFF6FF"
                        textColor="#1D4ED8"
                      />
                    ) : null}
                    {job.private_offer_helper_id ? (
                      <Badge
                        label={t('jobs_badge_private')}
                        size="sm"
                        color="#FDF2F8"
                        textColor="#9D174D"
                      />
                    ) : null}
                    {job.is_warranty ? (
                      <Badge
                        label={t('jobs_badge_warranty')}
                        size="sm"
                        color="#FFFBEB"
                        textColor="#92400E"
                      />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={13} color={COLORS.gray[500]} />
                      <Text style={{ fontSize: 12, color: COLORS.gray[600], fontWeight: '500' }}>
                        {job.address?.district ?? 'Quận 1'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Clock size={13} color={COLORS.gray[400]} />
                      <Text style={{ fontSize: 12, color: COLORS.gray[400] }}>
                        {dayjs(job.created_at).fromNow()}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: COLORS.gray[100],
                    }}
                  >
                    {job.helper_id ? (
                      <Text style={{ fontSize: 13, color: COLORS.gray[700], fontWeight: '600' }}>
                        {t('jobs_helper_label')}{' '}
                        <Text style={{ color: COLORS.gray[900], fontWeight: '700' }}>
                          {(job.helper_id as any).full_name}
                        </Text>
                      </Text>
                    ) : (
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: job.total_quotes_count > 0 ? COLORS.primary : COLORS.gray[500],
                          fontWeight: '700',
                        }}
                      >
                        {job.total_quotes_count > 0
                          ? t('jobs_quotes_count', { count: job.total_quotes_count })
                          : t('jobs_waiting_quotes')}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text
                        style={{ fontSize: fs(12.5), color: COLORS.primary, fontWeight: '700' }}
                      >
                        {t('jobs_details')}
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
