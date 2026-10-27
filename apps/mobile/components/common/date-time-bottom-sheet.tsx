// apps/mobile/components/common/date-time-bottom-sheet.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import dayjs from 'dayjs';
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
} from 'lucide-react-native';
import { COLORS } from '@/components/ui';
import { ScalePressable } from '@/components/common/scale-pressable';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 132px

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
  // Active Tab: 'date' | 'time'
  const [activeTab, setActiveTab] = useState<'date' | 'time'>(initialTab);

  // Temporary selection state inside sheet (only committed on Confirm)
  const [tempDate, setTempDate] = useState<string>(initialDate || dayjs().format('YYYY-MM-DD'));
  const [tempTime, setTempTime] = useState<string>(initialTime || '08:00');

  // Calendar month state
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs(initialDate || undefined));

  // Parse hour & minute
  const parsedHour = useMemo(() => {
    const h = parseInt((tempTime || '08:00').split(':')[0], 10);
    return isNaN(h) ? 8 : Math.max(0, Math.min(23, h));
  }, [tempTime]);

  const parsedMinute = useMemo(() => {
    const m = parseInt((tempTime || '08:00').split(':')[1], 10);
    return isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  }, [tempTime]);

  const [selectedH, setSelectedH] = useState(parsedHour);
  const [selectedM, setSelectedM] = useState(parsedMinute);

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const isUserScrollingRef = useRef(false);

  // Reset temp state whenever modal becomes visible
  useEffect(() => {
    if (visible) {
      const d = initialDate || dayjs().format('YYYY-MM-DD');
      const t = initialTime || '08:00';
      setTempDate(d);
      setTempTime(t);
      setActiveTab(initialTab);
      setCalendarMonth(dayjs(d));

      const parts = t.split(':');
      const h = parseInt(parts[0], 10) || 8;
      const m = parseInt(parts[1], 10) || 0;
      setSelectedH(h);
      setSelectedM(m);

      // Scroll wheel to position after modal renders
      setTimeout(() => {
        hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: false });
        minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: false });
      }, 100);
    }
  }, [visible, initialDate, initialTime, initialTab]);

  // Sync scroll position when activeTab switches to 'time'
  useEffect(() => {
    if (activeTab === 'time') {
      setTimeout(() => {
        hoursScrollRef.current?.scrollTo({ y: selectedH * ITEM_HEIGHT, animated: false });
        minutesScrollRef.current?.scrollTo({ y: selectedM * ITEM_HEIGHT, animated: false });
      }, 60);
    }
  }, [activeTab]);

  const hoursList = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const handleHourScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(23, Math.round(y / ITEM_HEIGHT)));
    setSelectedH(idx);
    isUserScrollingRef.current = false;
    const newTime = `${String(idx).padStart(2, '0')}:${String(selectedM).padStart(2, '0')}`;
    setTempTime(newTime);
  };

  const handleMinuteScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
    setSelectedM(idx);
    isUserScrollingRef.current = false;
    const newTime = `${String(selectedH).padStart(2, '0')}:${String(idx).padStart(2, '0')}`;
    setTempTime(newTime);
  };

  const selectHour = (h: number) => {
    setSelectedH(h);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    const newTime = `${String(h).padStart(2, '0')}:${String(selectedM).padStart(2, '0')}`;
    setTempTime(newTime);
  };

  const selectMinute = (m: number) => {
    setSelectedM(m);
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
    const newTime = `${String(selectedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTempTime(newTime);
  };

  const selectExactTime = (t: string) => {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    setSelectedH(h);
    setSelectedM(m);
    setTempTime(t);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
  };

  const handleConfirm = () => {
    onConfirm(tempDate, tempTime);
    onClose();
  };

  // Calendar calculations
  const todayStr = dayjs().format('YYYY-MM-DD');
  const startOfToday = dayjs().startOf('day');
  const startOfMonth = calendarMonth.startOf('month');
  const daysInMonth = calendarMonth.daysInMonth();
  const startOffset = (startOfMonth.day() + 6) % 7; // Monday = 0

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
          {/* Top Drag Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.sheetTitle}>Chọn lịch làm việc</Text>
              <Text style={styles.sheetSubtitle}>
                {dayjs(tempDate).format('dddd, DD/MM/YYYY')} · {tempTime}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={COLORS.gray[600]} />
            </TouchableOpacity>
          </View>

          {/* Segmented Mode Toggle: Ngày / Giờ */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('date')}
              style={[styles.segmentTab, activeTab === 'date' && styles.segmentTabActive]}
            >
              <CalendarIcon
                size={16}
                color={activeTab === 'date' ? COLORS.primary : COLORS.gray[500]}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'date' && styles.segmentLabelActive]}
              >
                Ngày: {dayjs(tempDate).format('DD/MM')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('time')}
              style={[styles.segmentTab, activeTab === 'time' && styles.segmentTabActive]}
            >
              <Clock size={16} color={activeTab === 'time' ? COLORS.primary : COLORS.gray[500]} />
              <Text
                style={[styles.segmentLabel, activeTab === 'time' && styles.segmentLabelActive]}
              >
                Giờ: {tempTime}
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: NGÀY (Month Calendar) */}
          {activeTab === 'date' && (
            <View style={styles.tabContent}>
              {/* Quick Date Chips */}
              <View style={styles.quickDateRow}>
                {[
                  { key: 'today', label: 'Hôm nay', offset: 0 },
                  { key: 'tomorrow', label: 'Ngày mai', offset: 1 },
                  { key: 'day2', label: 'Ngày kia', offset: 2 },
                  { key: 'weekend', label: 'Cuối tuần', offset: (6 - dayjs().day() + 7) % 7 || 7 },
                ].map(chip => {
                  const targetDate = dayjs().add(chip.offset, 'day').format('YYYY-MM-DD');
                  const isSel = tempDate === targetDate;
                  return (
                    <ScalePressable
                      key={chip.key}
                      onPress={() => {
                        setTempDate(targetDate);
                        setCalendarMonth(dayjs(targetDate));
                      }}
                      style={[styles.quickDateChip, isSel && styles.quickDateChipActive]}
                    >
                      <Text style={[styles.quickDateText, isSel && styles.quickDateTextActive]}>
                        {chip.label}
                      </Text>
                    </ScalePressable>
                  );
                })}
              </View>

              {/* Month Header Navigation */}
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(prev => prev.subtract(1, 'month'))}
                  style={styles.navArrow}
                >
                  <ChevronLeft size={18} color={COLORS.gray[700]} />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>Tháng {calendarMonth.format('MM/YYYY')}</Text>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(prev => prev.add(1, 'month'))}
                  style={styles.navArrow}
                >
                  <ChevronRight size={18} color={COLORS.gray[700]} />
                </TouchableOpacity>
              </View>

              {/* Day of Week Labels */}
              <View style={styles.weekdaysRow}>
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(wd => (
                  <Text key={wd} style={styles.weekdayLabel}>
                    {wd}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid Matrix */}
              <View style={styles.calendarGrid}>
                {Array.from({ length: startOffset }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.dayCell} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = i + 1;
                  const dObj = calendarMonth.date(d);
                  const dateStr = dObj.format('YYYY-MM-DD');
                  const isPast = dObj.isBefore(startOfToday);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === tempDate;

                  return (
                    <TouchableOpacity
                      key={dateStr}
                      disabled={isPast}
                      onPress={() => setTempDate(dateStr)}
                      style={styles.dayCell}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isSelected && styles.dayCircleSelected,
                          isToday && !isSelected && styles.dayCircleToday,
                          isPast && styles.dayCirclePast,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            isSelected && styles.dayTextSelected,
                            isToday && !isSelected && styles.dayTextToday,
                            isPast && styles.dayTextPast,
                          ]}
                        >
                          {d}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick switch to time tab button */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveTab('time')}
                style={styles.nextTabButton}
              >
                <Text style={styles.nextTabText}>Tiếp tục chọn giờ làm việc →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 2: GIỜ (Cupertino 2-Column Wheel + Two-way synced chips) */}
          {activeTab === 'time' && (
            <View style={styles.tabContent}>
              {/* Cupertino 2-Column Wheel Picker */}
              <View style={styles.wheelCard}>
                {/* Center Highlight Pill spanning both columns */}
                <View pointerEvents="none" style={styles.wheelHighlightPill} />

                {/* Column 1: Hours (00-23) */}
                <View style={styles.wheelColumn}>
                  <Text style={styles.wheelColumnLabel}>Giờ</Text>
                  <ScrollView
                    ref={hoursScrollRef}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    contentContainerStyle={styles.wheelScrollContent}
                    onScrollBeginDrag={() => {
                      isUserScrollingRef.current = true;
                    }}
                    onMomentumScrollEnd={handleHourScrollEnd}
                    onScrollEndDrag={e => {
                      setTimeout(() => handleHourScrollEnd(e), 50);
                    }}
                  >
                    {hoursList.map(h => {
                      const isSelected = h === selectedH;
                      const diff = Math.abs(h - selectedH);
                      return (
                        <TouchableOpacity
                          key={`h-${h}`}
                          activeOpacity={0.7}
                          onPress={() => selectHour(h)}
                          style={styles.wheelItem}
                        >
                          <Text
                            style={[
                              styles.wheelItemText,
                              isSelected
                                ? styles.wheelItemTextActive
                                : diff === 1
                                  ? styles.wheelItemTextAdjacent
                                  : styles.wheelItemTextFaded,
                            ]}
                          >
                            {String(h).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Colon Separator */}
                <View style={styles.colonContainer}>
                  <Text style={styles.colonText}>:</Text>
                </View>

                {/* Column 2: Minutes (00-59) */}
                <View style={styles.wheelColumn}>
                  <Text style={styles.wheelColumnLabel}>Phút</Text>
                  <ScrollView
                    ref={minutesScrollRef}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    contentContainerStyle={styles.wheelScrollContent}
                    onScrollBeginDrag={() => {
                      isUserScrollingRef.current = true;
                    }}
                    onMomentumScrollEnd={handleMinuteScrollEnd}
                    onScrollEndDrag={e => {
                      setTimeout(() => handleMinuteScrollEnd(e), 50);
                    }}
                  >
                    {minutesList.map(m => {
                      const isSelected = m === selectedM;
                      const diff = Math.abs(m - selectedM);
                      return (
                        <TouchableOpacity
                          key={`m-${m}`}
                          activeOpacity={0.7}
                          onPress={() => selectMinute(m)}
                          style={styles.wheelItem}
                        >
                          <Text
                            style={[
                              styles.wheelItemText,
                              isSelected
                                ? styles.wheelItemTextActive
                                : diff === 1
                                  ? styles.wheelItemTextAdjacent
                                  : styles.wheelItemTextFaded,
                            ]}
                          >
                            {String(m).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Status pill showing current selected time */}
              <View style={styles.statusPillRow}>
                <Text style={styles.statusLabel}>Giờ đã chọn:</Text>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeText}>{tempTime}</Text>
                </View>
              </View>

              {/* Quick hour chips with 2-way sync */}
              <View style={styles.chipsSection}>
                <Text style={styles.chipsSectionTitle}>
                  Gợi ý nhanh (chạm để bánh xe cuộn tới):
                </Text>
                <View style={styles.chipsWrap}>
                  {[
                    '07:00',
                    '08:00',
                    '09:00',
                    '12:00',
                    '14:00',
                    '17:00',
                    '18:00',
                    '19:00',
                    '20:00',
                    '21:00',
                    '22:00',
                  ].map(t => {
                    const isSelected = tempTime === t;
                    const isNew = t === '12:00';
                    const isNight = t === '21:00' || t === '22:00';
                    return (
                      <ScalePressable
                        key={t}
                        onPress={() => selectExactTime(t)}
                        style={[
                          styles.chip,
                          isSelected ? styles.chipSelected : styles.chipUnselected,
                        ]}
                      >
                        {isNew && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>MỚI</Text>
                          </View>
                        )}
                        {isNight && (
                          <View style={styles.nightBadge}>
                            <Text style={styles.nightBadgeText}>ĐÊM</Text>
                          </View>
                        )}
                        <Text
                          style={[
                            styles.chipText,
                            isSelected ? styles.chipTextSelected : styles.chipTextUnselected,
                          ]}
                        >
                          {t}
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* Odd hour chips */}
                <View style={styles.oddChipsRow}>
                  <Text style={styles.oddChipsLabel}>Giờ lẻ:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {['07:30', '08:30', '11:30', '13:30', '17:30', '19:30', '20:30', '21:30'].map(
                      ot => {
                        const isSelected = tempTime === ot;
                        return (
                          <TouchableOpacity
                            key={ot}
                            activeOpacity={0.7}
                            onPress={() => selectExactTime(ot)}
                            style={[
                              styles.oddChip,
                              isSelected ? styles.oddChipSelected : styles.oddChipUnselected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.oddChipText,
                                isSelected
                                  ? styles.oddChipTextSelected
                                  : styles.oddChipTextUnselected,
                              ]}
                            >
                              {ot}
                            </Text>
                          </TouchableOpacity>
                        );
                      },
                    )}
                  </ScrollView>
                </View>
              </View>
            </View>
          )}

          {/* Bottom Actions: HỦY / XÁC NHẬN */}
          <View style={styles.actionRow}>
            <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Hủy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleConfirm}
              style={styles.confirmButton}
            >
              <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.confirmButtonText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray[500],
  },
  segmentLabelActive: {
    color: COLORS.primary,
  },
  tabContent: {
    paddingBottom: 6,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickDateChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  quickDateChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: COLORS.primary,
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray[600],
  },
  quickDateTextActive: {
    color: COLORS.primary,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
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
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray[400],
  },
  calendarGrid: {
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
  dayCircleSelected: {
    backgroundColor: COLORS.primary,
  },
  dayCircleToday: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  dayCirclePast: {
    opacity: 0.35,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  dayTextPast: {
    color: COLORS.gray[400],
  },
  nextTabButton: {
    marginTop: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  nextTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  // Wheel styles
  wheelCard: {
    flexDirection: 'row',
    height: WHEEL_HEIGHT,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
  },
  wheelHighlightPill: {
    position: 'absolute',
    top: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 1,
  },
  wheelColumn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    zIndex: 2,
  },
  wheelColumnLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    position: 'absolute',
    top: 4,
    zIndex: 5,
  },
  wheelScrollContent: {
    paddingVertical: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  wheelItemText: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  wheelItemTextActive: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  wheelItemTextAdjacent: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[500],
    opacity: 0.65,
  },
  wheelItemTextFaded: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray[400],
    opacity: 0.35,
  },
  colonContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  colonText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  statusLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.gray[600],
  },
  timeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  timeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  chipsSection: {
    marginTop: 2,
  },
  chipsSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.gray[500],
    marginBottom: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    position: 'relative',
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipUnselected: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  chipTextUnselected: {
    color: COLORS.gray[700],
  },
  newBadge: {
    position: 'absolute',
    top: -5,
    right: -4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  nightBadge: {
    position: 'absolute',
    top: -5,
    right: -4,
    backgroundColor: '#6366F1',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  nightBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  oddChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  oddChipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray[500],
  },
  oddChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  oddChipSelected: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  oddChipUnselected: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  oddChipText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  oddChipTextSelected: {
    color: COLORS.primary,
  },
  oddChipTextUnselected: {
    color: COLORS.gray[600],
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray[600],
  },
  confirmButton: {
    flex: 1.6,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export const DateTimePickerBottomSheet = DateTimeBottomSheet;
