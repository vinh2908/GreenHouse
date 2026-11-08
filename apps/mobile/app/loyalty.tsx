import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { formatDateTime } from '@/utils/date-format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star, Gift, Wrench } from 'lucide-react-native';
import dayjs from 'dayjs';
import { useLoyaltyAccount, useLoyaltyHistory } from '@/hooks/use-api';
import {
  Card,
  COLORS,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Separator,
  useThemeColors,
} from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { formatCurrency } from '@/services/i18n';

export default function LoyaltyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang, tLoyaltyTier, fs } = useTranslation();
  const tc = useThemeColors();
  const fmt = (n: number) => formatCurrency(n, lang);

  const getTxLabel = (tx: any) => {
    if (lang === 'en') {
      if (tx.note) {
        return tx.note
          .replace(/^Tích điểm cho đơn/i, 'Earn points for order')
          .replace(/^Đổi điểm cho đơn/i, 'Redeem points for order')
          .replace(/^Hoàn điểm cho đơn/i, 'Refund points for order')
          .replace(/^Điều chỉnh/i, 'Adjustment');
      }
      if (tx.type === 'earn') return t('loyalty_tx_earn');
      if (tx.type === 'redeem') return t('loyalty_tx_redeem');
      return t('loyalty_tx_adjust');
    }
    if (tx.note) return tx.note;
    if (tx.type === 'earn') return t('loyalty_tx_earn');
    if (tx.type === 'redeem') return t('loyalty_tx_redeem');
    return t('loyalty_tx_adjust');
  };

  const getTxIcon = (type: string) => {
    if (type === 'earn') return <Star size={18} color="#F59E0B" fill="#F59E0B" />;
    if (type === 'redeem') return <Gift size={18} color={COLORS.primary} />;
    return <Wrench size={18} color={COLORS.gray[500]} />;
  };
  const {
    data: account,
    isLoading,
    isError: isAccountError,
    refetch: refetchAccount,
    isRefetching: isRefetchingAccount,
  } = useLoyaltyAccount();
  const [historyPage, setHistoryPage] = useState(1);
  const {
    data: history,
    isError: isHistoryError,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = useLoyaltyHistory(historyPage, 30);
  // P2-20: accumulate loaded pages so entries beyond page 1 are reachable.
  const [allHistory, setAllHistory] = useState<any[]>([]);
  useEffect(() => {
    if (!history?.transactions) return;
    setAllHistory(prev => {
      if (historyPage === 1) return history.transactions;
      const seen = new Set(prev.map((t: any) => t._id));
      return [...prev, ...history.transactions.filter((t: any) => !seen.has(t._id))];
    });
  }, [history, historyPage]);

  const handleRefresh = async () => {
    setHistoryPage(1);
    await Promise.all([refetchAccount(), refetchHistory()]);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/profile');
  };

  if (isLoading) return <LoadingSpinner />;

  // P1-27: never render "0 points" when the fetch failed — a failed fetch
  // is indistinguishable from a genuine zero, so show an error + retry.
  if (isAccountError && !account) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tc.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <ErrorState
          title={lang === 'en' ? 'Unable to load loyalty points' : 'Không thể tải điểm thưởng'}
          subtitle={
            lang === 'en'
              ? 'Could not connect to the server. Your points are not 0 — please retry.'
              : 'Không thể kết nối máy chủ. Điểm của bạn không phải là 0 — vui lòng thử lại.'
          }
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  const progress =
    account && account.next_tier_at
      ? Math.min(100, Math.round((account.lifetime_points / account.next_tier_at) * 100))
      : 100;

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack}>
          <ArrowLeft size={22} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
          {t('loyalty_title')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingAccount || isRefetchingHistory}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Balance + tier */}
        <Card style={{ gap: 12, backgroundColor: '#FFFBEB' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Star size={22} color="#D97706" />
            <Text style={{ fontSize: fs(15), fontWeight: '800', color: '#92400E' }}>
              {t('loyalty_tier_name', { tier: tLoyaltyTier(account?.tier_label) })}
            </Text>
          </View>
          <Text style={{ fontSize: fs(32), fontWeight: '800', color: tc.text }}>
            {fmt(account?.points_balance ?? 0)}{' '}
            <Text style={{ fontSize: fs(16), color: tc.textMuted }}>
              {t('loyalty_points_unit')}
            </Text>
          </Text>
          <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
            {t('loyalty_lifetime_summary', {
              lifetime: fmt(account?.lifetime_points ?? 0),
              value: fmt(account?.point_value_vnd ?? 1000),
            })}
          </Text>

          {account?.next_tier_at ? (
            <View style={{ gap: 6 }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 8,
                  backgroundColor: tc.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{ height: '100%', width: `${progress}%`, backgroundColor: '#D97706' }}
                />
              </View>
              <Text style={{ fontSize: fs(12), color: tc.textSecondary }}>
                {t('loyalty_next_tier_hint', {
                  points: fmt(account.points_to_next_tier),
                  target: fmt(account.next_tier_at),
                })}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: fs(12), fontWeight: '700', color: '#92400E' }}>
              {t('loyalty_max_tier')}
            </Text>
          )}
        </Card>

        {/* Perks */}
        <Card style={{ gap: 8 }}>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {t('loyalty_perks_title')}
          </Text>
          <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 20 }}>
            {t('loyalty_perks_body', {
              earn: fmt(account?.earn_vnd_per_point ?? 10000),
              min: fmt(account?.min_redeem_points ?? 100),
            })}
          </Text>
          <Text style={{ fontSize: fs(13), fontWeight: '700', color: tc.text }}>
            {t('loyalty_current_cap_desc', { cap: account?.redemption_cap_percent ?? 20 })}
          </Text>
        </Card>

        {/* History */}
        <View>
          <Text
            style={{
              fontSize: fs(16),
              fontWeight: '800',
              color: tc.text,
              marginBottom: 10,
            }}
          >
            {t('loyalty_history_title')}
          </Text>
          {isHistoryError ? (
            <ErrorState
              title={lang === 'en' ? 'Unable to load point history' : 'Không thể tải lịch sử điểm'}
              subtitle={
                lang === 'en'
                  ? 'Could not connect to the server. Please retry.'
                  : 'Không thể kết nối máy chủ. Vui lòng thử lại.'
              }
              onRetry={() => refetchHistory()}
            />
          ) : !allHistory.length ? (
            <EmptyState
              icon={<Star size={36} color={COLORS.gray[400]} />}
              title={t('loyalty_history_empty_title')}
              subtitle={t('loyalty_history_empty_sub')}
            />
          ) : (
            <Card style={{ gap: 0 }}>
              {allHistory.map((tx, i) => {
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
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 14,
                          backgroundColor: tc.subtle,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {getTxIcon(tx.type)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', fontSize: fs(14), color: tc.text }}>
                          {getTxLabel(tx)}
                        </Text>
                        <Text style={{ fontSize: fs(12), color: tc.textMuted, marginTop: 2 }}>
                          {t('loyalty_balance_after', {
                            time: formatDateTime(dayjs(tx.created_at), lang),
                            balance: fmt(tx.balance_after),
                          })}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: fs(15),
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
          {/* P2-20: load older loyalty history (server already paginates) */}
          {history && historyPage < (history.total_pages ?? 1) && (
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isRefetchingHistory}
              onPress={() => setHistoryPage(p => p + 1)}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tc.surface,
                borderWidth: 1,
                borderColor: tc.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: fs(14), color: COLORS.primary }}>
                {isRefetchingHistory
                  ? lang === 'en'
                    ? 'Loading…'
                    : 'Đang tải…'
                  : lang === 'en'
                    ? 'Load more history'
                    : 'Xem thêm lịch sử'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
