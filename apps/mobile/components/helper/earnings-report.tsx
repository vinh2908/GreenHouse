import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import dayjs from 'dayjs';
import { useEarningsReport, useSetIncomeGoal } from '@/hooks/use-api';
import { Card, COLORS } from '@/components/ui';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']; // days[] bắt đầu từ Thứ 2

function ChangeChip({ percent }: { percent: number | null }) {
  if (percent === null || percent === undefined) {
    return (
      <Text style={{ fontSize: 12, color: COLORS.gray[500], fontWeight: '600' }}>
        Chưa có dữ liệu kỳ trước để so sánh
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
        style={{ fontSize: 12, fontWeight: '800', color: up ? COLORS.success : COLORS.error }}
      >
        {up ? '▲' : '▼'} {up ? '+' : ''}
        {percent}% so với kỳ trước
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
  const { data: report } = useEarningsReport();
  const setGoal = useSetIncomeGoal();
  const [goalText, setGoalText] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);

  useEffect(() => {
    if (report?.goal.monthly_goal) setGoalText(String(report.goal.monthly_goal));
  }, [report?.goal.monthly_goal]);

  if (!report) return null;

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
      <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
        📊 Báo cáo thu nhập
      </Text>

      {/* ── Tuần này ─────────────────────────────────────────────────── */}
      <Card style={{ gap: 12 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Tuần này (T2 – CN)
          </Text>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.primaryDark }}>
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
            const isToday = d.date === dayjs().format('YYYY-MM-DD');
            return (
              <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 9.5, color: COLORS.gray[500], fontWeight: '600' }}>
                  {d.amount > 0 ? `${Math.round(d.amount / 1000)}k` : ''}
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: 70,
                    justifyContent: 'flex-end',
                    backgroundColor: COLORS.gray[100],
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: isToday ? COLORS.primaryDark : COLORS.primary,
                      borderRadius: 6,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: isToday ? '800' : '600',
                    color: isToday ? COLORS.primaryDark : COLORS.gray[500],
                  }}
                >
                  {WEEKDAY_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
        <ChangeChip percent={report.week.change_percent} />
      </Card>

      {/* ── Tháng này ────────────────────────────────────────────────── */}
      <Card style={{ gap: 10 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Tháng này
          </Text>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.primaryDark }}>
            {fmt(report.month.total)}₫
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: COLORS.gray[600] }}>
          Từ {report.month.jobs_earning_count} khoản thu nhập · Tháng trước:{' '}
          {fmt(report.month.prev_month_total)}₫
        </Text>
        <ChangeChip percent={report.month.change_percent} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 8, marginTop: 4 }}>
          {report.month.by_week.map(w => {
            const heightPct = Math.max(4, (Math.max(0, w.amount) / monthWeekMax) * 100);
            return (
              <View key={w.week} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: '100%',
                    height: 40,
                    justifyContent: 'flex-end',
                    backgroundColor: COLORS.gray[100],
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: COLORS.secondary,
                      borderRadius: 6,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.gray[500] }}>
                  Tuần {w.week}
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
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            🎯 Mục tiêu tháng
          </Text>
          <TouchableOpacity onPress={() => setEditingGoal(v => !v)}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primaryDark }}>
              {editingGoal ? 'Hủy' : goal.monthly_goal > 0 ? 'Sửa mục tiêu' : 'Đặt mục tiêu'}
            </Text>
          </TouchableOpacity>
        </View>

        {goal.monthly_goal > 0 ? (
          <>
            <Text style={{ fontSize: 13.5, color: COLORS.gray[700] }}>
              Đã đạt {fmt(goal.earned_this_month)}₫ / {fmt(goal.monthly_goal)}₫ (
              {goal.progress_percent}%)
            </Text>
            <View
              style={{
                height: 12,
                borderRadius: 6,
                backgroundColor: COLORS.gray[200],
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
          <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
            Chưa đặt mục tiêu. Đặt mục tiêu thu nhập tháng để theo dõi tiến độ mỗi ngày.
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
                borderColor: COLORS.gray[200],
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                fontWeight: '700',
                color: COLORS.gray[900],
                backgroundColor: '#fff',
              }}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={saveGoal}
              disabled={setGoal.isPending}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>Lưu</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      <Text style={{ fontSize: 11.5, color: COLORS.gray[400] }}>
        * Số liệu là thu nhập ròng (đã trừ phí sàn đối với đơn tiền mặt).
      </Text>
    </View>
  );
}
