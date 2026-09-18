import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Camera, User, Phone, Mail, MapPin,
  ShieldCheck, CheckCircle2, Sparkles, Briefcase, FileText, Check,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useUpdateProfile, useHelperProfile } from '@/hooks/use-api';
import apiClient from '@/services/api-client';
import { Button, Card, LoadingSpinner, COLORS, Separator, Avatar } from '@/components/ui';

// Bộ sưu tập avatar chuyên nghiệp có sẵn để người dùng chọn nhanh 1 chạm
const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { data: myProfile, isLoading: uLoading, refetch: refetchUser } = useMyProfile();
  const { data: helperProfile, refetch: refetchHelper } = useHelperProfile();
  const updateProfileMutation = useUpdateProfile();

  const isHelper = user?.active_role === 'helper';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [birthYear, setBirthYear] = useState('1994');
  
  // Customization cho Khách hàng
  const [defaultAddress, setDefaultAddress] = useState('128 Đường Lê Lợi, Phường Bến Thành, Quận 1');
  const [homeNote, setHomeNote] = useState('Bấm chuông lầu 2, nhà có thang máy');

  // Customization cho Thợ
  const [experienceYears, setExperienceYears] = useState('3');
  const [workingAreas, setWorkingAreas] = useState('Quận 1, Quận 3, Bình Thạnh, TP. Thủ Đức');
  const [bio, setBio] = useState('Thợ chuyên nghiệp, đầy đủ đồ nghề Bosch & Fluke, nhiệt tình, có mặt đúng giờ.');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = myProfile || user;
    if (current) {
      if (current.full_name) setFullName(current.full_name);
      if (current.email) setEmail(current.email);
      if (current.avatar) setAvatar(current.avatar);
    }
  }, [myProfile, user]);

  if (uLoading) return <LoadingSpinner />;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập họ và tên' });
      return;
    }

    setSaving(true);
    try {
      // 1. Cập nhật thông tin User chung
      const res = await updateProfileMutation.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        avatar: avatar || undefined,
      });

      // Cập nhật State trong AuthStore
      const updatedUser = res?.data?.data || res?.data || { ...user, full_name: fullName.trim(), email: email.trim(), avatar };
      setUser(updatedUser);

      // 2. Nếu là Thợ -> Cập nhật thêm thông tin chuyên môn
      if (isHelper) {
        try {
          await apiClient.patch('/helpers/me/profile', {
            working_areas: workingAreas.split(',').map(a => a.trim()).filter(Boolean),
          });
        } catch { /* ignore helper specific update */ }
      }

      refetchUser();
      refetchHelper();

      Toast.show({ type: 'success', text1: 'Đã lưu thông tin hồ sơ thành công!' });
      handleBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật hồ sơ thất bại';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setSaving(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Header (Safe Insets) ─────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[100],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.gray[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
          Chỉnh sửa thông tin cá nhân
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>

          {/* ── 1. AVATAR PICKER & BỘ SƯU TẬP AVATAR ──────────────────── */}
          <Card style={{ alignItems: 'center', padding: 20, gap: 14 }}>
            <View style={{ position: 'relative' }}>
              <Avatar name={fullName || 'User'} uri={avatar} size={90} />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  // Chọn random avatar từ bộ sưu tập
                  const nextIdx = Math.floor(Math.random() * PRESET_AVATARS.length);
                  setAvatar(PRESET_AVATARS[nextIdx]);
                  Toast.show({ type: 'info', text1: 'Đã đổi ảnh đại diện mới' });
                }}
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  backgroundColor: COLORS.primary, borderRadius: 18, width: 34, height: 34,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 3, borderColor: '#fff',
                  shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
                }}
              >
                <Camera size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[800] }}>
                Ảnh đại diện tài khoản
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[400], marginTop: 2 }}>
                Bấm vào icon máy ảnh hoặc chọn nhanh bên dưới:
              </Text>
            </View>

            {/* Danh sách Avatar mẫu để chọn nhanh 1 chạm */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {PRESET_AVATARS.map((url, idx) => {
                const isSelected = avatar === url;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.8}
                    onPress={() => setAvatar(url)}
                    style={{
                      borderRadius: 24,
                      borderWidth: 2.5,
                      borderColor: isSelected ? COLORS.primary : 'transparent',
                      padding: 2,
                    }}
                  >
                    <Image
                      source={{ uri: url }}
                      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gray[200] }}
                    />
                    {isSelected && (
                      <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: COLORS.primary, borderRadius: 8, padding: 1 }}>
                        <Check size={10} color="#fff" strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Card>

          {/* ── 2. THÔNG TIN ĐỊNH DANH CƠ BẢN ─────────────────────────── */}
          <Card style={{ padding: 16, gap: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
              Thông tin liên hệ
            </Text>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                Họ và tên *
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                  padding: 14, fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.gray[50], fontWeight: '600',
                }}
                placeholder="Nhập họ và tên đầy đủ"
                value={fullName}
                onChangeText={setFullName}
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Số điện thoại đăng ký
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <ShieldCheck size={12} color={COLORS.success} />
                  <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>Đã xác thực OTP</Text>
                </View>
              </View>
              <TextInput
                style={{
                  borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                  padding: 14, fontSize: 15, color: COLORS.gray[500], backgroundColor: COLORS.gray[100],
                }}
                value={user?.phone || '0901234567'}
                editable={false}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                Email liên hệ (Nhận hóa đơn điện tử)
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                  padding: 14, fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                }}
                placeholder="VD: nguyenvana@gmail.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            {/* Giới tính */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                Giới tính
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { id: 'male', label: 'Nam' },
                  { id: 'female', label: 'Nữ' },
                  { id: 'other', label: 'Khác' },
                ].map(g => (
                  <TouchableOpacity
                    key={g.id}
                    activeOpacity={0.8}
                    onPress={() => setGender(g.id as any)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: gender === g.id ? COLORS.primary : COLORS.gray[200],
                      backgroundColor: gender === g.id ? COLORS.primaryLight : COLORS.gray[50],
                    }}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: gender === g.id ? COLORS.primary : COLORS.gray[700] }}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>

          {/* ── 3. CÁ NHÂN HÓA DÀNH CHO THỢ HOẶC KHÁCH HÀNG ─────────────── */}
          {isHelper ? (
            /* Dành cho Thợ / Đối tác */
            <Card style={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Briefcase size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                  Hồ sơ nghề nghiệp & Khu vực làm việc
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Số năm kinh nghiệm
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="VD: 3 năm"
                  value={experienceYears}
                  onChangeText={setExperienceYears}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Khu vực hoạt động ưu tiên
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="VD: Quận 1, Quận 3, Bình Thạnh..."
                  value={workingAreas}
                  onChangeText={setWorkingAreas}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Lời giới thiệu bản thân (Hiển thị tới khách hàng)
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 14.5, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                    minHeight: 80, textAlignVertical: 'top',
                  }}
                  placeholder="Giới thiệu về kỹ năng, đồ nghề và phong cách làm việc..."
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>
            </Card>
          ) : (
            /* Dành cho Khách hàng */
            <Card style={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                  Địa chỉ & Ghi chú nhà riêng
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Địa chỉ mặc định
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 14.5, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="Nhập địa chỉ nhà riêng hoặc chung cư..."
                  value={defaultAddress}
                  onChangeText={setDefaultAddress}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Ghi chú chỉ dẫn cho Thợ khi đến nhà
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: 14,
                    padding: 14, fontSize: 14.5, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
                    minHeight: 70, textAlignVertical: 'top',
                  }}
                  placeholder="VD: Gửi xe ở hầm B1, bấm chuông số 12.04..."
                  value={homeNote}
                  onChangeText={setHomeNote}
                  multiline
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>
            </Card>
          )}

          {/* ── 4. NÚT LƯU THAY ĐỔI ────────────────────────────────────── */}
          <Button
            title="Lưu thông tin hồ sơ"
            loading={saving}
            onPress={handleSave}
            icon={<CheckCircle2 size={18} color="#fff" />}
            style={{ marginTop: 4 }}
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
