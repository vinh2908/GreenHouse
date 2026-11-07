import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useTranslation, fs } from '@/hooks/use-i18n';

interface WalletBalanceDisplayProps {
  balance?: number | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  textStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  showRetryButton?: boolean;
}

export function WalletBalanceDisplay({
  balance,
  isLoading,
  isError,
  onRetry,
  textStyle,
  errorStyle,
  containerStyle,
  showRetryButton = true,
}: WalletBalanceDisplayProps) {
  const { lang } = useTranslation();

  if (isLoading && (balance === undefined || balance === null)) {
    return (
      <View style={containerStyle}>
        <Text style={textStyle}>...</Text>
      </View>
    );
  }

  if (isError && (balance === undefined || balance === null)) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, containerStyle]}>
        <Text style={[{ color: '#F87171', fontSize: fs(14), fontWeight: '700' }, errorStyle]}>
          {lang === 'en' ? 'Failed to load' : 'Không tải được'}
        </Text>
        {showRetryButton && onRetry && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onRetry}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              borderRadius: 6,
            }}
          >
            <RefreshCw size={12} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: fs(11), fontWeight: '700' }}>
              {lang === 'en' ? 'Retry' : 'Thử lại'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const safeBalance = balance ?? 0;
  const formatted = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(safeBalance);

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{formatted}₫</Text>
    </View>
  );
}
