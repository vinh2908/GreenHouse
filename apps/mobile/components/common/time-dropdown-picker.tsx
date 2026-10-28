import React, { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Clock, ChevronDown, Check, X } from 'lucide-react-native';
import { COLORS } from '@/components/ui';

export const ORIGINAL_TIME_CHIPS = [
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
  '11:30',
  '12:00',
  '13:30',
  '14:00',
  '17:00',
  '17:30',
  '18:00',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
];

/** Giờ hiện tại theo múi giờ Asia/Ho_Chi_Minh (UTC+7) */
export function getNowVietnam(): { hours: number; minutes: number; dateStr: string; totalMinutes: number } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 7 * 3600000);
  const hours = vnTime.getHours();
  const minutes = vnTime.getMinutes();
  const y = vnTime.getFullYear();
  const m = String(vnTime.getMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getDate()).padStart(2, '0');
  return {
    hours,
    minutes,
    dateStr: `${y}-${m}-${d}`,
    totalMinutes: hours * 60 + minutes,
  };
}

/** Kiểm tra xem 1 ngày có phải là HÔM NAY theo giờ VN hay không */
export function isTodayVietnam(dateInput?: string | Date | null): boolean {
  if (!dateInput) return true;
  const vn = getNowVietnam();
  let inputStr = '';
  if (typeof dateInput === 'string') {
    inputStr = dateInput.trim().split('T')[0];
  } else if (dateInput instanceof Date) {
    const utc = dateInput.getTime() + dateInput.getTimezoneOffset() * 60000;
    const d = new Date(utc + 7 * 3600000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    inputStr = `${y}-${m}-${day}`;
  }
  return inputStr === vn.dateStr;
}

/** Format thời lượng: "1 giờ 10 phút", "2 giờ 20 phút", "30 phút" (không thập phân 1,17 giờ) */
export function formatDurationVi(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '0 phút';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

/** Tính giờ kết thúc dự kiến = bắt đầu + thời lượng */
export function calcEndTime(
  timeStart: string,
  durationMinutes: number,
): { timeEnd: string; isNextDay: boolean } | null {
  if (!timeStart || !/^\d{1,2}:\d{2}$/.test(timeStart.trim()) || !durationMinutes || durationMinutes <= 0) {
    return null;
  }
  const [sh, sm] = timeStart.trim().split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || sh < 0 || sh > 23 || sm < 0 || sm > 59) {
    return null;
  }
  const total = sh * 60 + sm + durationMinutes;
  const isNextDay = total >= 24 * 60;
  const modTotal = total % (24 * 60);
  const eh = Math.floor(modTotal / 60);
  const em = modTotal % 60;
  return {
    timeEnd: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
    isNextDay,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 1: TimeDropdownPicker (Chọn giờ & phút cho thời điểm bắt đầu/kết thúc)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeDropdownPickerProps {
  value: string; // 'HH:mm'
  onChange: (value: string) => void;
  selectedDate?: string | Date | null;
  label?: string;
  showChips?: boolean;
  minTime?: string; // e.g. '07:00' cho màn hình thợ bắt đầu < kết thúc
  onValidityChange?: (isValid: boolean) => void;
}

export function TimeDropdownPicker({
  value,
  onChange,
  selectedDate,
  label = 'Giờ bắt đầu',
  showChips = true,
  minTime,
  onValidityChange,
}: TimeDropdownPickerProps) {
  const [modalType, setModalType] = useState<'hour' | 'minute' | null>(null);

  // Parse current value
  const [currentHour, currentMinute] = useMemo(() => {
    if (value && /^\d{1,2}:\d{2}$/.test(value.trim())) {
      const [h, m] = value.trim().split(':').map(Number);
      return [Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, m))];
    }
    return [19, 0];
  }, [value]);

  const isToday = isTodayVietnam(selectedDate);
  const nowVn = getNowVietnam();

  // Kiểm tra giờ quá khứ
  const isPast = useMemo(() => {
    if (!isToday) return false;
    const selectedTotal = currentHour * 60 + currentMinute;
    return selectedTotal < nowVn.totalMinutes;
  }, [isToday, currentHour, currentMinute, nowVn.totalMinutes]);

  const isBeforeMinTime = useMemo(() => {
    if (!minTime || !/^\d{1,2}:\d{2}$/.test(minTime.trim())) return false;
    const [mh, mm] = minTime.trim().split(':').map(Number);
    const minTotal = mh * 60 + mm;
    const selectedTotal = currentHour * 60 + currentMinute;
    return selectedTotal <= minTotal;
  }, [minTime, currentHour, currentMinute]);

  const isValid = !isPast && !isBeforeMinTime;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  // Lọc và sắp xếp chip gợi ý
  const { filteredChips, noChipsToday } = useMemo(() => {
    if (!isToday) {
      // Ngày mai trở đi: hiển thị toàn bộ theo thứ tự thời gian
      return { filteredChips: ORIGINAL_TIME_CHIPS, noChipsToday: false };
    }
    // Hôm nay: chỉ lấy chip > giờ hiện tại, sắp xếp theo độ gần với giờ hiện tại tăng dần
    const futureChips = ORIGINAL_TIME_CHIPS.filter(chip => {
      const [ch, cm] = chip.split(':').map(Number);
      return ch * 60 + cm > nowVn.totalMinutes;
    }).sort((a, b) => {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });

    return {
      filteredChips: futureChips,
      noChipsToday: futureChips.length === 0,
    };
  }, [isToday, nowVn.totalMinutes]);

  // Tự động chọn chip tương lai gần nhất nếu người dùng đang chọn giờ quá khứ trong hôm nay
  const autoSwitchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isToday && isPast && filteredChips.length > 0) {
      const nearestFutureChip = filteredChips[0];
      if (autoSwitchedRef.current !== nearestFutureChip) {
        autoSwitchedRef.current = nearestFutureChip;
        onChange(nearestFutureChip);
      }
    }
  }, [isToday, isPast, filteredChips, onChange]);

  const handleSelectHour = (h: number) => {
    const formatted = `${String(h).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    onChange(formatted);
    setModalType(null);
  };

  const handleSelectMinute = (m: number) => {
    const formatted = `${String(currentHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange(formatted);
    setModalType(null);
  };

  const handleSelectChip = (chip: string) => {
    onChange(chip);
  };

  const activeChip = useMemo(() => {
    const currentFormatted = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    return ORIGINAL_TIME_CHIPS.includes(currentFormatted) ? currentFormatted : null;
  }, [currentHour, currentMinute]);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}

      {/* 2 Ô Dropdown Giờ & Phút */}
      <View style={styles.dropdownRow}>
        {/* Ô Giờ */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setModalType('hour')}
          style={[styles.dropdownPill, isPast && styles.dropdownPillError]}
        >
          <Clock size={16} color={isPast ? COLORS.error : COLORS.primary} />
          <Text style={styles.dropdownValue}>{String(currentHour).padStart(2, '0')}</Text>
          <Text style={styles.dropdownUnit}>giờ</Text>
          <ChevronDown size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>

        <Text style={styles.separatorColon}>:</Text>

        {/* Ô Phút */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setModalType('minute')}
          style={[styles.dropdownPill, isPast && styles.dropdownPillError]}
        >
          <Text style={styles.dropdownValue}>{String(currentMinute).padStart(2, '0')}</Text>
          <Text style={styles.dropdownUnit}>phút</Text>
          <ChevronDown size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>
      </View>

      {/* Cảnh báo giờ quá khứ hoặc trước minTime */}
      {isPast ? (
        <Text style={styles.errorText}>⚠️ Thời điểm bắt đầu không thể ở quá khứ</Text>
      ) : isBeforeMinTime ? (
        <Text style={styles.errorText}>⚠️ Giờ kết thúc phải lớn hơn giờ bắt đầu</Text>
      ) : null}

      {/* Chip gợi ý khung giờ */}
      {showChips && (
        <View style={styles.chipsSection}>
          <Text style={styles.chipsInstruction}>bấm là chọn đúng giờ đó</Text>

          {noChipsToday ? (
            <Text style={styles.noChipsText}>Hôm nay đã hết khung giờ gợi ý</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {filteredChips.map(chip => {
                const isSelected = activeChip === chip;
                return (
                  <TouchableOpacity
                    key={chip}
                    activeOpacity={0.75}
                    onPress={() => handleSelectChip(chip)}
                    style={[styles.timeChip, isSelected && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Modal Chọn Giờ (00–23) */}
      <Modal
        visible={modalType === 'hour'}
        transparent
        animationType="fade"
        onRequestClose={() => setModalType(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalType(null)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn Giờ (00 – 23)</Text>
              <TouchableOpacity onPress={() => setModalType(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 24 }, (_, i) => i).map(h => {
                const isSelected = h === currentHour;
                // Nếu hôm nay và giờ < giờ hiện tại
                const isHourPast = isToday && h < nowVn.hours;
                return (
                  <TouchableOpacity
                    key={h}
                    activeOpacity={isHourPast ? 1 : 0.7}
                    disabled={isHourPast}
                    onPress={() => handleSelectHour(h)}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemActive,
                      isHourPast && styles.modalItemDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                        isHourPast && styles.modalItemTextDisabled,
                      ]}
                    >
                      {String(h).padStart(2, '0')}:00 {isHourPast ? '(đã qua)' : ''}
                    </Text>
                    {isSelected && <Check size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Chọn Phút (00–59) */}
      <Modal
        visible={modalType === 'minute'}
        transparent
        animationType="fade"
        onRequestClose={() => setModalType(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalType(null)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn Phút (00 – 59)</Text>
              <TouchableOpacity onPress={() => setModalType(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 60 }, (_, i) => i).map(m => {
                const isSelected = m === currentMinute;
                const isMinPast = isToday && currentHour === nowVn.hours && m < nowVn.minutes;
                return (
                  <TouchableOpacity
                    key={m}
                    activeOpacity={isMinPast ? 1 : 0.7}
                    disabled={isMinPast}
                    onPress={() => handleSelectMinute(m)}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemActive,
                      isMinPast && styles.modalItemDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                        isMinPast && styles.modalItemTextDisabled,
                      ]}
                    >
                      {String(m).padStart(2, '0')} phút {isMinPast ? '(đã qua)' : ''}
                    </Text>
                    {isSelected && <Check size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 2: DurationDropdownPicker (Chọn thời lượng theo Giờ 0-12 và Phút 00-59)
// ─────────────────────────────────────────────────────────────────────────────

export interface DurationDropdownPickerProps {
  valueMinutes: number;
  onChangeMinutes: (minutes: number) => void;
  label?: string;
  minMinutes?: number;
  maxMinutes?: number;
}

const PRESET_DURATIONS = [
  { label: '30 phút', minutes: 30 },
  { label: '1 giờ', minutes: 60 },
  { label: '1h 10p', minutes: 70 },
  { label: '2 giờ', minutes: 120 },
  { label: '2h 20p', minutes: 140 },
  { label: '3 giờ', minutes: 180 },
  { label: '4 giờ', minutes: 240 },
];

export function DurationDropdownPicker({
  valueMinutes,
  onChangeMinutes,
  label = 'Thời lượng',
  minMinutes = 15,
  maxMinutes = 720, // 12h
}: DurationDropdownPickerProps) {
  const [modalType, setModalType] = useState<'hour' | 'minute' | null>(null);

  const durationHours = Math.floor(valueMinutes / 60);
  const durationMinutes = valueMinutes % 60;

  const handleSelectHour = (h: number) => {
    const newTotal = h * 60 + durationMinutes;
    const clamped = Math.max(minMinutes, Math.min(maxMinutes, newTotal));
    onChangeMinutes(clamped);
    setModalType(null);
  };

  const handleSelectMinute = (m: number) => {
    const newTotal = durationHours * 60 + m;
    const clamped = Math.max(minMinutes, Math.min(maxMinutes, newTotal));
    onChangeMinutes(clamped);
    setModalType(null);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}

      {/* 2 Ô Dropdown Giờ & Phút thời lượng */}
      <View style={styles.dropdownRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setModalType('hour')}
          style={styles.dropdownPill}
        >
          <Clock size={16} color={COLORS.primary} />
          <Text style={styles.dropdownValue}>{durationHours}</Text>
          <Text style={styles.dropdownUnit}>giờ</Text>
          <ChevronDown size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>

        <Text style={styles.separatorColon}>+</Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setModalType('minute')}
          style={styles.dropdownPill}
        >
          <Text style={styles.dropdownValue}>{String(durationMinutes).padStart(2, '0')}</Text>
          <Text style={styles.dropdownUnit}>phút</Text>
          <ChevronDown size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>
      </View>

      {/* Chip thời lượng nhanh */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipsScroll, { marginTop: 10 }]}
      >
        {PRESET_DURATIONS.map(d => {
          const isSelected = valueMinutes === d.minutes;
          return (
            <TouchableOpacity
              key={d.minutes}
              activeOpacity={0.75}
              onPress={() => onChangeMinutes(d.minutes)}
              style={[styles.timeChip, isSelected && styles.timeChipActive]}
            >
              <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Modal Chọn Giờ thời lượng (0–12) */}
      <Modal
        visible={modalType === 'hour'}
        transparent
        animationType="fade"
        onRequestClose={() => setModalType(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalType(null)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thời lượng (Giờ: 0 – 12)</Text>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <X size={20} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 13 }, (_, i) => i).map(h => {
                const isSelected = h === durationHours;
                return (
                  <TouchableOpacity
                    key={h}
                    activeOpacity={0.7}
                    onPress={() => handleSelectHour(h)}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {h} giờ
                    </Text>
                    {isSelected && <Check size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Chọn Phút thời lượng (00–59) */}
      <Modal
        visible={modalType === 'minute'}
        transparent
        animationType="fade"
        onRequestClose={() => setModalType(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalType(null)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thời lượng (Phút: 00 – 59)</Text>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <X size={20} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 60 }, (_, i) => i).map(m => {
                const isSelected = m === durationMinutes;
                return (
                  <TouchableOpacity
                    key={m}
                    activeOpacity={0.7}
                    onPress={() => handleSelectMinute(m)}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {String(m).padStart(2, '0')} phút
                    </Text>
                    {isSelected && <Check size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 3: ScheduledTimePreview ("Lịch dự kiến" - Tính chuẩn xác, không fake)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduledTimePreviewProps {
  dateLabel?: string;
  startDate?: string;
  timeStart?: string;
  startTime?: string;
  durationMinutes: number;
  price?: number;
}

export function ScheduledTimePreview({
  dateLabel,
  startDate,
  timeStart,
  startTime,
  durationMinutes,
  price,
}: ScheduledTimePreviewProps) {
  const effectiveStart = timeStart || startTime || '08:00';
  const calc = useMemo(
    () => calcEndTime(effectiveStart, durationMinutes),
    [effectiveStart, durationMinutes]
  );

  const formattedDate = useMemo(() => {
    if (dateLabel) return dateLabel;
    if (startDate) {
      try {
        const dt = dayjs(startDate);
        const dow = dt.format('dddd');
        const capDow = dow.charAt(0).toUpperCase() + dow.slice(1);
        return `${capDow}, ${dt.format('DD/MM/YYYY')}`;
      } catch {
        return startDate;
      }
    }
    return 'Chưa chọn ngày';
  }, [dateLabel, startDate]);

  const durationStr = formatDurationVi(durationMinutes);

  return (
    <View style={styles.previewBox}>
      <Text style={styles.previewTitle}>Lịch dự kiến</Text>
      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>Ngày:</Text>
        <Text style={styles.previewValue}>{formattedDate}</Text>
      </View>
      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>Khung giờ:</Text>
        {calc ? (
          <Text style={styles.previewValue}>
            {effectiveStart} – {calc.timeEnd} {calc.isNextDay ? '(ngày hôm sau)' : ''}
          </Text>
        ) : (
          <Text style={[styles.previewValue, { color: COLORS.gray[500] }]}>Chưa tính được</Text>
        )}
      </View>
      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>Thời lượng:</Text>
        <Text style={styles.previewValue}>{durationStr}</Text>
      </View>
      {price != null && price > 0 && (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Giá deal:</Text>
          <Text style={[styles.previewValue, { color: COLORS.primary }]}>
            {new Intl.NumberFormat('vi-VN').format(price)}₫
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray[700],
    marginBottom: 6,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.gray[200],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  dropdownPillError: {
    borderColor: COLORS.error,
    backgroundColor: '#FEF2F2',
  },
  dropdownValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.gray[900],
  },
  dropdownUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray[500],
    flex: 1,
    textAlign: 'left',
    marginLeft: 4,
  },
  separatorColon: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.gray[400],
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '600',
    marginTop: 6,
  },
  chipsSection: {
    marginTop: 10,
  },
  chipsInstruction: {
    fontSize: 11.5,
    color: COLORS.gray[500],
    fontWeight: '500',
    marginBottom: 6,
  },
  noChipsText: {
    fontSize: 12,
    color: COLORS.gray[500],
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray[700],
  },
  timeChipTextActive: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.gray[900],
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modalItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  modalItemDisabled: {
    opacity: 0.35,
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  modalItemTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  modalItemTextDisabled: {
    color: COLORS.gray[400],
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    gap: 4,
    marginTop: 10,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.gray[800],
    marginBottom: 2,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    color: COLORS.gray[500],
    fontWeight: '600',
  },
  previewValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.gray[900],
  },
});
