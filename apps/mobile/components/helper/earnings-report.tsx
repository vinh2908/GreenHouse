import { useEffect, useState } from 'react';
import { vnDateKey } from '@/utils/date-format';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEarningsReport, useSetIncomeGoal } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Card, COLORS, useThemeColors } from '@/components/ui';
import { formatCurrency } from '@/services/i18n';

const fmt = (n: number, l: any = 'vi') => formatCurrency(n, l);
const WEEKDAY_LABELS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']; // days[] bắt đầu từ Thứ 2
const WEEKDAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ChangeChip({ percent, lang }: { percent: number | null; lang?: string }) {
  const { fs } = useTranslation();
  const tc = useThemeColors();
  if (percent === null || percent === undefined) {
    return (
      <Text style={{ fontSize: fs(12), color: tc.textMuted, fontWeight: '600' }}>
        {lang === 'en'
          ? 'No prior period data for comparison'
          : 'Chưa có dữ liệu kỳ trước để so sánh'}
      </Text>
    );
  }
  const up = percent >= 0;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: up ? COLORS.successLight : COLORS.errorLight,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
      }}
    >
      <Text
        style={{ fontSize: fs(12), fontWeight: '800', color: up ? COLORS.success : COLORS.error }}
      >
        {up ? '▲' : '▼'} {up ? '+' : ''}
        {percent}% {lang === 'en' ? 'vs prior period' : 'so với kỳ trước'}
      </Text>
    </View>
  );
}

/**
 * Báo cáo thu nhập nâng cao (Feature 14) — gắn vào màn hình Thu nhập của thợ.
 * Mọi số liệu là NET (thu nhập − phí sàn) do API tính.
 * Biểu đồ cột vẽ bằng View thuần (không thêm thư viện chart).
 */
export function EarningsReport() {
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const fmt = (n: number) => formatCurrency(n, lang);
  const { data: report, isLoading, isError, refetch } = useEarningsReport();
  const setGoal = useSetIncomeGoal();
  const [goalText, setGoalText] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);

  useEffect(() => {
    if (report?.goal?.monthly_goal) setGoalText(String(report.goal.monthly_goal));
  }, [report?.goal?.monthly_goal]);

  if (isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
          {lang === 'en' ? 'Income Report' : 'Báo cáo thu nhập'}
        </Text>
        <Card style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={{ fontSize: fs(13), color: tc.textMuted, fontWeight: '600' }}>
            {lang === 'en'
              ? 'Loading income report data...'
              : 'Đang tải dữ liệu báo cáo thu nhập...'}
          </Text>
        </Card>
      </View>
    );
  }

  if (isError || !report) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
          {lang === 'en' ? 'Income Report' : 'Báo cáo thu nhập'}
        </Text>
        <Card style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Text style={{ fontSize: fs(14), color: tc.textSecondary, fontWeight: '700' }}>
            {lang === 'en' ? 'No income report data' : 'Chưa có dữ liệu báo cáo thu nhập'}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted, textAlign: 'center' }}>
            {lang === 'en'
              ? 'Figures will aggregate automatically after completing your first jobs.'
              : 'Số liệu sẽ tự động tổng hợp khi bạn hoàn thành các đơn hàng đầu tiên.'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => refetch()}
            style={{
              marginTop: 4,
              backgroundColor: COLORS.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13) }}>
              {lang === 'en' ? 'Retry' : 'Thử lại'}
            </Text>
          </TouchableOpacity>
        </Card>
      </View>
    );
  }

  const weekLabels = lang === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_VI;
  const weekMax = Math.max(1, ...report.week.days.map(d => Math.max(0, d.amount)));
  const monthWeekMax = Math.max(1, ...report.month.by_week.map(w => Math.max(0, w.amount)));
  const goal = report.goal;

  const saveGoal = async () => {
    const amount = Number(goalText.replace(/[^\d]/g, ''));
    if (Number.isNaN(amount) || amount < 0) return;
    await setGoal.mutateAsync(amount);
    setEditingGoal(false);
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
        {lang === 'en' ? 'Income Report' : 'Báo cáo thu nhập'}
      </Text>

      {/* ── Tuần này ─────────────────────────────────────────────────── */}
      <Card style={{ gap: 12 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'This Week (Mon – Sun)' : 'Tuần này (T2 – CN)'}
          </Text>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: COLORS.primaryDark }}>
            {fmt(report.week.total)}₫
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            height: 110,
            gap: 6,
          }}
        >
          {report.week.days.map((d, i) => {
            const heightPct = Math.max(3, (Math.max(0, d.amount) / weekMax) * 100);
            const isToday = d.date === vnDateKey();
            return (
              <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: fs(9.5), color: tc.textMuted, fontWeight: '600' }}>
                  {d.amount > 0 ? `${Math.round(d.amount / 1000)}k` : ''}
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: 70,
                    justifyContent: 'flex-end',
                    backgroundColor: tc.subtle,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: isToday ? COLORS.primaryDark : COLORS.primary,
                      borderRadius: 8,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: fs(11),
                    fontWeight: isToday ? '800' : '600',
                    color: isToday ? COLORS.primaryDark : COLORS.gray[500],
                  }}
                >
                  {weekLabels[i]}
                </Text>
              </View>
            );
          })}
        </View>
        <ChangeChip percent={report.week.change_percent} lang={lang} />
      </Card>

      {/* ── Tháng này ────────────────────────────────────────────────── */}
      <Card style={{ gap: 10 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'This Month' : 'Tháng này'}
          </Text>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: COLORS.primaryDark }}>
            {fmt(report.month.total)}₫
          </Text>
        </View>
        <Text style={{ fontSize: fs(13), color: tc.textSecondary }}>
          {lang === 'en' ? 'From ' : 'Từ '}
          {report.month.jobs_earning_count}{' '}
          {lang === 'en' ? 'income entries · Prev month: ' : 'khoản thu nhập · Tháng trước: '}
          {fmt(report.month.prev_month_total)}₫
        </Text>
        <ChangeChip percent={report.month.change_percent} lang={lang} />

        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 8, marginTop: 4 }}
        >
          {report.month.by_week.map(w => {
            const heightPct = Math.max(4, (Math.max(0, w.amount) / monthWeekMax) * 100);
            return (
              <View key={w.week} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: '100%',
                    height: 40,
                    justifyContent: 'flex-end',
                    backgroundColor: tc.subtle,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: COLORS.secondary,
                      borderRadius: 8,
                    }}
                  />
                </View>
                <Text style={{ fontSize: fs(11), fontWeight: '600', color: tc.textMuted }}>
                  {lang === 'en' ? 'Wk ' : 'Tuần '}
                  {w.week}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* ── Mục tiêu tháng ───────────────────────────────────────────── */}
      <Card style={{ gap: 10 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'Monthly Goal' : 'Mục tiêu tháng'}
          </Text>
          <TouchableOpacity onPress={() => setEditingGoal(v => !v)}>
            <Text style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primaryDark }}>
              {editingGoal
                ? lang === 'en'
                  ? 'Cancel'
                  : 'Hủy'
                : goal.monthly_goal > 0
                  ? lang === 'en'
                    ? 'Edit goal'
                    : 'Sửa mục tiêu'
                  : lang === 'en'
                    ? 'Set goal'
                    : 'Đặt mục tiêu'}
            </Text>
          </TouchableOpacity>
        </View>

        {goal.monthly_goal > 0 ? (
          <>
            <Text style={{ fontSize: fs(13.5), color: tc.textSecondary }}>
              {lang === 'en' ? 'Achieved ' : 'Đã đạt '}
              {fmt(goal.earned_this_month)}₫ / {fmt(goal.monthly_goal)}₫ ({goal.progress_percent}%)
            </Text>
            <View
              style={{
                height: 12,
                borderRadius: 8,
                backgroundColor: tc.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, goal.progress_percent))}%`,
                  backgroundColor: COLORS.primary,
                }}
              />
            </View>
          </>
        ) : (
          <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
            {lang === 'en'
              ? 'No goal set yet. Set a monthly income goal to track daily progress.'
              : 'Chưa đặt mục tiêu. Đặt mục tiêu thu nhập tháng để theo dõi tiến độ mỗi ngày.'}
          </Text>
        )}

        {editingGoal && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={goalText}
              onChangeText={v => setGoalText(v.replace(/[^\d]/g, ''))}
              placeholder="VD: 15000000"
              placeholderTextColor={COLORS.gray[400]}
              keyboardType="numeric"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: tc.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: fs(14),
                fontWeight: '700',
                color: tc.text,
                backgroundColor: tc.surface,
              }}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={saveGoal}
              disabled={setGoal.isPending}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 14,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13.5) }}>
                {lang === 'en' ? 'Save' : 'Lưu'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      <Text style={{ fontSize: fs(11.5), color: tc.textMuted }}>
        {lang === 'en'
          ? '* Figures represent net earnings (platform fees deducted).'
          : '* Số liệu là thu nhập ròng (đã trừ phí sàn đối với đơn tiền mặt).'}
      </Text>
    </View>
  );
}
