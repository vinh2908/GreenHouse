// apps/mobile/components/common/date-time-bottom-sheet.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react-native';

dayjs.locale('vi');

export const ITEM_HEIGHT = 46;
export const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS; // 230px
export const SPACER_HEIGHT = ITEM_HEIGHT * 2; // 92px (2 items on top, 2 on bottom, center item active)

export interface DateTimeBottomSheetProps {
  visible: boolean;
  initialDate?: string; // YYYY-MM-DD
  initialTime?: string; // HH:mm
  initialTab?: 'date' | 'time';
  onClose: () => void;
  onConfirm: (selectedDate: string, selectedTime: string) => void;
}

export function DateTimeBottomSheet({
  visible,
  initialDate,
  initialTime = '08:00',
  initialTab = 'date',
  onClose,
  onConfirm,
}: DateTimeBottomSheetProps) {
  const [activeTab, setActiveTab] = useState<'date' | 'time'>(initialTab);

  // Temporary selection state inside sheet
  const [tempDate, setTempDate] = useState<string>(initialDate || dayjs().format('YYYY-MM-DD'));
  const [tempTime, setTempTime] = useState<string>(initialTime || '08:00');

  // Calendar month state
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs(initialDate || undefined));

  // Parsed initial indices
  const parseHour = (t: string) => {
    const h = parseInt((t || '08:00').split(':')[0], 10);
    return isNaN(h) ? 8 : Math.max(0, Math.min(23, h));
  };
  const parseMinute = (t: string) => {
    const m = parseInt((t || '08:00').split(':')[1], 10);
    return isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  };

  const [selectedH, setSelectedH] = useState(() => parseHour(initialTime));
  const [selectedM, setSelectedM] = useState(() => parseMinute(initialTime));

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const selectedHRef = useRef(selectedH);
  const selectedMRef = useRef(selectedM);
  selectedHRef.current = selectedH;
  selectedMRef.current = selectedM;

  // Lists
  const hoursList = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const pinWheels = useCallback((h: number, m: number, animated = false) => {
    try {
      hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated });
      minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated });
    } catch {
      // Safe fallback
    }
  }, []);

  // Sync state whenever modal opens or initial values change
  useEffect(() => {
    if (visible) {
      const d = initialDate || dayjs().format('YYYY-MM-DD');
      const t = initialTime || '08:00';
      const h = parseHour(t);
      const m = parseMinute(t);

      setTempDate(d);
      setTempTime(t);
      setSelectedH(h);
      setSelectedM(m);
      setActiveTab(initialTab);
      setCalendarMonth(dayjs(d));

      // Multi-phase pin to guarantee Android layout measurements receive the offset
      requestAnimationFrame(() => pinWheels(h, m, false));
      const t1 = setTimeout(() => pinWheels(h, m, false), 50);
      const t2 = setTimeout(() => pinWheels(h, m, false), 150);
      const t3 = setTimeout(() => pinWheels(h, m, false), 300);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [visible, initialDate, initialTime, initialTab, pinWheels]);

  // When activeTab switches to 'time', ensure wheels are pinned
  useEffect(() => {
    if (visible && activeTab === 'time') {
      const h = selectedHRef.current;
      const m = selectedMRef.current;
      requestAnimationFrame(() => pinWheels(h, m, false));
      const t1 = setTimeout(() => pinWheels(h, m, false), 50);
      const t2 = setTimeout(() => pinWheels(h, m, false), 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [visible, activeTab, pinWheels]);

  // Handlers for scroll wheel events - CRASH-PROOF, SYNCHRONOUS, NO POOLED EVENT LEAKS
  const handleHourScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(23, Math.round(y / ITEM_HEIGHT)));
      if (idx !== selectedHRef.current) {
        selectedHRef.current = idx;
        setSelectedH(idx);
        const newTime = `${String(idx).padStart(2, '0')}:${String(selectedMRef.current).padStart(2, '0')}`;
        setTempTime(newTime);
      }
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleHourScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(23, Math.round(y / ITEM_HEIGHT)));
      selectedHRef.current = idx;
      setSelectedH(idx);
      const newTime = `${String(idx).padStart(2, '0')}:${String(selectedMRef.current).padStart(2, '0')}`;
      setTempTime(newTime);
      hoursScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleMinuteScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
      if (idx !== selectedMRef.current) {
        selectedMRef.current = idx;
        setSelectedM(idx);
        const newTime = `${String(selectedHRef.current).padStart(2, '0')}:${String(idx).padStart(2, '0')}`;
        setTempTime(newTime);
      }
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleMinuteScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
      selectedMRef.current = idx;
      setSelectedM(idx);
      const newTime = `${String(selectedHRef.current).padStart(2, '0')}:${String(idx).padStart(2, '0')}`;
      setTempTime(newTime);
      minutesScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const selectHour = useCallback((h: number) => {
    selectedHRef.current = h;
    setSelectedH(h);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    const newTime = `${String(h).padStart(2, '0')}:${String(selectedMRef.current).padStart(2, '0')}`;
    setTempTime(newTime);
  }, []);

  const selectMinute = useCallback((m: number) => {
    selectedMRef.current = m;
    setSelectedM(m);
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
    const newTime = `${String(selectedHRef.current).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTempTime(newTime);
  }, []);

  const selectExactTime = useCallback((timeStr: string) => {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) {
      selectedHRef.current = h;
      selectedMRef.current = m;
      setSelectedH(h);
      setSelectedM(m);
      setTempTime(timeStr);
      hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
      minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
    }
  }, []);

  // A1: Kiểm tra thời điểm chọn có ở trong quá khứ hay không
  const isSelectionInPast = useMemo(() => {
    const selected = dayjs(`${tempDate} ${tempTime}`);
    return selected.isBefore(dayjs().subtract(1, 'minute'));
  }, [tempDate, tempTime]);

  const handleConfirm = useCallback(() => {
    if (isSelectionInPast) return;
    onConfirm(tempDate, tempTime);
    onClose();
  }, [onConfirm, onClose, tempDate, tempTime, isSelectionInPast]);

  // Calendar calculations
  const today = dayjs().startOf('day');
  const startOfMonth = calendarMonth.startOf('month');
  const daysInMonth = calendarMonth.daysInMonth();
  const startOffset = (startOfMonth.day() + 6) % 7; // Monday = 0
  const curMonthIndex = calendarMonth.year() * 12 + calendarMonth.month();
  const todayMonthIndex = today.year() * 12 + today.month();
  const isPrevMonthDisabled = curMonthIndex <= todayMonthIndex;
  const isNextMonthDisabled = curMonthIndex >= todayMonthIndex + 6;

  // Format date preview matching demo: "Thứ năm, 29/10"
  const formattedDatePreview = useMemo(() => {
    const dt = dayjs(tempDate);
    const dow = dt.format('dddd');
    const capitalizedDow = dow.charAt(0).toUpperCase() + dow.slice(1);
    return `${capitalizedDow}, ${dt.format('DD/MM')}`;
  }, [tempDate]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheetContainer}>
          {/* 1. Drag grab handle */}
          <View style={styles.dragHandle} />

          {/* 2. Sheet Head: Huỷ (left) | Chọn ngày & giờ (center) | Xác nhận (right green) */}
          <View style={styles.sheetHead}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={styles.headBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.cancelBtnText}>Huỷ</Text>
            </TouchableOpacity>

            <Text style={styles.sheetTitle}>Chọn ngày & giờ</Text>

            <TouchableOpacity
              activeOpacity={isSelectionInPast ? 1 : 0.7}
              disabled={isSelectionInPast}
              onPress={handleConfirm}
              style={[styles.headBtn, isSelectionInPast && { opacity: 0.35 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.confirmBtnText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>

          {/* 3. Segmented Toggle: 📅 Ngày / 🕒 Giờ */}
          <View style={styles.segToggle}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('date')}
              style={[styles.segBtn, activeTab === 'date' && styles.segBtnActive]}
            >
              <CalendarIcon
                size={16}
                color={activeTab === 'date' ? '#047857' : '#64748B'}
                strokeWidth={2.2}
              />
              <Text
                style={[styles.segBtnText, activeTab === 'date' && styles.segBtnTextActive]}
              >
                Ngày
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('time')}
              style={[styles.segBtn, activeTab === 'time' && styles.segBtnActive]}
            >
              <Clock
                size={16}
                color={activeTab === 'time' ? '#047857' : '#64748B'}
                strokeWidth={2.2}
              />
              <Text
                style={[styles.segBtnText, activeTab === 'time' && styles.segBtnTextActive]}
              >
                Giờ
              </Text>
            </TouchableOpacity>
          </View>

          {/* 4. Big Preview Text (Demo Standard: 30px bold green tabular-nums) */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewText} numberOfLines={1}>
              {activeTab === 'date' ? formattedDatePreview : tempTime}
            </Text>
          </View>

          {/* 5. Panes - BOTH ALWAYS MOUNTED (Offscreen Pane uses position absolute & opacity 0 to preserve Android ScrollView measurements) */}
          {/* PANE A: NGÀY (Calendar) */}
          <View style={[styles.pane, activeTab !== 'date' && styles.paneHidden]}>
            <View style={styles.calBox}>
              {/* Calendar Month Header */}
              <View style={styles.calHead}>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(prev => prev.subtract(1, 'month'))}
                  disabled={isPrevMonthDisabled}
                  style={[styles.calNavBtn, isPrevMonthDisabled && styles.calNavBtnDisabled]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ChevronLeft
                    size={18}
                    color={isPrevMonthDisabled ? '#CBD5E1' : '#334155'}
                    strokeWidth={2.4}
                  />
                </TouchableOpacity>

                <Text style={styles.calMonthTitle}>
                  Tháng {calendarMonth.format('M · YYYY')}
                </Text>

                <TouchableOpacity
                  onPress={() => setCalendarMonth(prev => prev.add(1, 'month'))}
                  disabled={isNextMonthDisabled}
                  style={[styles.calNavBtn, isNextMonthDisabled && styles.calNavBtnDisabled]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ChevronRight
                    size={18}
                    color={isNextMonthDisabled ? '#CBD5E1' : '#334155'}
                    strokeWidth={2.4}
                  />
                </TouchableOpacity>
              </View>

              {/* Day of Week Labels */}
              <View style={styles.weekdaysRow}>
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(dow => (
                  <Text key={dow} style={styles.weekdayLabel}>
                    {dow}
                  </Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.daysGrid}>
                {Array.from({ length: startOffset }, (_, i) => (
                  <View key={`empty-${i}`} style={styles.dayCell} />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dayNum = i + 1;
                  const currentCellDate = calendarMonth.date(dayNum).startOf('day');
                  const currentCellDateStr = currentCellDate.format('YYYY-MM-DD');

                  const isPast = currentCellDate.isBefore(today);
                  const isToday = currentCellDate.isSame(today);
                  const isSelected = currentCellDateStr === tempDate;

                  return (
                    <TouchableOpacity
                      key={`day-${dayNum}`}
                      disabled={isPast}
                      activeOpacity={0.7}
                      onPress={() => {
                        setTempDate(currentCellDateStr);
                      }}
                      style={styles.dayCell}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isToday && !isSelected && styles.dayCircleToday,
                          isSelected && styles.dayCircleSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            isPast && styles.dayTextPast,
                            isToday && !isSelected && styles.dayTextToday,
                            isSelected && styles.dayTextSelected,
                          ]}
                        >
                          {dayNum}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* PANE B: GIỜ (Cupertino Wheel + Synced Quick Chips) */}
          <View style={[styles.pane, activeTab !== 'time' && styles.paneHidden]}>
            {/* Wheel Labels: GIỜ & PHÚT */}
            <View style={styles.wheelLabelsRow}>
              <Text style={styles.wheelLabelCol}>GIỜ</Text>
              <View style={styles.wheelLabelSep} />
              <Text style={styles.wheelLabelCol}>PHÚT</Text>
            </View>

            {/* Wheel Box with centered Green Highlight Band */}
            <View style={styles.wheelBox}>
              {/* Highlight Band in Center Row (Row 3 / 5) */}
              <View pointerEvents="none" style={styles.wheelBand} />

              {/* 2 Scroll Columns + Colon */}
              <View style={styles.wheelsContainer}>
                {/* Column 1: Hours */}
                <View style={styles.wheelColumn}>
                  <ScrollView
                    ref={hoursScrollRef}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    snapToInterval={ITEM_HEIGHT}
                    disableIntervalMomentum={true}
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    onScroll={handleHourScroll}
                    onScrollEndDrag={e => {
                      const vel = e.nativeEvent?.velocity?.y ?? 0;
                      if (Math.abs(vel) < 0.1) handleHourScrollEnd(e);
                    }}
                    onMomentumScrollEnd={handleHourScrollEnd}
                    onLayout={() => {
                      pinWheels(selectedHRef.current, selectedMRef.current, false);
                    }}
                    onContentSizeChange={() => {
                      pinWheels(selectedHRef.current, selectedMRef.current, false);
                    }}
                  >
                    <View style={styles.wheelSpacer} />
                    {hoursList.map(h => {
                      const isSel = h === selectedH;
                      return (
                        <TouchableOpacity
                          key={`h-${h}`}
                          activeOpacity={0.7}
                          onPress={() => selectHour(h)}
                          style={styles.wheelItem}
                        >
                          <Text style={[styles.wheelItemText, isSel && styles.wheelItemTextSel]}>
                            {String(h).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.wheelSpacer} />
                  </ScrollView>
                </View>

                {/* Colon Separator */}
                <View pointerEvents="none" style={styles.wheelSep}>
                  <Text style={styles.wheelSepText}>:</Text>
                </View>

                {/* Column 2: Minutes */}
                <View style={styles.wheelColumn}>
                  <ScrollView
                    ref={minutesScrollRef}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    snapToInterval={ITEM_HEIGHT}
                    disableIntervalMomentum={true}
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    onScroll={handleMinuteScroll}
                    onScrollEndDrag={e => {
                      const vel = e.nativeEvent?.velocity?.y ?? 0;
                      if (Math.abs(vel) < 0.1) handleMinuteScrollEnd(e);
                    }}
                    onMomentumScrollEnd={handleMinuteScrollEnd}
                    onLayout={() => {
                      pinWheels(selectedHRef.current, selectedMRef.current, false);
                    }}
                    onContentSizeChange={() => {
                      pinWheels(selectedHRef.current, selectedMRef.current, false);
                    }}
                  >
                    <View style={styles.wheelSpacer} />
                    {minutesList.map(m => {
                      const isSel = m === selectedM;
                      return (
                        <TouchableOpacity
                          key={`m-${m}`}
                          activeOpacity={0.7}
                          onPress={() => selectMinute(m)}
                          style={styles.wheelItem}
                        >
                          <Text style={[styles.wheelItemText, isSel && styles.wheelItemTextSel]}>
                            {String(m).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.wheelSpacer} />
                  </ScrollView>
                </View>
              </View>

              {/* Gradient fade overlay on top and bottom */}
              <View pointerEvents="none" style={styles.wheelFadeTop} />
              <View pointerEvents="none" style={styles.wheelFadeBottom} />
            </View>

            {/* Quick Time Suggestion Chips inside the sheet with 2-way sync */}
            <View style={styles.sheetChipsContainer}>
              <Text style={styles.sheetChipsLabel}>
                Gợi ý nhanh — chạm là bánh xe chạy tới đúng giờ:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sheetChipsScroll}
              >
                {[
                  { t: '07:00' },
                  { t: '08:00' },
                  { t: '09:00' },
                  { t: '12:00', tag: 'MỚI', tagType: 'new' },
                  { t: '14:00' },
                  { t: '17:00' },
                  { t: '18:00' },
                  { t: '19:00' },
                  { t: '20:00' },
                  { t: '21:00', tag: 'ĐÊM', tagType: 'night' },
                  { t: '22:00', tag: 'ĐÊM', tagType: 'night' },
                ].map(item => {
                  const isSel = tempTime === item.t;
                  const isPastChip =
                    dayjs(tempDate).isSame(dayjs(), 'day') &&
                    dayjs(`${tempDate} ${item.t}`).isBefore(dayjs().subtract(1, 'minute'));
                  return (
                    <TouchableOpacity
                      key={item.t}
                      activeOpacity={isPastChip ? 1 : 0.7}
                      disabled={isPastChip}
                      onPress={() => selectExactTime(item.t)}
                      style={[
                        styles.sheetChip,
                        isSel && styles.sheetChipActive,
                        isPastChip && { opacity: 0.35 },
                      ]}
                    >
                      {item.tag && (
                        <View
                          style={[
                            styles.sheetChipTag,
                            item.tagType === 'night'
                              ? styles.sheetChipTagNight
                              : styles.sheetChipTagNew,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sheetChipTagText,
                              item.tagType === 'night'
                                ? styles.sheetChipTagTextNight
                                : styles.sheetChipTagTextNew,
                            ]}
                          >
                            {item.tag}
                          </Text>
                        </View>
                      )}
                      <Text
                        style={[styles.sheetChipText, isSel && styles.sheetChipTextActive]}
                      >
                        {item.t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.sheetOddRow}>
                <Text style={styles.sheetOddLabel}>Giờ lẻ:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sheetChipsScroll}
                >
                  {['07:30', '08:30', '11:30', '13:30', '17:30', '19:30', '20:30', '21:30'].map(
                    t => {
                      const isSel = tempTime === t;
                      const isPastChip =
                        dayjs(tempDate).isSame(dayjs(), 'day') &&
                        dayjs(`${tempDate} ${t}`).isBefore(dayjs().subtract(1, 'minute'));
                      return (
                        <TouchableOpacity
                          key={t}
                          activeOpacity={isPastChip ? 1 : 0.7}
                          disabled={isPastChip}
                          onPress={() => selectExactTime(t)}
                          style={[
                            styles.sheetChip,
                            isSel && styles.sheetChipActive,
                            isPastChip && { opacity: 0.35 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sheetChipText,
                              isSel && styles.sheetChipTextActive,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* 6. Footer Note (Demo Standard) */}
          <Text style={styles.sheetNote}>
            {activeTab === 'date'
              ? 'Chọn ngày trên lịch — gạt sang tab Giờ để chỉnh giờ bắt đầu, xong bấm Xác nhận.'
              : 'Hàng nằm giữa dải xanh là giờ được chọn.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// Backwards compatibility alias
export const DateTimePickerBottomSheet = DateTimeBottomSheet;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10, 18, 13, 0.45)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    shadowColor: '#0A1E12',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 24,
  },
  dragHandle: {
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
  },
  headBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
  },
  segToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginTop: 10,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  segBtnTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 4,
    minHeight: 40,
  },
  previewText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#047857',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  pane: {
    width: '100%',
  },
  paneHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: 'none',
    zIndex: -1,
  },
  // Calendar styles
  calBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    paddingBottom: 8,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calNavBtnDisabled: {
    opacity: 0.35,
  },
  calMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  dayCircleSelected: {
    backgroundColor: '#16A34A',
  },
  dayText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  dayTextPast: {
    color: '#CBD5E1',
  },
  dayTextToday: {
    color: '#0F172A',
    fontWeight: '800',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // Wheel styles
  wheelLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  wheelLabelCol: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#94A3B8',
  },
  wheelLabelSep: {
    width: 28,
  },
  wheelBox: {
    height: WHEEL_HEIGHT, // 230px
    position: 'relative',
    marginTop: 2,
    overflow: 'hidden',
  },
  wheelBand: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: '50%',
    height: ITEM_HEIGHT, // 46px
    marginTop: -ITEM_HEIGHT / 2, // -23px
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#16A34A',
    borderRadius: 12,
    zIndex: 0,
  },
  wheelsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    zIndex: 1,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_HEIGHT,
  },
  wheelSpacer: {
    height: SPACER_HEIGHT, // 92px
  },
  wheelItem: {
    height: ITEM_HEIGHT, // 46px
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#B3BEC9',
    fontVariant: ['tabular-nums'],
  },
  wheelItemTextSel: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
  },
  wheelSep: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelSepText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#047857',
  },
  wheelFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    zIndex: 2,
  },
  wheelFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    zIndex: 2,
  },
  // Sheet Chips styles
  sheetChipsContainer: {
    marginTop: 6,
  },
  sheetChipsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  sheetChipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  sheetChip: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  sheetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    fontVariant: ['tabular-nums'],
  },
  sheetChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  sheetChipTag: {
    position: 'absolute',
    top: -6,
    right: -4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 99,
  },
  sheetChipTagNew: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  sheetChipTagNight: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  sheetChipTagText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sheetChipTagTextNew: {
    color: '#047857',
  },
  sheetChipTagTextNight: {
    color: '#DC2626',
  },
  sheetOddRow: {
    marginTop: 4,
  },
  sheetOddLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  sheetNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    minHeight: 16,
  },
});
