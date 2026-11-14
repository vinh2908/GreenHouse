/**
 * R7 item 3 — shared overdue banner (customer side, app + web via the shared
 * component, no platform CSS): renders ONLY for a job whose scheduled start
 * has passed and no helper is assigned yet (callers gate with
 * `isOverdueUnassigned` from '@/utils/job-overdue'). Never for assigned /
 * in-progress jobs. Three real actions: reschedule (opens the B7 edit
 * modal), re-broadcast to nearby helpers (existing notifyNearbyHelpers path),
 * cancel (opens the existing cancel flow).
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AlertTriangle, CalendarClock, Send, X } from 'lucide-react-native';
import { COLORS } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';

export interface OverdueJobBannerProps {
  /** Short label of the missed start, e.g. '10:00 · 14/11'. */
  timeLabel?: string;
  onReschedule: () => void;
  onRebroadcast: () => void;
  onCancel: () => void;
  rebroadcasting?: boolean;
}

export function OverdueJobBanner({
  timeLabel,
  onReschedule,
  onRebroadcast,
  onCancel,
  rebroadcasting = false,
}: OverdueJobBannerProps) {
  const { t, fs } = useTranslation();

  return (
    <View
      style={{
        backgroundColor: '#FFFBEB',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        borderRadius: 14,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={20} color="#D97706" style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: fs(13.5), fontWeight: '800', color: '#92400E' }}>
            {t('overdue_banner_title')}
            {timeLabel ? ` · ${timeLabel}` : ''}
          </Text>
          <Text style={{ fontSize: fs(12.5), color: '#78350F', lineHeight: 18 }}>
            {t('overdue_banner_body')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onReschedule}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: COLORS.primary,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <CalendarClock size={15} color="#FFFFFF" />
          <Text style={{ fontSize: fs(13), fontWeight: '800', color: '#FFFFFF' }}>
            {t('overdue_action_reschedule')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onRebroadcast}
          disabled={rebroadcasting}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: COLORS.primary,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            opacity: rebroadcasting ? 0.6 : 1,
          }}
        >
          {rebroadcasting ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Send size={15} color={COLORS.primary} />
          )}
          <Text style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.primary }}>
            {t('overdue_action_rebroadcast')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onCancel}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: '#FECACA',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <X size={15} color={COLORS.error} />
          <Text style={{ fontSize: fs(13), fontWeight: '800', color: COLORS.error }}>
            {t('overdue_action_cancel')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
