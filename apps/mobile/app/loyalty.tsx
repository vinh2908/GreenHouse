import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import dayjs from 'dayjs';
import { useLoyaltyAccount, useLoyaltyHistory } from '@/hooks/use-api';
import { Card, COLORS, EmptyState, LoadingSpinner, Separator } from '@/components/ui';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

const TX_META: Record<string, { label: string; emoji: string }> = {
  earn: { label: 'Tích điểm', emoji: '⭐' },
  redeem: { label: 'Đổi điểm', emoji: '🎁' },
  adjust: { label: 'Điều chỉnh', emoji: '🛠️' },
};

export default function LoyaltyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: account, isLoading, refetch, isRefetching } = useLoyaltyAccount();
  const { data: history } = useLoyaltyHistory(1, 30);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/profile');
  };

  if (isLoading) return <LoadingSpinner />;

  const progress =
    account && account.next_tier_at
      ? Math.min(100, Math.round((account.lifetime_points / account.next_tier_at) * 100))
      : 100;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack}>
          <ArrowLeft size={22} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
          Điểm thành viên
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Balance + tier */}
        <Card style={{ gap: 12, backgroundColor: '#FFFBEB' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Star size={22} color="#D97706" />
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400E' }}>
              Hạng {account?.tier_label ?? 'Thường'}
            </Text>
          </View>
          <Text style={{ fontSize: 32, fontWeight: '800', color: COLORS.gray[900] }}>
            {fmt(account?.points_balance ?? 0)}{' '}
            <Text style={{ fontSize: 16, color: COLORS.gray[500] }}>điểm</Text>
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
            Tổng điểm đã tích lũy: {fmt(account?.lifetime_points ?? 0)} điểm · 1 điểm ={' '}
            {fmt(account?.point_value_vnd ?? 1000)}₫ khi đổi
          </Text>

          {account?.next_tier_at ? (
            <View style={{ gap: 6 }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: COLORS.gray[200],
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{ height: '100%', width: `${progress}%`, backgroundColor: '#D97706' }}
                />
              </View>
              <Text style={{ fontSize: 12, color: COLORS.gray[600] }}>
                Còn {fmt(account.points_to_next_tier)} điểm nữa để lên hạng tiếp theo (
                {fmt(account.next_tier_at)} điểm)
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
              🎉 Bạn đang ở hạng cao nhất!
            </Text>
          )}
        </Card>

        {/* Perks */}
        <Card style={{ gap: 8 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Quyền lợi theo hạng
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 20 }}>
            • Tích điểm: 1 điểm / {fmt(account?.earn_vnd_per_point ?? 10000)}₫ đã thanh toán{'\n'}
            • Hạng Thường (dưới 500 điểm): đổi tối đa 20% giá trị đơn{'\n'}
            • Hạng Bạc (500–1.999 điểm): đổi tối đa 30% giá trị đơn{'\n'}
            • Hạng Vàng (từ 2.000 điểm): đổi tối đa 50% giá trị đơn{'\n'}• Đổi tối thiểu{' '}
            {fmt(account?.min_redeem_points ?? 100)} điểm/lần, áp dụng trong chi tiết đơn khi đã có
            giá chốt.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}>
            Hạng hiện tại của bạn được đổi tối đa {account?.redemption_cap_percent ?? 20}% giá trị
            đơn.
          </Text>
        </Card>

        {/* History */}
        <View>
          <Text
            style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900], marginBottom: 10 }}
          >
            Lịch sử điểm
          </Text>
          {!history?.transactions?.length ? (
            <EmptyState
              emoji="⭐"
              title="Chưa có biến động điểm"
              subtitle="Hoàn thành đơn và thanh toán để bắt đầu tích điểm"
            />
          ) : (
            <Card style={{ gap: 0 }}>
              {history.transactions.map((tx, i) => {
                const meta = TX_META[tx.type] ?? TX_META['adjust'];
                const positive = tx.points > 0;
                return (
                  <View key={tx._id}>
                    {i > 0 && <Separator my={0} />}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{meta?.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.gray[900] }}>
                          {tx.note ?? meta?.label}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                          {dayjs(tx.created_at).format('DD/MM/YYYY HH:mm')} · Số dư sau:{' '}
                          {fmt(tx.balance_after)} điểm
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: positive ? COLORS.success : COLORS.error,
                        }}
                      >
                        {positive ? '+' : ''}
                        {fmt(tx.points)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
