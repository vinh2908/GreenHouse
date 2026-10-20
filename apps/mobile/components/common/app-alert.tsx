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
import type { AlertButton, AlertOptions } from 'react-native';
import { create } from 'zustand';
import Toast from 'react-native-toast-message';

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
  if (t.includes('đăng xuất') || t.includes('logout')) return '🚪';
  if (t.includes('hủy') || t.includes('cancel') || t.includes('xóa')) return '⚠️';
  if (t.includes('di chuyển') || t.includes('xe') || t.includes('đến')) return '🚗';
  if (
    t.includes('kyc') ||
    t.includes('xác minh') ||
    t.includes('danh tính') ||
    t.includes('bảo mật')
  )
    return '🛡️';
  if (t.includes('thành công') || t.includes('hoàn tất') || t.includes('nghiệm thu')) return '✅';
  if (t.includes('ảnh') || t.includes('camera') || t.includes('chứng từ')) return '📷';
  if (t.includes('sos') || t.includes('khẩn cấp') || t.includes('cứu hộ')) return '🚨';
  if (buttons?.some(b => b.style === 'destructive')) return '⚠️';
  return '🔔';
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const defaultButtons: AlertButton[] = [{ text: 'Đồng ý', style: 'default' }];
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
  if (!dialog) return null;

  const dismiss = (button?: AlertButton) => {
    if (useDialogs.getState().queue[0] !== dialog) return;
    useDialogs.setState(s => ({ queue: s.queue.slice(1) }));
    Promise.resolve()
      .then(() => (button ? button.onPress?.() : dialog.options?.onDismiss?.()))
      .catch(err => {
        const msg = err?.message || 'Chưa thực hiện được. Vui lòng thử lại.';
        Toast.show({ type: 'error', text1: 'Lỗi', text2: msg });
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
                <Text style={{ fontSize: 28 }}>{dialog.icon || '🔔'}</Text>
              </View>

              {/* Title */}
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 18.5,
                  fontWeight: '800',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: 8,
                  lineHeight: 25,
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
                      fontSize: 14.5,
                      color: '#4B5563',
                      textAlign: 'center',
                      lineHeight: 22,
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
                        height: 46,
                        borderRadius: 14,
                        backgroundColor: btnBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '700',
                          color: textColor,
                        }}
                      >
                        {button.text || 'Đồng ý'}
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
