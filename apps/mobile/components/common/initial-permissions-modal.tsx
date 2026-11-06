// components/common/initial-permissions-modal.tsx
// Màn hình xin quyền hợp nhất lần đầu tải app (Lỗi 10) & Mục quản lý quyền trong Hồ sơ.
import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Camera as ExpoCamera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  Bell,
  MapPin,
  Camera,
  Mic,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { Card, COLORS, useThemeColors } from '@/components/ui';
import { useTranslation } from '@/hooks/use-i18n';
import { I18nKey } from '@/services/i18n';

export const PERMISSION_STORAGE_KEY = 'gh_initial_permissions_requested_v1';

export interface PermissionItem {
  id: 'notifications' | 'location' | 'camera' | 'microphone' | 'photos';
  title: string;
  description: string;
  titleKey: I18nKey;
  descKey: I18nKey;
  icon: typeof Bell;
  granted: boolean;
}

const INITIAL_PERMISSIONS: Omit<PermissionItem, 'granted'>[] = [
  {
    id: 'notifications',
    title: 'Thông báo',
    description: 'Để nhận thông báo việc mới, báo giá, tin nhắn khi out app.',
    titleKey: 'perm_notifications_title',
    descKey: 'perm_notifications_desc',
    icon: Bell,
  },
  {
    id: 'location',
    title: 'Vị trí khi dùng app',
    description: 'Để tìm thợ gần bạn và định vị địa chỉ làm việc.',
    titleKey: 'perm_location_title',
    descKey: 'perm_location_desc',
    icon: MapPin,
  },
  {
    id: 'camera',
    title: 'Camera',
    description: 'Để chụp ảnh e-KYC và ảnh sự cố.',
    titleKey: 'perm_camera_title',
    descKey: 'perm_camera_desc',
    icon: Camera,
  },
  {
    id: 'microphone',
    title: 'Microphone',
    description: 'Để gọi điện cho thợ và khách.',
    titleKey: 'perm_microphone_title',
    descKey: 'perm_microphone_desc',
    icon: Mic,
  },
  {
    id: 'photos',
    title: 'Thư viện ảnh',
    description: 'Để chọn ảnh có sẵn khi cần gửi ảnh.',
    titleKey: 'perm_photos_title',
    descKey: 'perm_photos_desc',
    icon: ImageIcon,
  },
];

export async function checkAllPermissions(): Promise<Record<PermissionItem['id'], boolean>> {
  if (Platform.OS === 'web') {
    return {
      notifications: true,
      location: true,
      camera: true,
      microphone: true,
      photos: true,
    };
  }

  const results: Record<PermissionItem['id'], boolean> = {
    notifications: false,
    location: false,
    camera: false,
    microphone: false,
    photos: false,
  };

  try {
    const notif = await Notifications.getPermissionsAsync();
    results.notifications = notif.granted;
  } catch {
    // ignore
  }

  try {
    const loc = await Location.getForegroundPermissionsAsync();
    results.location = loc.granted;
  } catch {
    // ignore
  }

  try {
    const cam = await ExpoCamera.getCameraPermissionsAsync();
    results.camera = cam.granted;
  } catch {
    // ignore
  }

  try {
    const mic = await ExpoCamera.getMicrophonePermissionsAsync();
    results.microphone = mic.granted;
  } catch {
    // ignore
  }

  try {
    const photos = await ImagePicker.getMediaLibraryPermissionsAsync();
    results.photos = photos.granted;
  } catch {
    // ignore
  }

  return results;
}

/**
 * Modal xin quyền hợp nhất 5 quyền lần đầu đăng nhập
 */
export function InitialPermissionsModal() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === 'web') return;

    let active = true;
    (async () => {
      try {
        const hasRequested = await AsyncStorage.getItem(PERMISSION_STORAGE_KEY);
        if (!hasRequested && active) {
          const current = await checkAllPermissions();
          setStatusMap(current);
          setVisible(true);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(PERMISSION_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  const handleGrantAll = async () => {
    setRequesting(true);
    const updated = { ...statusMap };

    // 1. Notifications
    try {
      const res = await Notifications.requestPermissionsAsync();
      updated.notifications = res.granted;
    } catch {
      // ignore
    }

    // 2. Location
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      updated.location = res.granted;
    } catch {
      // ignore
    }

    // 3. Camera
    try {
      const res = await ExpoCamera.requestCameraPermissionsAsync();
      updated.camera = res.granted;
    } catch {
      // ignore
    }

    // 4. Microphone
    try {
      const res = await ExpoCamera.requestMicrophonePermissionsAsync();
      updated.microphone = res.granted;
    } catch {
      // ignore
    }

    // 5. Photos
    try {
      const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      updated.photos = res.granted;
    } catch {
      // ignore
    }

    setStatusMap(updated);
    setRequesting(false);
    await handleDismiss();
  };

  const handleGrantSingle = async (id: PermissionItem['id']) => {
    const updated = { ...statusMap };
    try {
      if (id === 'notifications') {
        const res = await Notifications.requestPermissionsAsync();
        updated.notifications = res.granted;
      } else if (id === 'location') {
        const res = await Location.requestForegroundPermissionsAsync();
        updated.location = res.granted;
      } else if (id === 'camera') {
        const res = await ExpoCamera.requestCameraPermissionsAsync();
        updated.camera = res.granted;
      } else if (id === 'microphone') {
        const res = await ExpoCamera.requestMicrophonePermissionsAsync();
        updated.microphone = res.granted;
      } else if (id === 'photos') {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        updated.photos = res.granted;
      }
    } catch {
      // ignore
    }
    setStatusMap(updated);
  };

  const { t, fs } = useTranslation();
  const tc = useThemeColors();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: tc.surface,
            borderRadius: 14,
            width: '100%',
            maxWidth: 440,
            maxHeight: '90%',
            padding: 22,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                backgroundColor: '#DCFCE7',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <ShieldCheck size={32} color="#16A34A" />
            </View>
            <Text
              style={{
                fontSize: fs(19),
                fontWeight: '800',
                color: tc.text,
                textAlign: 'center',
              }}
            >
              {t('perm_modal_title')}
            </Text>
            <Text
              style={{
                fontSize: fs(13),
                color: tc.textSecondary,
                textAlign: 'center',
                marginTop: 4,
                lineHeight: Math.round(fs(18)),
              }}
            >
              {t('perm_modal_subtitle')}
            </Text>
          </View>

          {/* Permission List */}
          <ScrollView
            style={{ maxHeight: 340 }}
            contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {INITIAL_PERMISSIONS.map(item => {
              const Icon = item.icon;
              const isGranted = !!statusMap[item.id];
              return (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: isGranted ? '#F0FDF4' : '#F9FAFB',
                    borderWidth: 1,
                    borderColor: isGranted ? '#BBF7D0' : '#E5E7EB',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      backgroundColor: isGranted ? '#DCFCE7' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} color={isGranted ? '#16A34A' : '#6B7280'} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: fs(14),
                        fontWeight: '700',
                        color: tc.text,
                      }}
                    >
                      {t(item.titleKey)}
                    </Text>
                    <Text
                      style={{
                        fontSize: fs(12),
                        color: tc.textMuted,
                        marginTop: 2,
                        lineHeight: Math.round(fs(16)),
                      }}
                    >
                      {t(item.descKey)}
                    </Text>
                  </View>

                  {isGranted ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={18} color="#16A34A" />
                      <Text style={{ fontSize: fs(12), fontWeight: '700', color: '#16A34A' }}>
                        {t('perm_granted')}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleGrantSingle(item.id)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: '#16A34A',
                      }}
                    >
                      <Text style={{ fontSize: fs(11.5), fontWeight: '700', color: '#fff' }}>
                        {t('perm_grant_btn')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ marginTop: 18, gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={requesting}
              onPress={handleGrantAll}
              style={{
                backgroundColor: '#16A34A',
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#16A34A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              {requesting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontSize: fs(15), fontWeight: '800' }}>
                  {t('perm_grant_all')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDismiss}
              style={{
                paddingVertical: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: tc.textMuted, fontSize: fs(13.5), fontWeight: '600' }}>
                {t('perm_skip')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Section quản lý quyền ứng dụng hiển thị trong màn hình Hồ sơ (Customer & Helper)
 */
export function AppPermissionsSection() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { t, fs } = useTranslation();
  const tc = useThemeColors();

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    const results = await checkAllPermissions();
    setStatuses(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const handleOpenSettings = () => {
    void Linking.openSettings();
  };

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: fs(12),
          fontWeight: '700',
          color: tc.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {t('profile_permissions')}
      </Text>

      <Card style={{ padding: 14, gap: 12 }}>
        {INITIAL_PERMISSIONS.map(item => {
          const Icon = item.icon;
          const isGranted = !!statuses[item.id];
          return (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Icon size={17} color={isGranted ? '#16A34A' : COLORS.gray[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fs(13.5), fontWeight: '600', color: tc.text }}>
                    {t(item.titleKey)}
                  </Text>
                  <Text style={{ fontSize: fs(11), color: tc.textMuted }}>
                    {t(item.descKey)}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                {loading ? (
                  <ActivityIndicator size="small" color="#16A34A" />
                ) : isGranted ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#DCFCE7',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                    }}
                  >
                    <CheckCircle2 size={13} color="#16A34A" />
                    <Text style={{ fontSize: fs(11), fontWeight: '700', color: '#16A34A' }}>
                      {t('profile_status_granted')}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#F3F4F6',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                    }}
                  >
                    <AlertCircle size={13} color="#9CA3AF" />
                    <Text style={{ fontSize: fs(11), fontWeight: '600', color: '#6B7280' }}>
                      {t('profile_status_denied')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOpenSettings}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            marginTop: 4,
            borderRadius: 8,
            backgroundColor: '#F0FDF4',
            borderWidth: 1,
            borderColor: '#BBF7D0',
          }}
        >
          <ExternalLink size={15} color="#16A34A" />
          <Text style={{ fontSize: fs(13), fontWeight: '700', color: '#16A34A' }}>
            {t('perm_open_settings_desc')}
          </Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}
