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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useHelperProfile, useSubmitKyc } from '@/hooks/use-api';
import { Button, Card, LoadingSpinner, COLORS, Separator, Input } from '@/components/ui';

// Ảnh mẫu demo e-KYC
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

  if (isLoading) return <LoadingSpinner />;

  const kycStatus = profile?.verification_status || 'unsubmitted';

  const handleSimulatePhoto = (type: 'front' | 'back' | 'selfie') => {
    if (type === 'front') {
      setFrontImage(SAMPLE_FRONT);
      Toast.show({ type: 'info', text1: 'Đã chụp mặt trước CCCD' });
    } else if (type === 'back') {
      setBackImage(SAMPLE_BACK);
      Toast.show({ type: 'info', text1: 'Đã chụp mặt sau CCCD' });
    } else {
      setSelfieImage(SAMPLE_SELFIE);
      Toast.show({ type: 'info', text1: 'Đã chụp ảnh chân dung' });
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
        text1: 'Vui lòng chụp đủ 3 ảnh (Mặt trước, mặt sau và chân dung)',
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
                  Số CCCD: {profile?.id_card_number || '079090123456'}
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
                    {profile?.id_card_number || idCardNumber || '079090123456'}
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
                  {frontImage && <Check size={18} color={COLORS.success} />}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleSimulatePhoto('front')}
                  style={{
                    height: 140,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: frontImage ? 'solid' : 'dashed',
                    borderColor: frontImage ? COLORS.success : COLORS.gray[300],
                    backgroundColor: frontImage ? '#ECFDF5' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    overflow: 'hidden',
                  }}
                >
                  {frontImage ? (
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={32} color={COLORS.success} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.success }}>
                        Đã tải ảnh mặt trước
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.gray[500] }}>Bấm để chụp lại</Text>
                    </View>
                  ) : (
                    <>
                      <Camera size={28} color={COLORS.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Bấm để chụp / tải ảnh mặt trước
                      </Text>
                    </>
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
                  {backImage && <Check size={18} color={COLORS.success} />}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleSimulatePhoto('back')}
                  style={{
                    height: 140,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: backImage ? 'solid' : 'dashed',
                    borderColor: backImage ? COLORS.success : COLORS.gray[300],
                    backgroundColor: backImage ? '#ECFDF5' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    overflow: 'hidden',
                  }}
                >
                  {backImage ? (
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={32} color={COLORS.success} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.success }}>
                        Đã tải ảnh mặt sau
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.gray[500] }}>Bấm để chụp lại</Text>
                    </View>
                  ) : (
                    <>
                      <Camera size={28} color={COLORS.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Bấm để chụp / tải ảnh mặt sau
                      </Text>
                    </>
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
                  {selfieImage && <Check size={18} color={COLORS.success} />}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleSimulatePhoto('selfie')}
                  style={{
                    height: 140,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: selfieImage ? 'solid' : 'dashed',
                    borderColor: selfieImage ? COLORS.success : COLORS.gray[300],
                    backgroundColor: selfieImage ? '#ECFDF5' : COLORS.gray[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    overflow: 'hidden',
                  }}
                >
                  {selfieImage ? (
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={32} color={COLORS.success} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.success }}>
                        Đã chụp ảnh chân dung
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.gray[500] }}>Bấm để chụp lại</Text>
                    </View>
                  ) : (
                    <>
                      <Camera size={28} color={COLORS.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray[700] }}>
                        Bấm để chụp ảnh selfie cầm CCCD
                      </Text>
                    </>
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
    </View>
  );
}
