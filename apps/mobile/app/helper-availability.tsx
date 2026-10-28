import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useMyAvailability, useUpdateAvailability } from '@/hooks/use-api';
import { Button, Card, COLORS, LoadingSpinner } from '@/components/ui';
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
  const { data, isLoading } = useMyAvailability();
  const update = useUpdateAvailability();

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

  const addBlockedDate = () => {
    const value = newDate.trim();
    if (!DATE_RE.test(value)) {
      Toast.show({ type: 'error', text1: 'Ngày nghỉ phải theo định dạng YYYY-MM-DD' });
      return;
    }
    if (blockedDates.includes(value)) {
      Toast.show({ type: 'error', text1: 'Ngày này đã có trong danh sách nghỉ' });
      return;
    }
    setBlockedDates(prev => [...prev, value].sort());
    setNewDate('');
  };

  const handleSave = async () => {
    if (enabled && days.length === 0) {
      Toast.show({ type: 'error', text1: 'Hãy chọn ít nhất 1 ngày làm việc trong tuần' });
      return;
    }
    if (!HH_MM_RE.test(startTime) || !HH_MM_RE.test(endTime)) {
      Toast.show({ type: 'error', text1: 'Giờ làm việc phải theo định dạng HH:mm' });
      return;
    }
    if (startTime >= endTime) {
      Toast.show({ type: 'error', text1: 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc' });
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
          🗓 Lịch làm việc
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
              Bật lịch làm việc
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.gray[500], marginTop: 2, lineHeight: 19 }}>
              Khi bật, bạn chỉ thấy & được thông báo các đơn rơi vào ngày/giờ làm việc của mình. Khi
              tắt, bạn nhận mọi đơn như trước.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
            thumbColor="#fff"
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Ngày làm việc trong tuần
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DAY_CHIPS.map(({ day, label }) => {
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
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Khung giờ làm việc
          </Text>
          <View style={{ gap: 12 }}>
            <TimeDropdownPicker
              label="Giờ bắt đầu làm việc"
              value={startTime}
              onChange={setStartTime}
              showChips={false}
            />
            <TimeDropdownPicker
              label="Giờ kết thúc làm việc"
              value={endTime}
              onChange={setEndTime}
              showChips={false}
            />
          </View>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Hệ thống chỉ phân phối việc mới trong khung giờ hoạt động này.
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.gray[900] }}>
            Ngày nghỉ lẻ
          </Text>
          {blockedDates.length === 0 ? (
            <Text style={{ fontSize: 13, color: COLORS.gray[500] }}>
              Chưa có ngày nghỉ nào. Thêm ngày bạn bận (đi chơi, lễ, việc riêng…).
            </Text>
          ) : (
            blockedDates.map(d => (
              <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.gray[800] }}>
                  🚫 {d}
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
              placeholder="YYYY-MM-DD (VD: 2026-11-01)"
              placeholderTextColor={COLORS.gray[400]}
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
              onPress={addBlockedDate}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
            >
              <Plus size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>Thêm</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Button title="Lưu lịch làm việc" loading={update.isPending} onPress={handleSave} />
      </ScrollView>
    </View>
  );
}
