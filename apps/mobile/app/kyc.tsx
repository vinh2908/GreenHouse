import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  Check,
  ChevronRight,
  X,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useHelperProfile, useSubmitKyc } from '@/hooks/use-api';
import { Button, Card, LoadingSpinner, COLORS, Separator, Input } from '@/components/ui';

// Ảnh mẫu demo e-KYC (phục vụ test nhanh)
const SAMPLE_FRONT = 'https://images.unsplash.com/photo-1544717305-2782549b5136';
const SAMPLE_BACK = 'https://images.unsplash.com/photo-1544717305-2782549b5136';
const SAMPLE_SELFIE = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d';

export default function KycScreen() {
  const router = useRouter();
  const { data: profile, isLoading, refetch } = useHelperProfile();
  const submitKyc = useSubmitKyc();

  const { user } = useAuthStore();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/profile' : '/(customer)/profile');
  };

  const [idCardNumber, setIdCardNumber] = useState('');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);

  // Modal chọn nguồn ảnh (Camera / Thư viện / Ảnh mẫu)
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [activeImageType, setActiveImageType] = useState<'front' | 'back' | 'selfie'>('front');

  if (isLoading) return <LoadingSpinner />;

  const kycStatus = profile?.verification_status || 'unsubmitted';

  const openPickerModal = (type: 'front' | 'back' | 'selfie') => {
    setActiveImageType(type);
    setPickerModalVisible(true);
  };

  const applyImage = (type: 'front' | 'back' | 'selfie', uri: string) => {
    if (type === 'front') setFrontImage(uri);
    else if (type === 'back') setBackImage(uri);
    else setSelfieImage(uri);
  };

  const handleTakePhoto = async () => {
    setPickerModalVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần cấp quyền camera để chụp ảnh e-KYC' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Ảnh gốc, không cắt/nén: bước cắt của hệ thống làm giảm độ phân giải, admin không đọc được chữ trên CCCD.
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        applyImage(activeImageType, result.assets[0].uri);
        Toast.show({ type: 'success', text1: 'Đã chụp ảnh thành công' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở máy ảnh' });
    }
  };

  const handlePickFromLibrary = async () => {
    setPickerModalVisible(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Cần cấp quyền thư viện để chọn ảnh' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Ảnh gốc, không cắt/nén: bước cắt của hệ thống làm giảm độ phân giải, admin không đọc được chữ trên CCCD.
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        applyImage(activeImageType, result.assets[0].uri);
        Toast.show({ type: 'success', text1: 'Đã chọn ảnh từ thư viện' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể mở thư viện ảnh' });
    }
  };

  const handleUseSamplePhoto = () => {
    setPickerModalVisible(false);
    if (activeImageType === 'front') {
      setFrontImage(SAMPLE_FRONT);
      Toast.show({ type: 'info', text1: 'Đã dùng ảnh mẫu: Mặt trước CCCD' });
    } else if (activeImageType === 'back') {
      setBackImage(SAMPLE_BACK);
      Toast.show({ type: 'info', text1: 'Đã dùng ảnh mẫu: Mặt sau CCCD' });
    } else {
      setSelfieImage(SAMPLE_SELFIE);
      Toast.show({ type: 'info', text1: 'Đã dùng ảnh mẫu: Chân dung selfie' });
    }
  };

  const handleSubmit = async () => {
    if (!idCardNumber.trim() || idCardNumber.length < 9) {
      Toast.show({ type: 'error', text1: 'Vui lòng nhập đúng số CCCD/CMND (9-12 số)' });
      return;
    }
    if (!frontImage || !backImage || !selfieImage) {
      Toast.show({
        type: 'error',
        text1: 'Vui lòng cung cấp đủ 3 ảnh (Mặt trước, mặt sau và chân dung)',
      });
      return;
    }

    try {
      await submitKyc.mutateAsync({
        id_card_number: idCardNumber.trim(),
        id_card_front: frontImage,
        id_card_back: backImage,
        selfie_photo: selfieImage,
      });
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Nộp hồ sơ e-KYC thất bại';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const insets = useSafeAreaInsets();

  const getTargetTitle = () => {
    if (activeImageType === 'front') return 'Mặt trước CCCD/CMND';
    if (activeImageType === 'back') return 'Mặt sau CCCD/CMND';
    return 'Ảnh chân dung selfie cầm CCCD';
  };

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
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
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
          Xác thực danh tính (e-KYC)
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        >
          {/* ── TRƯỜNG HỢP 1: ĐÃ DUYỆT (APPROVED) ────────────────────────── */}
          {kycStatus === 'approved' && (
            <Card
              style={{
                alignItems: 'center',
                padding: 24,
                gap: 14,
                backgroundColor: '#ECFDF5',
                borderColor: '#A7F3D0',
                borderWidth: 1.5,
              }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: '#10B981',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={38} color="#fff" />
              </View>
              <Text
                style={{ fontSize: 20, fontWeight: '900', color: '#065F46', textAlign: 'center' }}
              >
                Hồ sơ đã được xác thực e-KYC 100%
              </Text>
              <Text
                style={{ fontSize: 13.5, color: '#047857', textAlign: 'center', lineHeight: 20 }}
              >
                Danh tính và hồ sơ tư pháp của bạn đã được kiểm duyệt hợp lệ. Bạn đang có quyền ưu
                tiên nhận việc và hiển thị huy hiệu thợ uy tín tới khách hàng.
              </Text>
              <View
                style={{
                  backgroundColor: '#fff',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 12,
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[800] }}>
                  Số CCCD: {profile?.id_card_number || '—'}
                </Text>
              </View>
            </Card>
          )}

          {/* ── TRƯỜNG HỢP 2: ĐANG CHỜ DUYỆT (PENDING) ─────────────────── */}
          {kycStatus === 'pending' && (
            <Card
              style={{
                alignItems: 'center',
                padding: 24,
                gap: 14,
                backgroundColor: '#FFFBEB',
                borderColor: '#FDE68A',
                borderWidth: 1.5,
              }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: '#F59E0B',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={36} color="#fff" />
              </View>
              <Text
                style={{ fontSize: 20, fontWeight: '900', color: '#92400E', textAlign: 'center' }}
              >
                Hồ sơ đang được xét duyệt
              </Text>
              <Text
                style={{ fontSize: 13.5, color: '#B45309', textAlign: 'center', lineHeight: 20 }}
              >
                Hồ sơ e-KYC của bạn đã được gửi thành công và đang được ban quản trị Green House đối
                chiếu trong vòng 24 giờ làm việc.
              </Text>
              <View
                style={{
                  backgroundColor: '#fff',
                  padding: 12,
                  borderRadius: 12,
                  width: '100%',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>
                  • Số CCCD nộp:{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.gray[900] }}>
                    {profile?.id_card_number || idCardNumber || '—'}
                  </Text>
                </Text>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>
                  • Trạng thái:{' '}
                  <Text style={{ fontWeight: '700', color: '#D97706' }}>
                    Đang kiểm tra dữ liệu hình ảnh
                  </Text>
                </Text>
              </View>
            </Card>
          )}

          {/* ── TRƯỜNG HỢP 3: BỊ TỪ CHỐI (REJECTED) ────────────────────── */}
          {kycStatus === 'rejected' && (
            <Card
              style={{
                padding: 18,
                gap: 12,
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                borderWidth: 1.5,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={24} color={COLORS.error} />
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#991B1B' }}>
                  Hồ sơ bị từ chối xét duyệt
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, color: '#B91C1C', lineHeight: 20 }}>
                Lý do:{' '}
                {profile?.rejection_reason ||
                  'Ảnh chụp CCCD bị mờ, lóa sáng hoặc mất góc. Vui lòng chụp lại rõ nét.'}
              </Text>
              <Text style={{ fontSize: 12.5, color: COLORS.gray[600], fontWeight: '600' }}>
                Vui lòng cập nhật lại thông tin và chụp lại ảnh bên dưới:
              </Text>
            </Card>
          )}

          {/* ── FORM NỘP HỒ SƠ (CHO UNSUBMITTED & REJECTED) ────────────── */}
          {(kycStatus === 'unsubmitted' || kycStatus === 'rejected') && (
            <>
              {/* Card hướng dẫn */}
              <Card style={{ backgroundColor: '#1E1E24', padding: 18, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={20} color={COLORS.primary} />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    Quy chuẩn chụp ảnh e-KYC
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5, lineHeight: 18 }}>
                  1. Chụp rõ 4 góc của thẻ CCCD/CMND gốc, không lóa sáng.{'\n'}
                  2. Ảnh chân dung chụp rõ mặt, không đeo kính râm hoặc khẩu trang.
                </Text>
              </Card>

              {/* 1. Nhập số CCCD */}
              <Card style={{ padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                  1. Số Căn cước công dân (CCCD) *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: COLORS.gray[200],
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 17,
                    fontWeight: '700',
                    color: COLORS.gray[900],
                    backgroundColor: COLORS.gray[50],
                  }}
                  placeholder="Nhập 12 số CCCD (VD: 079090123456)"
                  value={idCardNumber}
                  onChangeText={setIdCardNumber}
                  keyboardType="numeric"
                  maxLength={12}
                  placeholderTextColor={COLORS.gray[400]}
                />
              </Card>

              {/* 2. Ảnh mặt trước CCCD */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                    2. Mặt trước CCCD/CMND *
                  </Text>
                  {frontImage && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Check size={16} color={COLORS.success} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>
                        Đã có ảnh
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => openPickerModal('front')}
                  style={{
                    height: 160,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: frontImage ? 'solid' : 'dashed',
                    borderColor: frontImage ? COLORS.primary : COLORS.gray[300],
                    backgroundColor: frontImage ? '#FFFFFF' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {frontImage ? (
                    <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                      <Image
                        source={{ uri: frontImage }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          paddingVertical: 6,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          Bấm để đổi ảnh khác
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: COLORS.primaryLight,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Camera size={24} color={COLORS.primary} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Chụp hoặc chọn ảnh mặt trước
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Card>

              {/* 3. Ảnh mặt sau CCCD */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                    3. Mặt sau CCCD/CMND *
                  </Text>
                  {backImage && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Check size={16} color={COLORS.success} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>
                        Đã có ảnh
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => openPickerModal('back')}
                  style={{
                    height: 160,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: backImage ? 'solid' : 'dashed',
                    borderColor: backImage ? COLORS.primary : COLORS.gray[300],
                    backgroundColor: backImage ? '#FFFFFF' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {backImage ? (
                    <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                      <Image
                        source={{ uri: backImage }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          paddingVertical: 6,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          Bấm để đổi ảnh khác
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: COLORS.primaryLight,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Camera size={24} color={COLORS.primary} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Chụp hoặc chọn ảnh mặt sau
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Card>

              {/* 4. Ảnh selfie cầm CCCD */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.gray[900] }}>
                    4. Ảnh chân dung selfie cầm CCCD *
                  </Text>
                  {selfieImage && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Check size={16} color={COLORS.success} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>
                        Đã có ảnh
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => openPickerModal('selfie')}
                  style={{
                    height: 160,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: selfieImage ? 'solid' : 'dashed',
                    borderColor: selfieImage ? COLORS.primary : COLORS.gray[300],
                    backgroundColor: selfieImage ? '#FFFFFF' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {selfieImage ? (
                    <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                      <Image
                        source={{ uri: selfieImage }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          paddingVertical: 6,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          Bấm để đổi ảnh khác
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: COLORS.primaryLight,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Camera size={24} color={COLORS.primary} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Chụp ảnh selfie chân dung
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Card>

              {/* Submit Button */}
              <Button
                title="Gửi hồ sơ xét duyệt e-KYC"
                loading={submitKyc.isPending}
                onPress={handleSubmit}
                style={{ marginTop: 8 }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal Bottom Sheet: Lựa chọn nguồn ảnh ───────────────────── */}
      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPickerModalVisible(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: Math.max(insets.bottom + 10, 24),
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.gray[900] }}>
                  Tải ảnh {getTargetTitle()}
                </Text>
                <Text style={{ fontSize: 12.5, color: COLORS.gray[500], marginTop: 2 }}>
                  Chọn phương thức cung cấp ảnh
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPickerModalVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: COLORS.gray[100],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>

            {/* Nút 1: Chụp ảnh trực tiếp từ Camera */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleTakePhoto}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 14,
                backgroundColor: COLORS.gray[50],
                borderWidth: 1,
                borderColor: COLORS.gray[200],
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: COLORS.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Chụp ảnh trực tiếp (Camera)
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                  Mở máy ảnh thiết bị để chụp ảnh ngay
                </Text>
              </View>
              <ChevronRight size={18} color={COLORS.gray[400]} />
            </TouchableOpacity>

            {/* Nút 2: Chọn ảnh từ Thư viện */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handlePickFromLibrary}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 14,
                backgroundColor: COLORS.gray[50],
                borderWidth: 1,
                borderColor: COLORS.gray[200],
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#EFF6FF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ImageIcon size={22} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray[900] }}>
                  Chọn từ Thư viện ảnh
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray[500], marginTop: 2 }}>
                  Tải lên ảnh có sẵn trong thư viện
                </Text>
              </View>
              <ChevronRight size={18} color={COLORS.gray[400]} />
            </TouchableOpacity>

            {/* Nút 3: Ảnh mẫu chỉ dùng khi phát triển — bản release không được nộp ảnh stock */}
            {__DEV__ && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleUseSamplePhoto}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: '#F5F3FF',
                  borderWidth: 1,
                  borderColor: '#DDD6FE',
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#EDE9FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={22} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#5B21B6' }}>
                    Dùng ảnh mẫu thử nghiệm (Test nhanh)
                  </Text>
                  <Text style={{ fontSize: 12, color: '#7C3AED', marginTop: 2 }}>
                    Tự động điền ảnh chuẩn để nộp duyệt nhanh
                  </Text>
                </View>
                <ChevronRight size={18} color="#A78BFA" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
