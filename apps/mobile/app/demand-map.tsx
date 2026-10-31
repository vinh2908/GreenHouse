// app/demand-map.tsx — Bản đồ nhu cầu cho thợ (Roadmap Phase 2 — Feature 15)
// Xem khu vực nào đang có nhiều đơn chờ báo giá nhất để chủ động di chuyển tới.
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useDemandMap, useHelperProfile, type DemandArea } from '@/hooks/use-api';
import { Card, COLORS, EmptyState } from '@/components/ui';
import { DemandMapView } from '@/components/common/demand-map-view';

export default function DemandMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: helperProfile } = useHelperProfile();
  const { data: areas, isLoading, isRefetching, refetch } = useDemandMap();
  const [focus, setFocus] = useState<DemandArea | null>(null);

  const helperCoords = useMemo(() => {
    const coords = helperProfile?.location?.coordinates;
    if (coords && Array.isArray(coords) && coords.length >= 2 && coords[0] && coords[1]) {
      return { latitude: coords[1], longitude: coords[0] };
    }
    return null;
  }, [helperProfile]);

  const sorted = useMemo(
    () => [...(areas ?? [])].sort((a, b) => b.open_jobs - a.open_jobs),
    [areas],
  );
  const totalJobs = sorted.reduce((sum, a) => sum + a.open_jobs, 0);
  const activeFocus = focus ?? sorted[0] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 8, 20),
          paddingBottom: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 19, fontWeight: '800', color: COLORS.gray[900] }}>
            🗺 Bản đồ nhu cầu
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
            {totalJobs > 0
              ? `${totalJobs} đơn đang chờ báo giá tại ${sorted.length} khu vực`
              : 'Khu vực nào đang cần thợ nhất lúc này'}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Bản đồ Goong nhu cầu (dùng chung Web + App) */}
        <DemandMapView areas={sorted} focus={activeFocus} userCoords={helperCoords} />

        {isLoading ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
              Đang tải dữ liệu bản đồ nhu cầu...
            </Text>
          </Card>
        ) : sorted.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
            <EmptyState
              emoji="🌙"
              title="Chưa có đơn nào đang mở"
              subtitle="Hiện không có đơn chờ báo giá trong khu vực. Bản đồ đang hiển thị vị trí của bạn, đơn mới sẽ xuất hiện ngay khi có khách đăng việc."
            />
          </Card>
        ) : (
          sorted.map((area, idx) => {
            const isFocused =
              activeFocus?.district === area.district && activeFocus?.city === area.city;
            return (
              <TouchableOpacity
                key={`${area.district}-${area.city}`}
                activeOpacity={0.85}
                onPress={() => setFocus(area)}
              >
                <Card
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    borderWidth: isFocused ? 1.5 : 0,
                    borderColor: isFocused ? COLORS.primary : 'transparent',
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: idx === 0 ? '#DCFCE7' : COLORS.gray[100],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 17 }}>{idx === 0 ? '🔥' : '📍'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
                      {area.district}
                      {area.city ? `, ${area.city}` : ''}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500], marginTop: 2 }}>
                      {area.open_jobs} đơn đang chờ báo giá
                      {area.fixed_price_jobs ? ` · ${area.fixed_price_jobs} giá cam kết` : ''}
                    </Text>
                  </View>
                  <MapPin size={18} color={isFocused ? COLORS.primary : COLORS.gray[300]} />
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
