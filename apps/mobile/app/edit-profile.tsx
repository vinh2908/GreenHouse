import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LocationPicker, LocationPreview, PickerCoords } from '@/components/common/location-picker';
import type { LocationResult } from '@/services/location.service';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Camera,
  User,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Briefcase,
  FileText,
  Check,
  Navigation,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useMyProfile, useUpdateProfile, useHelperProfile, useUpdateHelperLocation, useAddresses } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { uploadFile } from '@/services/upload.service';
import { locationService } from '@/services/location.service';
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
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const { data: myProfile, isLoading: uLoading } = useMyProfile();
  const { data: helperProfile } = useHelperProfile();
  const updateProfileMutation = useUpdateProfile();

  const isHelper = user?.active_role === 'helper';
  const updateLocation = useUpdateHelperLocation();
  const { data: customerAddresses } = useAddresses();
  const [pickerFor, setPickerFor] = useState<'helper' | 'customer' | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [birthYear, setBirthYear] = useState('1994');

  // Customization cho Khách hàng
  const [defaultAddress, setDefaultAddress] = useState('');
  const [homeNote, setHomeNote] = useState('');
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [customerLocationText, setCustomerLocationText] = useState('');
  const [customerGpsLoading, setCustomerGpsLoading] = useState(false);
  const [customerAddressIndex, setCustomerAddressIndex] = useState<number | null>(null);
  const [customerGeoData, setCustomerGeoData] = useState<{ district: string; city: string; ward?: string; street?: string } | null>(null);

  // Customization cho Thợ
  const [experienceYears, setExperienceYears] = useState('');
  const [workingAreas, setWorkingAreas] = useState('');
  const [bio, setBio] = useState('');
  const [helperCoords, setHelperCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Set only when the helper changes the pin: 'manual' = tapped the map, 'gps' = used the GPS button.
  const [coordsSource, setCoordsSource] = useState<'manual' | 'gps' | null>(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = myProfile || user;
    if (current) {
      if (current.full_name) setFullName(current.full_name);
      if (current.email) setEmail(current.email);
      if (current.avatar) setAvatar(current.avatar);
      if (current.gender) setGender(current.gender);
    }
  }, [myProfile, user]);

  useEffect(() => {
    if (customerAddresses?.length) {
      const defaultIdx = customerAddresses.findIndex((a: any) => a.is_default);
      const idx = defaultIdx >= 0 ? defaultIdx : 0;
      const addr = customerAddresses[idx];
      setCustomerAddressIndex(idx);
      setDefaultAddress(addr.full_address ?? '');
      setHomeNote(addr.notes ?? '');
      if (addr.location?.coordinates) {
        const [lng, lat] = addr.location.coordinates;
        setCustomerCoords({ latitude: lat, longitude: lng });
        setCustomerLocationText(addr.full_address ?? '');
      }
      setCustomerGeoData({
        district: addr.district ?? '',
        city: addr.city ?? '',
        ward: addr.ward,
        street: addr.street,
      });
    }
  }, [customerAddresses]);

  useEffect(() => {
    if (helperProfile) {
      setBio(helperProfile.bio ?? '');
      setExperienceYears(helperProfile.years_experience != null ? String(helperProfile.years_experience) : '');
      setWorkingAreas(helperProfile.working_areas?.join(', ') ?? '');
      if (helperProfile.location?.coordinates) {
        const [lng, lat] = helperProfile.location.coordinates;
        setHelperCoords({ latitude: lat, longitude: lng });
        locationService.reverseGeocode(lat, lng).then(geo => {
          if (geo) setLocationAddress(geo.full_address);
        });
      }
    }
  }, [helperProfile]);

  const insets = useSafeAreaInsets();

  if (uLoading) return <LoadingSpinner />;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isHelper ? '/(helper)/profile' : '/(customer)/profile');
    }
  };

  // Square crop, small file: avatars are shown at <= 90px.
  const pickAvatar = async (source: 'camera' | 'library') => {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Toast.show({
          type: 'error',
          text1:
            source === 'camera'
              ? 'Cần cấp quyền camera để chụp ảnh'
              : 'Cần cấp quyền truy cập thư viện ảnh',
        });
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]?.uri) {
        // Preview the local file now; it is uploaded when the profile is saved.
        setAvatar(result.assets[0].uri);
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: source === 'camera' ? 'Không thể mở máy ảnh' : 'Không thể mở thư viện ảnh',
      });
    }
  };

  const openAvatarMenu = () =>
    Alert.alert('Ảnh đại diện', 'Chọn nguồn ảnh', [
      { text: 'Chụp ảnh', onPress: () => pickAvatar('camera') },
      { text: 'Chọn từ thư viện', onPress: () => pickAvatar('library') },
      { text: 'Hủy', style: 'cancel' },
    ]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập họ và tên' });
      return;
    }

    setSaving(true);
    try {
      // 1. Upload ảnh mới (nếu là ảnh trên máy) rồi cập nhật thông tin User chung
      let avatarUrl = avatar;
      if (avatar) {
        try {
          avatarUrl = await uploadFile(avatar);
        } catch {
          Toast.show({
            type: 'error',
            text1: 'Tải ảnh đại diện thất bại',
            text2: 'Vui lòng thử lại',
          });
          return;
        }
      }
      const res = await updateProfileMutation.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        avatar: avatarUrl || undefined,
        gender,
      });

      // Cập nhật State trong AuthStore
      const updatedUser = res?.data?.data ||
        res?.data || {
          ...user,
          full_name: fullName.trim(),
          email: email.trim(),
          avatar: avatarUrl,
          gender,
        };
      setUser(updatedUser);

      // 2. Nếu là Thợ -> Cập nhật thêm thông tin chuyên môn + vị trí GPS
      if (isHelper) {
        await apiClient.patch('/helpers/me/profile', {
          bio: bio.trim() || undefined,
          years_experience: parseInt(experienceYears, 10) || 0,
          working_areas: workingAreas
            .split(',')
            .map(a => a.trim())
            .filter(Boolean),
        });

        if (helperCoords && coordsSource) {
          await updateLocation.mutateAsync({
            coordinates: [helperCoords.longitude, helperCoords.latitude],
            source: coordsSource,
          });
        }
      }

      // 3. Nếu là Khách hàng -> Lưu địa chỉ mặc định với GPS
      if (!isHelper && customerCoords && defaultAddress.trim()) {
        await persistCustomerAddress(customerCoords, defaultAddress, customerGeoData);
      }

      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['helper', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['helper', 'public'] });
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      queryClient.invalidateQueries({ queryKey: ['customer', 'profile'] });

      Toast.show({ type: 'success', text1: 'Đã lưu thông tin hồ sơ thành công!' });
      handleBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cập nhật hồ sơ thất bại';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setSaving(false);
    }
  };

  type Coords = { latitude: number; longitude: number };
  type GeoData = { district: string; city: string; ward?: string; street?: string } | null;

  // Vị trí chọn trong bản đồ toàn màn hình được lưu ngay.
  const handlePickerConfirm = (coords: PickerCoords, geo: LocationResult | null) => {
    const target = pickerFor;
    setPickerFor(null);
    if (target === 'helper') {
      setHelperCoords(coords);
      setCoordsSource('manual');
      saveHelperLocationNow(coords, 'manual');
      if (geo) {
        setLocationAddress(geo.full_address);
        const area = [geo.district, geo.city].filter(Boolean).join(', ');
        if (area) setWorkingAreas(area);
      }
    } else if (target === 'customer') {
      setCustomerCoords(coords);
      if (geo) {
        const geoData = {
          district: geo.district ?? '',
          city: geo.city ?? '',
          ward: geo.ward,
          street: geo.road,
        };
        setDefaultAddress(geo.full_address);
        setCustomerLocationText(geo.full_address);
        setCustomerGeoData(geoData);
        saveCustomerAddressNow(coords, geo.full_address, geoData);
      }
    }
  };

  // Lưu ngay vị trí thợ khi ghim bản đồ / bấm GPS, không chờ nút Lưu.
  const saveHelperLocationNow = async (coords: Coords, source: 'manual' | 'gps') => {
    try {
      await updateLocation.mutateAsync({
        coordinates: [coords.longitude, coords.latitude],
        source,
      });
      setCoordsSource(null);
      Toast.show({ type: 'success', text1: 'Đã lưu vị trí hoạt động' });
    } catch {
      // Giữ coordsSource để nút Lưu gửi lại.
      Toast.show({ type: 'error', text1: 'Chưa lưu được vị trí', text2: 'Bấm Lưu để thử lại' });
    }
  };

  const persistCustomerAddress = async (coords: Coords, fullAddress: string, geo: GeoData) => {
    const addressDto = {
      label: 'Nhà',
      full_address: fullAddress.trim(),
      street: geo?.street || undefined,
      ward: geo?.ward || undefined,
      district: geo?.district || 'Quận 1',
      city: geo?.city || 'Hồ Chí Minh',
      location: {
        type: 'Point',
        coordinates: [coords.longitude, coords.latitude] as [number, number],
      },
      notes: homeNote.trim() || undefined,
      is_default: true,
    };

    if (customerAddressIndex != null) {
      await apiClient.put(`/customers/me/addresses/${customerAddressIndex}`, addressDto);
    } else {
      await apiClient.post('/customers/me/addresses', addressDto);
    }
    // Chờ tải lại để lần lưu sau cập nhật đúng địa chỉ vừa tạo thay vì tạo trùng.
    await queryClient.invalidateQueries({ queryKey: ['addresses'] });
  };

  // Lưu ngay địa chỉ khách khi ghim bản đồ / bấm GPS, không chờ nút Lưu.
  const saveCustomerAddressNow = async (coords: Coords, fullAddress: string, geo: GeoData) => {
    if (!fullAddress.trim()) return;
    try {
      await persistCustomerAddress(coords, fullAddress, geo);
      Toast.show({ type: 'success', text1: 'Đã lưu địa chỉ hiện tại' });
    } catch {
      Toast.show({ type: 'error', text1: 'Chưa lưu được địa chỉ', text2: 'Bấm Lưu để thử lại' });
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <LocationPicker
        visible={pickerFor !== null}
        title={pickerFor === 'customer' ? 'Chọn địa chỉ nhà' : 'Chọn vị trí hoạt động'}
        initial={pickerFor === 'customer' ? customerCoords : helperCoords}
        onClose={() => setPickerFor(null)}
        onConfirm={handlePickerConfirm}
      />
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}
        >
          {/* ── 1. AVATAR PICKER & BỘ SƯU TẬP AVATAR ──────────────────── */}
          <Card style={{ alignItems: 'center', padding: 20, gap: 14 }}>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity activeOpacity={0.85} onPress={openAvatarMenu}>
                <Avatar name={fullName || 'User'} uri={avatar} size={90} />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={openAvatarMenu}
                accessibilityLabel="Đổi ảnh đại diện"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  backgroundColor: COLORS.primary,
                  borderRadius: 18,
                  width: 34,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: '#fff',
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                  elevation: 4,
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
                Chụp ảnh, chọn từ thư viện hoặc chọn nhanh bên dưới:
              </Text>
            </View>

            {/* Danh sách Avatar mẫu để chọn nhanh 1 chạm */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            >
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
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: COLORS.gray[200],
                      }}
                    />
                    {isSelected && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          backgroundColor: COLORS.primary,
                          borderRadius: 8,
                          padding: 1,
                        }}
                      >
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
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  color: COLORS.gray[900],
                  backgroundColor: COLORS.gray[50],
                  fontWeight: '600',
                }}
                placeholder="Nhập họ và tên đầy đủ"
                value={fullName}
                onChangeText={setFullName}
                placeholderTextColor={COLORS.gray[400]}
              />
            </View>

            <View style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Số điện thoại đăng ký
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#ECFDF5',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <ShieldCheck size={12} color={COLORS.success} />
                  <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>
                    Đã xác thực OTP
                  </Text>
                </View>
              </View>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  color: COLORS.gray[500],
                  backgroundColor: COLORS.gray[100],
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
                  borderWidth: 1.5,
                  borderColor: COLORS.gray[200],
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  color: COLORS.gray[900],
                  backgroundColor: COLORS.gray[50],
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
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: gender === g.id ? COLORS.primary : COLORS.gray[200],
                      backgroundColor: gender === g.id ? COLORS.primaryLight : COLORS.gray[50],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: '700',
                        color: gender === g.id ? COLORS.primary : COLORS.gray[700],
                      }}
                    >
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
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
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
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 15,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="VD: Quận 1, Quận 3, Bình Thạnh..."
                  value={workingAreas}
                  onChangeText={setWorkingAreas}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </View>

              {/* ── Vị trí GPS trên bản đồ ──────────────────────────── */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Vị trí hoạt động của bạn
                </Text>

                <View
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    height: 200,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setPickerFor('helper')}
                    style={{ flex: 1 }}
                  >
                    <LocationPreview coords={helperCoords} />
                    <View
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: 'rgba(17,24,39,0.85)',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <MapPin size={13} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                        Mở bản đồ chọn địa chỉ
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {locationAddress ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} color={COLORS.primary} />
                    <Text
                      style={{ fontSize: 12, color: COLORS.gray[600], flex: 1 }}
                      numberOfLines={2}
                    >
                      {locationAddress}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={gpsLoading}
                  onPress={async () => {
                    setGpsLoading(true);
                    try {
                      const coords = await locationService.getCurrentCoordinates();
                      if (coords) {
                        setHelperCoords(coords);
                        setCoordsSource('gps');
                        const geo = await locationService.reverseGeocode(coords.latitude, coords.longitude);
                        if (geo) {
                          setLocationAddress(geo.full_address);
                          const area = [geo.district, geo.city].filter(Boolean).join(', ');
                          if (area) setWorkingAreas(area);
                        }
                        await saveHelperLocationNow(coords, 'gps');
                      } else {
                        Toast.show({
                          type: 'error',
                          text1: 'Không lấy được vị trí',
                          text2: 'Vui lòng bật GPS/Dịch vụ vị trí trên điện thoại',
                        });
                      }
                    } finally {
                      setGpsLoading(false);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: COLORS.primaryLight,
                    borderWidth: 1.5,
                    borderColor: COLORS.primary,
                  }}
                >
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Navigation size={16} color={COLORS.primary} />
                  )}
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                    {gpsLoading ? 'Đang lấy vị trí...' : 'Lấy vị trí GPS hiện tại'}
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 11, color: COLORS.gray[400], lineHeight: 16 }}>
                  Mở bản đồ để tìm và ghim vị trí hoạt động cố định — khoảng cách tới khách được tính từ điểm này. Nếu dùng GPS, vị trí sẽ tự cập nhật theo điện thoại.
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Lời giới thiệu bản thân (Hiển thị tới khách hàng)
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 14.5,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                    minHeight: 80,
                    textAlignVertical: 'top',
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

              {/* ── Bản đồ GPS chọn vị trí nhà ──────────────────────── */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Vị trí nhà của bạn trên bản đồ
                </Text>

                <View
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    height: 200,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setPickerFor('customer')}
                    style={{ flex: 1 }}
                  >
                    <LocationPreview coords={customerCoords} />
                    <View
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: 'rgba(17,24,39,0.85)',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <MapPin size={13} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                        Mở bản đồ chọn địa chỉ
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {customerLocationText ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} color={COLORS.primary} />
                    <Text
                      style={{ fontSize: 12, color: COLORS.gray[600], flex: 1 }}
                      numberOfLines={2}
                    >
                      {customerLocationText}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={customerGpsLoading}
                  onPress={async () => {
                    setCustomerGpsLoading(true);
                    try {
                      const coords = await locationService.getCurrentCoordinates();
                      if (coords) {
                        setCustomerCoords(coords);
                        const geo = await locationService.reverseGeocode(coords.latitude, coords.longitude);
                        if (geo) {
                          const geoData = {
                            district: geo.district ?? '',
                            city: geo.city ?? '',
                            ward: geo.ward,
                            street: geo.road,
                          };
                          setDefaultAddress(geo.full_address);
                          setCustomerLocationText(geo.full_address);
                          setCustomerGeoData(geoData);
                          await saveCustomerAddressNow(coords, geo.full_address, geoData);
                        }
                      } else {
                        Toast.show({
                          type: 'error',
                          text1: 'Không lấy được vị trí',
                          text2: 'Vui lòng bật GPS/Dịch vụ vị trí trên điện thoại',
                        });
                      }
                    } finally {
                      setCustomerGpsLoading(false);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: COLORS.primaryLight,
                    borderWidth: 1.5,
                    borderColor: COLORS.primary,
                  }}
                >
                  {customerGpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Navigation size={16} color={COLORS.primary} />
                  )}
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                    {customerGpsLoading ? 'Đang lấy vị trí...' : 'Lấy vị trí GPS hiện tại'}
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 11, color: COLORS.gray[400], lineHeight: 16 }}>
                  Mở bản đồ để tìm và ghim địa chỉ nhà, hoặc bấm nút GPS. Địa chỉ sẽ được tự động điền và lưu ngay.
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                  Địa chỉ chi tiết
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 14.5,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
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
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 14.5,
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                    minHeight: 70,
                    textAlignVertical: 'top',
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
