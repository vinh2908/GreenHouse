// apps/mobile/components/common/duration-bottom-sheet.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { Clock, Hourglass, X, Check, AlertCircle } from 'lucide-react-native';
import { COLORS } from '@/components/ui';
import { ScalePressable } from '@/components/common/scale-pressable';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 132px

export interface DurationBottomSheetProps {
  visible: boolean;
  initialHours?: number; // e.g. 2
  initialMinutes?: number; // e.g. 30
  startDate?: string; // YYYY-MM-DD (for dynamic schedule preview)
  startTime?: string; // HH:mm (for dynamic schedule preview)
  onClose: () => void;
  onConfirm: (durationHours: number) => void;
}

export function DurationBottomSheet({
  visible,
  initialHours = 2,
  initialMinutes = 0,
  startDate,
  startTime = '08:00',
  onClose,
  onConfirm,
}: DurationBottomSheetProps) {
  // Temporary selection state
  const [selectedH, setSelectedH] = useState<number>(initialHours);
  const [selectedM, setSelectedM] = useState<number>(initialMinutes);

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const isUserScrollingRef = useRef(false);

  // Sync state whenever modal opens
  useEffect(() => {
    if (visible) {
      const h = Math.max(0, Math.min(12, Math.floor(initialHours)));
      const m = Math.max(0, Math.min(59, Math.floor(initialMinutes)));
      setSelectedH(h);
      setSelectedM(m);

      setTimeout(() => {
        hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: false });
        minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: false });
      }, 100);
    }
  }, [visible, initialHours, initialMinutes]);

  const hoursList = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []); // 0 to 12
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []); // 00 to 59 (every minute!)

  const totalMinutes = selectedH * 60 + selectedM;
  const isUnderMinDuration = totalMinutes < 15;

  const handleHourScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(12, Math.round(y / ITEM_HEIGHT)));
    setSelectedH(idx);
    isUserScrollingRef.current = false;
  };

  const handleMinuteScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
    setSelectedM(idx);
    isUserScrollingRef.current = false;
  };

  const selectHour = (h: number) => {
    setSelectedH(h);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
  };

  const selectMinute = (m: number) => {
    setSelectedM(m);
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
  };

  const selectQuickDuration = (h: number, m: number = 0) => {
    setSelectedH(h);
    setSelectedM(m);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
  };

  const handleConfirm = () => {
    // Enforce minimum 15 minutes (0.25 hours)
    let finalH = selectedH;
    let finalM = selectedM;
    if (finalH === 0 && finalM < 15) {
      finalM = 15;
    }
    const durationHours = finalH + finalM / 60;
    onConfirm(durationHours);
    onClose();
  };

  // Dynamic preview calculation
  const formattedDurationText = useMemo(() => {
    if (selectedH === 0) {
      return `${selectedM} phút`;
    }
    if (selectedM === 0) {
      return `${selectedH} giờ`;
    }
    return `${selectedH} giờ ${selectedM} phút`;
  }, [selectedH, selectedM]);

  const schedulePreview = useMemo(() => {
    const baseDate = startDate || dayjs().format('YYYY-MM-DD');
    const startDt = dayjs(`${baseDate} ${startTime}`);
    if (!startDt.isValid()) return null;

    const effMins = isUnderMinDuration ? 15 : totalMinutes;
    const endDt = startDt.add(effMins, 'minute');
    const isNextDay = endDt.date() !== startDt.date();

    return {
      startFormatted: startDt.format('HH:mm'),
      endFormatted: endDt.format('HH:mm'),
      dateFormatted: startDt.format('dddd, DD/MM'),
      isNextDay,
    };
  }, [startDate, startTime, totalMinutes, isUnderMinDuration]);

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
          {/* Drag Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.sheetTitle}>Chọn thời lượng làm việc</Text>
              <Text style={styles.sheetSubtitle}>
                Giờ (0–12h) và Phút (00–59p) · Tối thiểu 15 phút
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

          {/* Quick preset chips */}
          <View style={styles.quickPresetsRow}>
            {[
              { label: '1 giờ', h: 1, m: 0 },
              { label: '2 giờ', h: 2, m: 0 },
              { label: '3 giờ', h: 3, m: 0 },
              { label: '4 giờ', h: 4, m: 0 },
              { label: '6 giờ', h: 6, m: 0 },
              { label: '8 giờ', h: 8, m: 0 },
            ].map(p => {
              const isSel = selectedH === p.h && selectedM === p.m;
              return (
                <ScalePressable
                  key={p.label}
                  onPress={() => selectQuickDuration(p.h, p.m)}
                  style={[styles.presetChip, isSel && styles.presetChipActive]}
                >
                  <Text style={[styles.presetText, isSel && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                </ScalePressable>
              );
            })}
          </View>

          {/* Cupertino 2-Column Wheel Picker: Giờ (0-12) & Phút (00-59) */}
          <View style={styles.wheelCard}>
            {/* Center Highlight Pill */}
            <View pointerEvents="none" style={styles.wheelHighlightPill} />

            {/* Column 1: Hours (0–12) */}
            <View style={styles.wheelColumn}>
              <Text style={styles.wheelColumnLabel}>Giờ (0–12)</Text>
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
                        {h} <Text style={styles.unitText}>giờ</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Separator */}
            <View style={styles.colonContainer}>
              <Text style={styles.colonText}>:</Text>
            </View>

            {/* Column 2: Minutes (00–59) */}
            <View style={styles.wheelColumn}>
              <Text style={styles.wheelColumnLabel}>Phút (00–59)</Text>
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
                        {String(m).padStart(2, '0')} <Text style={styles.unitText}>phút</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Validation Warning if < 15 minutes */}
          {isUnderMinDuration && (
            <View style={styles.warningBox}>
              <AlertCircle size={15} color="#DC2626" />
              <Text style={styles.warningText}>
                Thời lượng tối thiểu là 15 phút. Hệ thống sẽ tự động điều chỉnh về 15 phút khi xác
                nhận.
              </Text>
            </View>
          )}

          {/* Dynamic Schedule Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconContainer}>
              <Hourglass size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Thời lượng đã chọn:</Text>
              <Text style={styles.summaryDurationValue}>{formattedDurationText}</Text>
              {schedulePreview && (
                <Text style={styles.summaryScheduleRange}>
                  Dự kiến: {schedulePreview.startFormatted} → {schedulePreview.endFormatted}
                  {schedulePreview.isNextDay ? ' (Qua ngày hôm sau)' : ''}
                </Text>
              )}
            </View>
          </View>

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
    marginBottom: 14,
    marginTop: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.gray[500],
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
  quickPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: COLORS.primary,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray[700],
  },
  presetTextActive: {
    color: COLORS.primary,
  },
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
    paddingHorizontal: 8,
  },
  wheelItemText: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  wheelItemTextActive: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  wheelItemTextAdjacent: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray[500],
    opacity: 0.65,
  },
  wheelItemTextFaded: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.gray[400],
    opacity: 0.35,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray[500],
  },
  colonContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  colonText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  summaryIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.gray[600],
  },
  summaryDurationValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 1,
  },
  summaryScheduleRange: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray[500],
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
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
