import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useMyAvailability, useUpdateAvailability } from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { Button, Card, COLORS, LoadingSpinner, useThemeColors } from '@/components/ui';
import { TimeDropdownPicker } from '@/components/common/time-dropdown-picker';

// JS getDay(): 0 = Chủ nhật … 6 = Thứ 7
const DAY_CHIPS: { day: number; label: string }[] = [
  { day: 0, label: 'CN' },
  { day: 1, label: 'T2' },
  { day: 2, label: 'T3' },
  { day: 3, label: 'T4' },
  { day: 4, label: 'T5' },
  { day: 5, label: 'T6' },
  { day: 6, label: 'T7' },
];

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function HelperAvailabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const { data, isLoading } = useMyAvailability();
  const update = useUpdateAvailability();

  const dayChips = [
    { day: 0, label: lang === 'en' ? 'Sun' : 'CN' },
    { day: 1, label: lang === 'en' ? 'Mon' : 'T2' },
    { day: 2, label: lang === 'en' ? 'Tue' : 'T3' },
    { day: 3, label: lang === 'en' ? 'Wed' : 'T4' },
    { day: 4, label: lang === 'en' ? 'Thu' : 'T5' },
    { day: 5, label: lang === 'en' ? 'Fri' : 'T6' },
    { day: 6, label: lang === 'en' ? 'Sat' : 'T7' },
  ];

  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('19:00');
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled ?? false);
      setDays(data.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]);
      setStartTime(data.start_time ?? '07:00');
      setEndTime(data.end_time ?? '19:00');
      setBlockedDates(data.blocked_dates ?? []);
    }
  }, [data]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(helper)/profile');
  };

  const toggleDay = (day: number) =>
    setDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()));

  const handleToggleEnabled = async (val: boolean) => {
    setEnabled(val);
    try {
      await update.mutateAsync({
        enabled: val,
        days_of_week: days,
        start_time: startTime,
        end_time: endTime,
        blocked_dates: blockedDates,
      });
      Toast.show({
        type: 'success',
        text1: val
          ? lang === 'en'
            ? 'Working schedule enabled'
            : 'Đã bật lịch làm việc'
          : lang === 'en'
            ? 'Working schedule disabled'
            : 'Đã tắt lịch làm việc',
      });
    } catch {
      setEnabled(!val);
    }
  };

  const addBlockedDate = () => {
    const value = newDate.trim();
    if (!DATE_RE.test(value)) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Off date must be in YYYY-MM-DD format'
            : 'Ngày nghỉ phải theo định dạng YYYY-MM-DD',
      });
      return;
    }
    if (blockedDates.includes(value)) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'This date is already in the blocked list'
            : 'Ngày này đã có trong danh sách nghỉ',
      });
      return;
    }
    setBlockedDates(prev => [...prev, value].sort());
    setNewDate('');
  };

  const handleSave = async () => {
    if (enabled && days.length === 0) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Please select at least 1 working day per week'
            : 'Hãy chọn ít nhất 1 ngày làm việc trong tuần',
      });
      return;
    }
    if (!HH_MM_RE.test(startTime) || !HH_MM_RE.test(endTime)) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Working hours must be in HH:mm format'
            : 'Giờ làm việc phải theo định dạng HH:mm',
      });
      return;
    }
    if (startTime >= endTime) {
      Toast.show({
        type: 'error',
        text1:
          lang === 'en'
            ? 'Start time must be before end time'
            : 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc',
      });
      return;
    }
    await update.mutateAsync({
      enabled,
      days_of_week: days,
      start_time: startTime,
      end_time: endTime,
      blocked_dates: blockedDates,
    });
  };

  if (isLoading) return <LoadingSpinner />;

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
          {lang === 'en' ? 'Working Schedule' : 'Lịch làm việc'}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
              {lang === 'en' ? 'Enable Working Schedule' : 'Bật lịch làm việc'}
            </Text>
            <Text style={{ fontSize: fs(13), color: tc.textMuted, marginTop: 2, lineHeight: 19 }}>
              {lang === 'en'
                ? 'When enabled, you only see & get notified for jobs during your working days/hours. When disabled, you receive all jobs as usual.'
                : 'Khi bật, bạn chỉ thấy & được thông báo các đơn rơi vào ngày/giờ làm việc của mình. Khi tắt, bạn nhận mọi đơn như trước.'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggleEnabled}
            trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
            thumbColor="#fff"
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'Working Days of Week' : 'Ngày làm việc trong tuần'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {dayChips.map(({ day, label }) => {
              const active = days.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  activeOpacity={0.8}
                  onPress={() => toggleDay(day)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: active ? COLORS.primary : COLORS.gray[200],
                    backgroundColor: active ? COLORS.primaryLight : '#fff',
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '800',
                      color: active ? COLORS.primaryDark : COLORS.gray[600],
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'Working Hours' : 'Khung giờ làm việc'}
          </Text>
          <View style={{ gap: 12 }}>
            <TimeDropdownPicker
              label={lang === 'en' ? 'Start work time' : 'Giờ bắt đầu làm việc'}
              value={startTime}
              onChange={setStartTime}
              showChips={false}
              checkPast={false}
            />
            <TimeDropdownPicker
              label={lang === 'en' ? 'End work time' : 'Giờ kết thúc làm việc'}
              value={endTime}
              onChange={setEndTime}
              showChips={false}
              checkPast={false}
            />
          </View>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en'
              ? 'The system only dispatches new jobs during this active timeframe.'
              : 'Hệ thống chỉ phân phối việc mới trong khung giờ hoạt động này.'}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: fs(15), color: tc.text }}>
            {lang === 'en' ? 'Custom Days Off' : 'Ngày nghỉ lẻ'}
          </Text>
          {blockedDates.length === 0 ? (
            <Text style={{ fontSize: fs(13), color: tc.textMuted }}>
              {lang === 'en'
                ? 'No days off added. Add days when you are unavailable (trips, holidays, personal events...).'
                : 'Chưa có ngày nghỉ nào. Thêm ngày bạn bận (đi chơi, lễ, việc riêng…).'}
            </Text>
          ) : (
            blockedDates.map(d => (
              <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: fs(14), fontWeight: '700', color: tc.text }}>
                  {d}
                </Text>
                <TouchableOpacity
                  onPress={() => setBlockedDates(prev => prev.filter(x => x !== d))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={17} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={newDate}
              onChangeText={setNewDate}
              placeholder={
                lang === 'en' ? 'YYYY-MM-DD (e.g. 2026-11-01)' : 'YYYY-MM-DD (VD: 2026-11-01)'
              }
              placeholderTextColor={COLORS.gray[400]}
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
              onPress={addBlockedDate}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 14,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
            >
              <Plus size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fs(13.5) }}>
                {lang === 'en' ? 'Add' : 'Thêm'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Button
          title={lang === 'en' ? 'Save Schedule' : 'Lưu lịch làm việc'}
          loading={update.isPending}
          onPress={handleSave}
        />
      </ScrollView>
    </View>
  );
}
