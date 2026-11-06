import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import {
  LogOut,
  AlertTriangle,
  Car,
  Shield,
  CheckCircle2,
  Camera,
  AlertOctagon,
  Bell,
} from 'lucide-react-native';
import type { AlertButton, AlertOptions } from 'react-native';
import { create } from 'zustand';
import Toast from 'react-native-toast-message';
import { useTranslation } from '@/hooks/use-i18n';
import { useSettingsStore } from '@/stores/settings.store';

const getLanguage = () => useSettingsStore.getState().language;

export type Dialog = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
  icon?: string;
};

const useDialogs = create<{ queue: Dialog[] }>(() => ({ queue: [] }));

const getDialogIcon = (title: string, message?: string, buttons?: AlertButton[]): string => {
  const t = (title + ' ' + (message || '')).toLowerCase();
  if (t.includes('đăng xuất') || t.includes('logout')) return 'logout';
  if (t.includes('hủy') || t.includes('cancel') || t.includes('xóa')) return 'warning';
  if (t.includes('di chuyển') || t.includes('xe') || t.includes('đến')) return 'car';
  if (
    t.includes('kyc') ||
    t.includes('xác minh') ||
    t.includes('danh tính') ||
    t.includes('bảo mật')
  )
    return 'shield';
  if (t.includes('thành công') || t.includes('hoàn tất') || t.includes('nghiệm thu'))
    return 'success';
  if (t.includes('ảnh') || t.includes('camera') || t.includes('chứng từ')) return 'camera';
  if (t.includes('sos') || t.includes('khẩn cấp') || t.includes('cứu hộ')) return 'sos';
  if (buttons?.some(b => b.style === 'destructive')) return 'warning';
  return 'bell';
};

const renderDialogIcon = (iconKey?: string) => {
  const size = 28;
  switch (iconKey) {
    case 'logout':
      return <LogOut size={size} color="#EF4444" />;
    case 'warning':
      return <AlertTriangle size={size} color="#F59E0B" />;
    case 'car':
      return <Car size={size} color="#3B82F6" />;
    case 'shield':
      return <Shield size={size} color="#10B981" />;
    case 'success':
      return <CheckCircle2 size={size} color="#10B981" />;
    case 'camera':
      return <Camera size={size} color="#6366F1" />;
    case 'sos':
      return <AlertOctagon size={size} color="#EF4444" />;
    default:
      return <Bell size={size} color="#22C55E" />;
  }
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const defaultButtons: AlertButton[] = [
      { text: getLanguage() === 'en' ? 'OK' : 'Đồng ý', style: 'default' },
    ];
    const icon = getDialogIcon(title, message, buttons);
    useDialogs.setState(s => ({
      queue: [
        ...s.queue,
        {
          title,
          message,
          buttons: buttons && buttons.length > 0 ? buttons : defaultButtons,
          options,
          icon,
        },
      ],
    }));
  },
};

export function AppAlertHost() {
  const dialog = useDialogs(s => s.queue[0]);
  const { fs, textScale } = useTranslation();
  if (!dialog) return null;

  const dismiss = (button?: AlertButton) => {
    if (useDialogs.getState().queue[0] !== dialog) return;
    useDialogs.setState(s => ({ queue: s.queue.slice(1) }));
    Promise.resolve()
      .then(() => (button ? button.onPress?.() : dialog.options?.onDismiss?.()))
      .catch(err => {
        const msg =
          err?.message ||
          (getLanguage() === 'en'
            ? 'Operation failed. Please try again.'
            : 'Chưa thực hiện được. Vui lòng thử lại.');
        Toast.show({
          type: 'error',
          text1: getLanguage() === 'en' ? 'Error' : 'Lỗi',
          text2: msg,
        });
      });
  };

  const isTwoButtons = dialog.buttons.length === 2;
  const hasDestructive = dialog.buttons.some(b => b.style === 'destructive');
  const iconBg = hasDestructive ? '#FEE2E2' : '#DCFCE7';

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (dialog.options?.cancelable !== false) {
          dismiss(dialog.buttons.find(b => b.style === 'cancel'));
        }
      }}
    >
      <TouchableWithoutFeedback
        onPress={() => {
          if (dialog.options?.cancelable !== false) {
            dismiss(dialog.buttons.find(b => b.style === 'cancel'));
          }
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            ...Platform.select({
              web: {
                backdropFilter: 'blur(4px)',
              } as any,
            }),
          }}
        >
          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View
              accessibilityViewIsModal
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                padding: 24,
                width: '100%',
                maxWidth: 420,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.2,
                shadowRadius: 20,
                elevation: 10,
                borderWidth: 1,
                borderColor: '#F3F4F6',
              }}
            >
              {/* Badge Icon */}
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: iconBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                {renderDialogIcon(dialog.icon)}
              </View>

              {/* Title */}
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: fs(18.5),
                  fontWeight: '800',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: 8,
                  lineHeight: Math.round(fs(25)),
                }}
              >
                {dialog.title}
              </Text>

              {/* Message */}
              {!!dialog.message && (
                <ScrollView
                  style={{ maxHeight: 220, width: '100%', marginBottom: 20 }}
                  contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                  <Text
                    style={{
                      fontSize: fs(14.5),
                      color: '#4B5563',
                      textAlign: 'center',
                      lineHeight: Math.round(fs(22)),
                    }}
                  >
                    {dialog.message}
                  </Text>
                </ScrollView>
              )}

              {/* Buttons */}
              <View
                style={{
                  width: '100%',
                  flexDirection: isTwoButtons ? 'row' : 'column',
                  gap: 10,
                  marginTop: dialog.message ? 0 : 12,
                }}
              >
                {dialog.buttons.map((button, index) => {
                  const isCancel = button.style === 'cancel';
                  const isDestruct = button.style === 'destructive';

                  let btnBg = '#10B981'; // Green House Emerald
                  let textColor = '#FFFFFF';

                  if (isCancel) {
                    btnBg = '#F3F4F6';
                    textColor = '#4B5563';
                  } else if (isDestruct) {
                    btnBg = '#EF4444';
                    textColor = '#FFFFFF';
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      accessibilityRole="button"
                      activeOpacity={0.8}
                      onPress={() => dismiss(button)}
                      style={{
                        flex: isTwoButtons ? 1 : undefined,
                        minHeight: Math.max(46, Math.round(46 * textScale)),
                        paddingVertical: 8,
                        borderRadius: 14,
                        backgroundColor: btnBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs(15),
                          fontWeight: '700',
                          color: textColor,
                        }}
                      >
                        {button.text || (getLanguage() === 'en' ? 'OK' : 'Đồng ý')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
