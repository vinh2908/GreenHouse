// apps/mobile/components/common/wheel-time-picker.tsx
import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { COLORS } from '@/components/ui';
import { ScalePressable } from '@/components/common/scale-pressable';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 3;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 120px

interface WheelTimePickerProps {
  value: string; // e.g. "19:30" or "08:00"
  onChange: (time: string) => void;
  quickChips?: boolean; // Hiển thị các chip phím tắt nhanh
}

export function WheelTimePicker({ value, onChange, quickChips = true }: WheelTimePickerProps) {
  // Parse hour & minute from value
  const { hour, minute } = useMemo(() => {
    const parts = (value || '08:00').split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return {
      hour: isNaN(h) ? 8 : Math.max(0, Math.min(23, h)),
      minute: isNaN(m) ? 0 : Math.max(0, Math.min(59, m)),
    };
  }, [value]);

  const [selectedH, setSelectedH] = useState(hour);
  const [selectedM, setSelectedM] = useState(minute);

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const isUserScrollingRef = useRef(false);

  // Sync internal state when external value changes
  useEffect(() => {
    setSelectedH(hour);
    setSelectedM(minute);
    if (!isUserScrollingRef.current) {
      hoursScrollRef.current?.scrollTo({ y: hour * ITEM_HEIGHT, animated: false });
      minutesScrollRef.current?.scrollTo({ y: minute * ITEM_HEIGHT, animated: false });
    }
  }, [hour, minute]);

  // Initial scroll position
  useEffect(() => {
    const timer = setTimeout(() => {
      hoursScrollRef.current?.scrollTo({ y: hour * ITEM_HEIGHT, animated: false });
      minutesScrollRef.current?.scrollTo({ y: minute * ITEM_HEIGHT, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleHourScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(23, Math.round(y / ITEM_HEIGHT)));
    setSelectedH(idx);
    isUserScrollingRef.current = false;
    const timeStr = `${String(idx).padStart(2, '0')}:${String(selectedM).padStart(2, '0')}`;
    if (timeStr !== value) {
      onChange(timeStr);
    }
  };

  const handleMinuteScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
    setSelectedM(idx);
    isUserScrollingRef.current = false;
    const timeStr = `${String(selectedH).padStart(2, '0')}:${String(idx).padStart(2, '0')}`;
    if (timeStr !== value) {
      onChange(timeStr);
    }
  };

  const selectHour = (h: number) => {
    setSelectedH(h);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    const timeStr = `${String(h).padStart(2, '0')}:${String(selectedM).padStart(2, '0')}`;
    onChange(timeStr);
  };

  const selectMinute = (m: number) => {
    setSelectedM(m);
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
    const timeStr = `${String(selectedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange(timeStr);
  };

  const selectExactTime = (t: string) => {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    setSelectedH(h);
    setSelectedM(m);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
    onChange(t);
  };

  const currentTimeFormatted = `${String(selectedH).padStart(2, '0')}:${String(selectedM).padStart(2, '0')}`;

  const hoursList = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  return (
    <View style={styles.container}>
      {/* ── 1. BÁNH XE CUỘN LƯỚT CHỌN GIỜ & PHÚT (SPINNER WHEEL) ── */}
      <View style={styles.wheelCard}>
        {/* Highlight band ở giữa */}
        <View pointerEvents="none" style={styles.centerHighlight} />

        {/* Cột chọn Giờ (00 - 23) */}
        <View style={styles.wheelColumn}>
          <Text style={styles.columnHeader}>Giờ</Text>
          <ScrollView
            ref={hoursScrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={styles.scrollContent}
            onScrollBeginDrag={() => {
              isUserScrollingRef.current = true;
            }}
            onMomentumScrollEnd={handleHourScrollEnd}
            onScrollEndDrag={e => {
              // fallback nếu momentum không kích hoạt (web)
              setTimeout(() => handleHourScrollEnd(e), 50);
            }}
          >
            {hoursList.map(h => {
              const isSelected = h === selectedH;
              return (
                <TouchableOpacity
                  key={`h-${h}`}
                  activeOpacity={0.7}
                  onPress={() => selectHour(h)}
                  style={styles.itemWrapper}
                >
                  <Text
                    style={[
                      styles.itemText,
                      isSelected ? styles.itemTextSelected : styles.itemTextFaded,
                    ]}
                  >
                    {String(h).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Dấu hai chấm phân cách */}
        <View style={styles.colonSeparator}>
          <Text style={styles.colonText}>:</Text>
        </View>

        {/* Cột chọn Phút (00 - 59) */}
        <View style={styles.wheelColumn}>
          <Text style={styles.columnHeader}>Phút</Text>
          <ScrollView
            ref={minutesScrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={styles.scrollContent}
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
              return (
                <TouchableOpacity
                  key={`m-${m}`}
                  activeOpacity={0.7}
                  onPress={() => selectMinute(m)}
                  style={styles.itemWrapper}
                >
                  <Text
                    style={[
                      styles.itemText,
                      isSelected ? styles.itemTextSelected : styles.itemTextFaded,
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

      {/* Hiển thị thời gian đã chọn rõ ràng */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Giờ đã chọn:</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusTimeText}>{currentTimeFormatted}</Text>
        </View>
      </View>

      {/* ── 2. CÁC CHIP GỢI Ý ĐỒNG BỘ 2 CHIỀU ── */}
      {quickChips && (
        <View style={styles.chipsSection}>
          <Text style={styles.chipsTitle}>Gợi ý nhanh (chạm để bánh xe cuộn tới):</Text>
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
              const isSelected = currentTimeFormatted === t;
              const isNew = t === '12:00';
              const isNight = t === '21:00' || t === '22:00';
              return (
                <ScalePressable
                  key={t}
                  onPress={() => selectExactTime(t)}
                  style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
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

          {/* Giờ lẻ phổ biến */}
          <View style={styles.oddChipsRow}>
            <Text style={styles.oddChipsLabel}>Giờ lẻ:</Text>
            {['07:30', '08:30', '11:30', '13:30', '17:30', '19:30', '20:30', '21:30'].map(ot => {
              const isSelected = currentTimeFormatted === ot;
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
                      isSelected ? styles.oddChipTextSelected : styles.oddChipTextUnselected,
                    ]}
                  >
                    {ot}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  wheelCard: {
    flexDirection: 'row',
    height: CONTAINER_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  centerHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT, // nấc thứ 2 trong 3 nấc
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    zIndex: 1,
  },
  wheelColumn: {
    flex: 1,
    height: CONTAINER_HEIGHT,
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  columnHeader: {
    position: 'absolute',
    top: 4,
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.gray[400],
    textTransform: 'uppercase',
    zIndex: 3,
  },
  colonSeparator: {
    width: 24,
    height: CONTAINER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  colonText: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: -2,
  },
  scrollContent: {
    paddingVertical: ITEM_HEIGHT, // đệm 1 item để item đầu có thể vào giữa
    alignItems: 'center',
  },
  itemWrapper: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  itemText: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  itemTextSelected: {
    fontWeight: '900',
    color: '#15803D',
  },
  itemTextFaded: {
    fontWeight: '500',
    color: COLORS.gray[400],
    opacity: 0.55,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray[700],
  },
  statusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusTimeText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  chipsSection: {
    marginTop: 12,
    gap: 8,
  },
  chipsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray[600],
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  chipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: COLORS.primary,
  },
  chipUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  chipTextSelected: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  chipTextUnselected: {
    fontWeight: '600',
    color: COLORS.gray[700],
  },
  newBadge: {
    position: 'absolute',
    top: -6,
    right: -2,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.primary,
  },
  nightBadge: {
    position: 'absolute',
    top: -6,
    right: -2,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  nightBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.error,
  },
  oddChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  oddChipsLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.gray[500],
    marginRight: 2,
  },
  oddChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  oddChipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: COLORS.primary,
  },
  oddChipUnselected: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  oddChipText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  oddChipTextSelected: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  oddChipTextUnselected: {
    fontWeight: '600',
    color: COLORS.gray[600],
  },
});
