// apps/mobile/components/ui/index.tsx
import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  TextInput,
  Image,
  Linking,
  type TextInputProps,
  type TouchableOpacityProps,
  type ViewProps,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { AlertTriangle, RotateCw, ClipboardList, Phone } from 'lucide-react-native';
import { OFFICIAL_CONTACT_PHONE, OFFICIAL_CONTACT_PHONE_DISPLAY } from '@homemate/constants';
import { useTranslation } from '@/hooks/use-i18n';
import { lightImpact } from '@/services/haptics';

// ─── Green House Color Palette (Banana Green / Lime Fresh) ───────────────────
// B19 — 1 xanh chính + 1 xanh đậm, dùng nhất quán:
//   primary (#22C55E): nút chính, header, tab đang chọn, điểm nhấn chính.
//   primaryDark (#16A34A): chỉ dùng cho chữ/icon trên nền sáng (độ tương phản)
//   và trạng thái nhấn — KHÔNG dùng làm màu nền chính thay cho primary.
// Bo góc chuẩn 3 mức (RADIUS): 8 nhỏ, 14 nút/card, 999 tròn.
export const RADIUS = { sm: 8, md: 14, full: 999 } as const;
export const COLORS = {
  primary: '#22C55E', // Banana / Fresh vibrant Green
  primaryDark: '#16A34A',
  primaryLight: '#DCFCE7',
  primaryGlow: 'rgba(34, 197, 94, 0.15)',
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
  textStyle?: StyleProp<TextStyle>;
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
  textStyle,
  onPress,
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

  const textColor =
    isPrimary || isDanger
      ? '#FFFFFF'
      : isOutline
        ? COLORS.primary
        : isSecondary
          ? COLORS.gray[800]
          : COLORS.primary;

  const { fs } = useTranslation();
  // B18: nút cỡ nhỏ vẫn đạt chuẩn chạm 44px (13px chữ + 2×12px padding + border)
  const paddingY = { sm: 12, md: 13, lg: 16 }[size];
  const fontSize = fs({ sm: 13, md: 15, lg: 16 }[size]);

  // B20: rung nhẹ khi bấm nút chính (primary/gradient); nút phụ không rung
  const handlePress = (e: any) => {
    if (isPrimary) void lightImpact();
    onPress?.(e);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={handlePress}
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
          <Text
            style={[
              { color: textColor, fontSize, fontWeight: '700', letterSpacing: 0.2 },
              textStyle,
            ]}
          >
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
  const { fs } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ fontSize: fs(13), fontWeight: '600', color: COLORS.gray[700] }}>
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
              fontSize: fs(15),
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
      {error && (
        <Text style={{ fontSize: fs(12), color: COLORS.error, marginTop: -2 }}>{error}</Text>
      )}
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
          borderRadius: 14,
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
  const { fs } = useTranslation();
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
      <Text style={{ fontSize: fs(size === 'sm' ? 11 : 12), fontWeight: '700', color: textColor }}>
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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [uri]);

  const initials = name
    ?.split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(-2)
    .join('')
    .toUpperCase();

  if (uri && !hasError) {
    return (
      <Image
        source={{ uri }}
        onError={() => setHasError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLORS.gray[200],
        }}
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
        {initials || 'H'}
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
  // Feature 20: tiêu đề mục tự phóng theo cài đặt cỡ chữ của user.
  const { fs } = useTranslation();
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text
          style={{
            fontSize: fs(18),
            fontWeight: '800',
            color: COLORS.gray[900],
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {action && (
          <TouchableOpacity activeOpacity={0.7} onPress={onAction}>
            <Text style={{ fontSize: fs(13), color: COLORS.primary, fontWeight: '700' }}>
              {action}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {subtitle && (
        <Text style={{ fontSize: fs(12), color: COLORS.gray[500], marginTop: 2 }}>{subtitle}</Text>
      )}
    </View>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, action, onAction }: EmptyStateProps) {
  const { fs } = useTranslation();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          backgroundColor: COLORS.gray[100],
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        {icon ? (
          icon
        ) : (
          <ClipboardList size={36} color={COLORS.gray[400]} />
        )}
      </View>
      <Text
        style={{
          fontSize: fs(16),
          fontWeight: '700',
          color: COLORS.gray[800],
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: fs(13),
            color: COLORS.gray[500],
            textAlign: 'center',
            marginTop: 6,
            lineHeight: Math.round(fs(19)),
          }}
        >
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
            borderRadius: 14,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(14) }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Error State ───────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  retryText?: string;
}

export function ErrorState({ title, subtitle, onRetry, retryText }: ErrorStateProps) {
  const { fs, lang } = useTranslation();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          backgroundColor: '#FEE2E2',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <AlertTriangle size={32} color="#DC2626" />
      </View>
      <Text
        style={{
          fontSize: fs(16),
          fontWeight: '700',
          color: COLORS.gray[800],
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {title || (lang === 'en' ? 'Unable to load data' : 'Không thể tải dữ liệu')}
      </Text>
      <Text
        style={{
          fontSize: fs(13),
          color: COLORS.gray[500],
          textAlign: 'center',
          marginBottom: 20,
          lineHeight: 18,
        }}
      >
        {subtitle ||
          (lang === 'en'
            ? 'A connection or server error occurred. Please try again.'
            : 'Đã xảy ra lỗi kết nối hoặc hệ thống. Vui lòng thử lại.')}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.8}
          style={{
            backgroundColor: COLORS.primary,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <RotateCw size={16} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: fs(14) }}>
            {retryText || (lang === 'en' ? 'Retry' : 'Thử lại')}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => Linking.openURL(`tel:${OFFICIAL_CONTACT_PHONE}`).catch(() => {})}
        activeOpacity={0.7}
        style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Phone size={14} color={COLORS.gray[500]} />
        <Text style={{ fontSize: fs(12.5), color: COLORS.gray[500] }}>
          {lang === 'en' ? 'Support Hotline: ' : 'Tổng đài hỗ trợ: '}
          <Text style={{ color: COLORS.primaryDark, fontWeight: '700' }}>
            {OFFICIAL_CONTACT_PHONE_DISPLAY}
          </Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Skeleton (B28) ──────────────────────────────────────────────────────────
// Khối xám giữ khung bố cục khi dữ liệu đang tải — thay cho spinner trắng
// toàn màn hình (mẫu đã có ở (customer)/jobs.tsx và (helper)/dashboard.tsx).
export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width: width as never,
          height: height as never,
          borderRadius: radius,
          backgroundColor: COLORS.gray[200],
        },
        style as object,
      ]}
    />
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
  quote_selected: { label: 'Đã chọn báo giá', color: '#FFF7ED', textColor: '#C2410C' },
  confirmed: { label: 'Đã nhận đơn', color: '#FFF7ED', textColor: '#C2410C' },
  helper_on_the_way: { label: 'Đang di chuyển', color: '#FEF3C7', textColor: '#92400E' },
  helper_arrived: { label: 'Đã đến nơi', color: '#ECFDF5', textColor: '#065F46' },
  in_progress: { label: 'Đang thực hiện', color: '#F0FDF4', textColor: '#166534' },
  pending_review: { label: 'Chờ nghiệm thu', color: '#EFF6FF', textColor: '#1E40AF' },
  completed: { label: 'Hoàn tất', color: '#ECFDF5', textColor: '#065F46' },
  cancelled: { label: 'Đã hủy', color: '#FEF2F2', textColor: '#991B1B' },
  disputed: { label: 'Đang tranh chấp', color: '#FEF2F2', textColor: '#991B1B' },
  refunded: { label: 'Đã hoàn tiền', color: '#F3F4F6', textColor: '#374151' },
};

export function JobStatusBadge({ status }: { status: string }) {
  // Feature 20: nhãn trạng thái dịch qua từ điển theo key `status_<status>`,
  // fallback về nhãn tiếng Việt cứng nếu status lạ.
  const { t } = useTranslation();
  const config = JOB_STATUS_CONFIG[status] ?? {
    label: status,
    color: COLORS.gray[100],
    textColor: COLORS.gray[700],
  };
  const translated = t(`status_${status}`);
  const label = translated === `status_${status}` ? config.label : translated;
  return <Badge label={label} color={config.color} textColor={config.textColor} />;
}

// ─── Star Rating ───────────────────────────────────────────────────────────────

export function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  const { fs } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: fs(size), color: '#F59E0B' }}>★</Text>
      <Text style={{ fontSize: fs(size + 1), fontWeight: '700', color: COLORS.gray[800] }}>
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
  const { fs } = useTranslation();
  return (
    <Text style={{ fontSize: fs(size), color, fontWeight: bold ? '800' : '500' }}>
      {new Intl.NumberFormat('vi-VN').format(amount)}₫
    </Text>
  );
}
