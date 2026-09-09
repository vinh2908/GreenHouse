// apps/mobile/components/ui/index.tsx
import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  TextInput,
  Image,
  type TextInputProps,
  type TouchableOpacityProps,
  type ViewProps,
} from 'react-native';

// ─── Vua Thợ / HomeMate Color Palette ──────────────────────────────────────────
export const COLORS = {
  primary: '#FF6B1A',
  primaryDark: '#E55A0E',
  primaryLight: '#FFF4ED',
  primaryGlow: 'rgba(255, 107, 26, 0.15)',
  secondary: '#1A73E8',
  secondaryLight: '#EEF4FE',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  error: '#EF4444',
  errorLight: '#FEF2F2',
  dark: '#111827',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
};

// ─── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  fullWidth = true,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isPrimary = variant === 'primary' || variant === 'gradient';
  const isSecondary = variant === 'secondary';
  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';

  const bgColor = isPrimary
    ? COLORS.primary
    : isSecondary
    ? COLORS.gray[100]
    : isDanger
    ? COLORS.error
    : 'transparent';

  const textColor = isPrimary || isDanger
    ? '#FFFFFF'
    : isOutline
    ? COLORS.primary
    : isSecondary
    ? COLORS.gray[800]
    : COLORS.primary;

  const paddingY = { sm: 9, md: 13, lg: 16 }[size];
  const fontSize = { sm: 13, md: 15, lg: 16 }[size];

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled || loading}
      style={[
        {
          backgroundColor: bgColor,
          borderRadius: 14,
          paddingVertical: paddingY,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled || loading ? 0.6 : 1,
          borderWidth: isOutline ? 1.5 : 0,
          borderColor: COLORS.primary,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          ...(isPrimary
            ? {
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28,
                shadowRadius: 8,
                elevation: 4,
              }
            : {}),
        },
        style as object,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={{ color: textColor, fontSize, fontWeight: '700', letterSpacing: 0.2 }}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, leftIcon, rightIcon, style, ...props }: InputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.gray[700] }}>
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1.5,
          borderColor: error ? COLORS.error : COLORS.gray[200],
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        {leftIcon}
        <TextInput
          style={[
            {
              flex: 1,
              fontSize: 15,
              color: COLORS.gray[900],
              paddingVertical: 13,
            },
            style as object,
          ]}
          placeholderTextColor={COLORS.gray[400]}
          {...props}
        />
        {rightIcon}
      </View>
      {error && <Text style={{ fontSize: 12, color: COLORS.error, marginTop: -2 }}>{error}</Text>}
    </View>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

interface CardProps extends ViewProps {
  shadow?: boolean;
}

export function Card({ children, shadow = true, style, ...props }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          padding: 16,
          borderWidth: 1,
          borderColor: 'rgba(0, 0, 0, 0.04)',
          ...(shadow
            ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 3,
              }
            : {}),
        },
        style as object,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}

export function Badge({
  label,
  color = COLORS.primaryLight,
  textColor = COLORS.primary,
  size = 'md',
}: BadgeProps) {
  return (
    <View
      style={{
        backgroundColor: color,
        borderRadius: 8,
        paddingHorizontal: size === 'sm' ? 8 : 10,
        paddingVertical: size === 'sm' ? 3 : 5,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: size === 'sm' ? 11 : 12, fontWeight: '700', color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  uri?: string;
  name?: string;
  size?: number;
}

export function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const initials = name
    ?.split(' ')
    .map(w => w[0])
    .slice(-2)
    .join('')
    .toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.gray[200] }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '800' }}>
        {initials ?? 'H'}
      </Text>
    </View>
  );
}

// ─── Separator ─────────────────────────────────────────────────────────────────

export function Separator({ my = 14 }: { my?: number }) {
  return <View style={{ height: 1, backgroundColor: COLORS.gray[100], marginVertical: my }} />;
}

// ─── Section Header ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  subtitle?: string;
}

export function SectionHeader({ title, action, onAction, subtitle }: SectionHeaderProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900], letterSpacing: -0.3 }}>
          {title}
        </Text>
        {action && (
          <TouchableOpacity activeOpacity={0.7} onPress={onAction}>
            <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '700' }}>{action}</Text>
          </TouchableOpacity>
        )}
      </View>
      {subtitle && (
        <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>{subtitle}</Text>
      )}
    </View>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji = '📋', title, subtitle, action, onAction }: EmptyStateProps) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: COLORS.gray[100],
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 36 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.gray[800], textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 13, color: COLORS.gray[500], textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
          {subtitle}
        </Text>
      )}
      {action && onAction && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAction}
          style={{
            marginTop: 18,
            backgroundColor: COLORS.primary,
            paddingHorizontal: 22,
            paddingVertical: 11,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Loading Spinner ───────────────────────────────────────────────────────────

export function LoadingSpinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
      <ActivityIndicator size={size} color={COLORS.primary} />
    </View>
  );
}

// ─── Job Status Badge ──────────────────────────────────────────────────────────

const JOB_STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  open: { label: 'Đang tìm thợ', color: '#EFF6FF', textColor: '#1D4ED8' },
  receiving_quotes: { label: 'Có báo giá', color: '#F5F3FF', textColor: '#6D28D9' },
  confirmed: { label: 'Đã nhận đơn', color: '#FFF7ED', textColor: '#C2410C' },
  helper_on_the_way: { label: 'Đang di chuyển', color: '#FEF3C7', textColor: '#92400E' },
  helper_arrived: { label: 'Đã đến nơi', color: '#ECFDF5', textColor: '#065F46' },
  in_progress: { label: 'Đang thực hiện', color: '#F0FDF4', textColor: '#166534' },
  pending_review: { label: 'Chờ nghiệm thu', color: '#EFF6FF', textColor: '#1E40AF' },
  completed: { label: 'Hoàn tất', color: '#ECFDF5', textColor: '#065F46' },
  cancelled: { label: 'Đã hủy', color: '#FEF2F2', textColor: '#991B1B' },
  disputed: { label: 'Khiếu nại', color: '#FEF2F2', textColor: '#991B1B' },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] ?? {
    label: status,
    color: COLORS.gray[100],
    textColor: COLORS.gray[700],
  };
  return <Badge label={config.label} color={config.color} textColor={config.textColor} />;
}

// ─── Star Rating ───────────────────────────────────────────────────────────────

export function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: size, color: '#F59E0B' }}>★</Text>
      <Text style={{ fontSize: size + 1, fontWeight: '700', color: COLORS.gray[800] }}>
        {rating > 0 ? rating.toFixed(1) : '5.0'}
      </Text>
    </View>
  );
}

// ─── Price Display ─────────────────────────────────────────────────────────────

export function PriceText({
  amount,
  size = 16,
  color = COLORS.primary,
  bold = true,
}: {
  amount: number;
  size?: number;
  color?: string;
  bold?: boolean;
}) {
  return (
    <Text style={{ fontSize: size, color, fontWeight: bold ? '800' : '500' }}>
      {new Intl.NumberFormat('vi-VN').format(amount)}₫
    </Text>
  );
}
