import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import type { AlertButton, AlertOptions } from 'react-native';
import { create } from 'zustand';
import Toast from 'react-native-toast-message';

type Dialog = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const useDialogs = create<{ queue: Dialog[] }>(() => ({ queue: [] }));

// React Native Web's Alert.alert is a no-op. Use the same accessible confirmation on every platform.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    useDialogs.setState(s => ({
      queue: [
        ...s.queue,
        { title, message, buttons: buttons?.length ? buttons : [{ text: 'Đồng ý' }], options },
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
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Chưa thực hiện được', text2: 'Vui lòng thử lại.' });
      });
  };
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (dialog.options?.cancelable !== false)
          dismiss(dialog.buttons.find(b => b.style === 'cancel'));
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: 'white',
            padding: 24,
            borderRadius: 20,
            maxWidth: 440,
            width: '100%',
            alignSelf: 'center',
            maxHeight: '85%',
          }}
        >
          <ScrollView>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}
            >
              {dialog.title}
            </Text>
            {!!dialog.message && (
              <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 20 }}>
                {dialog.message}
              </Text>
            )}
            {dialog.buttons.map((button, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                onPress={() => dismiss(button)}
                style={{
                  padding: 14,
                  marginTop: 8,
                  borderRadius: 12,
                  backgroundColor:
                    button.style === 'cancel'
                      ? '#F3F4F6'
                      : button.style === 'destructive'
                        ? '#DC2626'
                        : '#15803D',
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontWeight: '700',
                    color: button.style === 'cancel' ? '#374151' : '#FFFFFF',
                  }}
                >
                  {button.text || 'Đồng ý'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
