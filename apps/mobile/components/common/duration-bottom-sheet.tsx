// apps/mobile/components/common/duration-bottom-sheet.tsx
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

export const ITEM_HEIGHT = 46;
export const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS; // 230px
export const SPACER_HEIGHT = ITEM_HEIGHT * 2; // 92px

export interface DurationBottomSheetProps {
  visible: boolean;
  initialHours?: number; // e.g. 2
  initialMinutes?: number; // e.g. 30
  startDate?: string;
  startTime?: string;
  onClose: () => void;
  onConfirm: (durationHours: number) => void;
}

export function DurationBottomSheet({
  visible,
  initialHours = 2,
  initialMinutes = 0,
  onClose,
  onConfirm,
}: DurationBottomSheetProps) {
  const normH = Math.max(0, Math.min(12, Math.floor(initialHours)));
  const normM = Math.max(0, Math.min(59, Math.floor(initialMinutes)));

  const [selectedH, setSelectedH] = useState(normH);
  const [selectedM, setSelectedM] = useState(normM);

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const selectedHRef = useRef(selectedH);
  const selectedMRef = useRef(selectedM);
  selectedHRef.current = selectedH;
  selectedMRef.current = selectedM;

  // 0 to 12 hours, 00 to 59 minutes (every single minute!)
  const hoursList = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []);
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const totalMinutes = selectedH * 60 + selectedM;
  const isUnderMinDuration = totalMinutes < 15;
  const isMaxDuration = totalMinutes >= 720;

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
      const h = Math.max(0, Math.min(12, Math.floor(initialHours)));
      const m = Math.max(0, Math.min(59, Math.floor(initialMinutes)));

      setSelectedH(h);
      setSelectedM(m);
      selectedHRef.current = h;
      selectedMRef.current = m;

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
  }, [visible, initialHours, initialMinutes, pinWheels]);

  // Synchronous scroll handlers - CRASH PROOF, NO ASYNC EVENT POOL ACCESS
  const handleHourScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(12, Math.round(y / ITEM_HEIGHT)));
      if (idx !== selectedHRef.current) {
        selectedHRef.current = idx;
        setSelectedH(idx);
        // If 12 hours, clamp minutes to 0
        if (idx === 12 && selectedMRef.current !== 0) {
          selectedMRef.current = 0;
          setSelectedM(0);
          minutesScrollRef.current?.scrollTo({ y: 0, animated: true });
        }
      }
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleHourScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      const idx = Math.max(0, Math.min(12, Math.round(y / ITEM_HEIGHT)));
      selectedHRef.current = idx;
      setSelectedH(idx);
      hoursScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleMinuteScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      let idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
      // If 12 hours selected, minutes cannot exceed 0
      if (selectedHRef.current === 12 && idx > 0) {
        idx = 0;
        minutesScrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      if (idx !== selectedMRef.current) {
        selectedMRef.current = idx;
        setSelectedM(idx);
      }
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const handleMinuteScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    try {
      const y = e.nativeEvent?.contentOffset?.y ?? 0;
      let idx = Math.max(0, Math.min(59, Math.round(y / ITEM_HEIGHT)));
      if (selectedHRef.current === 12 && idx > 0) {
        idx = 0;
      }
      selectedMRef.current = idx;
      setSelectedM(idx);
      minutesScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    } catch {
      // Prevent unhandled errors
    }
  }, []);

  const selectHour = useCallback((h: number) => {
    selectedHRef.current = h;
    setSelectedH(h);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    if (h === 12 && selectedMRef.current > 0) {
      selectedMRef.current = 0;
      setSelectedM(0);
      minutesScrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, []);

  const selectMinute = useCallback((m: number) => {
    if (selectedHRef.current === 12 && m > 0) return;
    selectedMRef.current = m;
    setSelectedM(m);
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
  }, []);

  const selectDuration = useCallback((h: number, m: number) => {
    selectedHRef.current = h;
    selectedMRef.current = m;
    setSelectedH(h);
    setSelectedM(m);
    hoursScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    minutesScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
  }, []);

  const handleConfirm = useCallback(() => {
    if (isUnderMinDuration) return;
    const durationHours = selectedH + selectedM / 60;
    onConfirm(durationHours);
    onClose();
  }, [isUnderMinDuration, selectedH, selectedM, onConfirm, onClose]);

  // Preview formatted text matching demo: "2 giờ", "45 phút", "2 giờ 15 phút"
  const formattedPreview = useMemo(() => {
    if (selectedH === 0 && selectedM === 0) return '0 phút';
    if (selectedH === 0) return `${selectedM} phút`;
    if (selectedM === 0) return `${selectedH} giờ`;
    return `${selectedH} giờ ${selectedM} phút`;
  }, [selectedH, selectedM]);

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
          {/* Drag grab handle */}
          <View style={styles.dragHandle} />

          {/* Sheet Head: Huỷ (left) | Thời lượng tuỳ chỉnh (center) | Xác nhận (right) */}
          <View style={styles.sheetHead}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={styles.headBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.cancelBtnText}>Huỷ</Text>
            </TouchableOpacity>

            <Text style={styles.sheetTitle}>Thời lượng tuỳ chỉnh</Text>

            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isUnderMinDuration}
              onPress={handleConfirm}
              style={[styles.headBtn, isUnderMinDuration && styles.confirmBtnDisabled]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text
                style={[styles.confirmBtnText, isUnderMinDuration && styles.confirmBtnTextDisabled]}
              >
                Xác nhận
              </Text>
            </TouchableOpacity>
          </View>

          {/* Big Preview Text (Demo Standard: 30px bold green) */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewText} numberOfLines={1}>
              {formattedPreview}
            </Text>
          </View>

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

            {/* 2 Scroll Columns */}
            <View style={styles.wheelsContainer}>
              {/* Column 1: Hours (0–12) */}
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
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.wheelSpacer} />
                </ScrollView>
              </View>

              {/* Separator spacer (no colon in duration demo) */}
              <View pointerEvents="none" style={styles.wheelSep} />

              {/* Column 2: Minutes (00–59 every minute!) */}
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

          {/* Quick preset duration chips */}
          <View style={styles.sheetChipsContainer}>
            <Text style={styles.sheetChipsLabel}>Gợi ý nhanh:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sheetChipsScroll}
            >
              {[
                { label: '1 giờ', h: 1, m: 0 },
                { label: '1h 30p', h: 1, m: 30 },
                { label: '2 giờ', h: 2, m: 0 },
                { label: '3 giờ', h: 3, m: 0 },
                { label: '4 giờ', h: 4, m: 0 },
                { label: 'Nửa ngày (4h)', h: 4, m: 0 },
                { label: 'Cả ngày (8h)', h: 8, m: 0 },
              ].map(item => {
                const isSel = selectedH === item.h && selectedM === item.m;
                return (
                  <TouchableOpacity
                    key={item.label}
                    activeOpacity={0.7}
                    onPress={() => selectDuration(item.h, item.m)}
                    style={[styles.sheetChip, isSel && styles.sheetChipActive]}
                  >
                    <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Footer Note */}
          <Text style={[styles.sheetNote, isUnderMinDuration && styles.sheetNoteErr]}>
            {isUnderMinDuration
              ? 'Thời lượng tối thiểu là 15 phút — chọn thêm giờ hoặc phút.'
              : isMaxDuration
                ? 'Mức tối đa cho một lần đặt: 12 giờ.'
                : 'Chỉnh tự do: giờ 0–12, phút 00–59.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

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
  confirmBtnDisabled: {
    opacity: 0.35,
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
  confirmBtnTextDisabled: {
    color: '#94A3B8',
  },
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 4,
    minHeight: 40,
  },
  previewText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: -0.2,
  },
  wheelLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
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
  sheetChipsContainer: {
    marginTop: 8,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  },
  sheetChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  sheetNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    minHeight: 16,
  },
  sheetNoteErr: {
    color: '#DC2626',
    fontWeight: '700',
  },
});
