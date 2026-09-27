import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  PhoneCall,
  MessageCircle,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Send,
  Zap,
} from 'lucide-react-native';
import { Button, Card, COLORS, Badge, Separator } from '@/components/ui';
import Toast from 'react-native-toast-message';

const FAQS = [
  {
    q: 'Làm thế nào để đặt dịch vụ và chọn thợ phù hợp?',
    a: 'Bạn vào mục "Đăng việc" ở menu dưới, chọn ngành nghề cần làm (điện nước, sửa máy lạnh, vệ sinh...), điền mô tả công việc và thời gian mong muốn. Hệ thống sẽ phát thông tin đến các thợ uy tín gần bạn để gửi báo giá cạnh tranh nhất. Bạn có thể xem hồ sơ thợ, điểm đánh giá và chọn thợ ưng ý.',
  },
  {
    q: 'Tiền công được thanh toán và bảo vệ như thế nào?',
    a: 'Green House giữ tiền an toàn (Escrow). Sau khi bạn chọn báo giá và thợ hoàn thành công việc, thợ sẽ chụp ảnh/video bằng chứng bàn giao. Chỉ khi bạn kiểm tra hài lòng và bấm "Nghiệm thu", tiền công mới được cộng vào ví của thợ.',
  },
  {
    q: 'Dịch vụ Cứu hộ khẩn cấp SOS hoạt động ra sao?',
    a: 'Khi gặp sự cố rò rỉ nước ngập nhà, chập điện, kẹt khóa cửa khẩn cấp... bạn bấm nút "Cứu hộ SOS 15p" trên trang chủ. Hệ thống tự động kích hoạt chế độ ưu tiên cao nhất, tìm thợ khẩn cấp gần nhất để có mặt hỗ trợ trong 15-20 phút.',
  },
  {
    q: 'Thợ trên nền tảng đã qua xác minh những gì?',
    a: '100% thợ đối tác đều phải trải qua quy trình xác minh danh tính e-KYC nghiêm ngặt: chụp CCCD gắn chip 2 mặt, nhận diện khuôn mặt trực tiếp, kiểm tra hồ sơ tay nghề và cam kết tuân thủ quy tắc ứng xử an toàn.',
  },
  {
    q: 'Tôi không hài lòng với chất lượng hoặc có hư hại tài sản thì làm sao?',
    a: 'Green House cam kết Bảo hiểm dịch vụ và bảo hành sửa chữa trong vòng 30 ngày. Nếu công việc chưa đạt chuẩn, thợ sẽ khắc phục miễn phí hoặc hệ thống hoàn tiền 100% kèm bồi thường thiệt hại theo chính sách bảo hiểm.',
  },
];

export default function HelpCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleCallHotline = () => {
    Linking.openURL('tel:19008888').catch(() => {
      Toast.show({ type: 'info', text1: 'Hotline: 1900 8888 (24/7)' });
    });
  };

  const handleAskAi = () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);

    // AI Support answer helper
    setTimeout(() => {
      setAiLoading(false);
      const q = aiQuestion.toLowerCase();
      if (q.includes('giá') || q.includes('tiền') || q.includes('chi phí')) {
        setAiAnswer(
          '💡 Giá dịch vụ trên Green House được tính minh bạch dựa trên báo giá trực tiếp từ thợ hoặc biểu phí ước tính chuẩn của AI. Bạn luôn biết rõ giá công và vật tư trước khi xác nhận!',
        );
      } else if (q.includes('hủy') || q.includes('hoàn tiền')) {
        setAiAnswer(
          '💡 Bạn có thể hủy yêu cầu miễn phí trước khi thợ di chuyển đến. Nếu đơn có phát sinh tranh chấp, Green House sẽ đối soát và hoàn tiền trong 24h làm việc.',
        );
      } else if (q.includes('thợ') || q.includes('kyc') || q.includes('uy tín')) {
        setAiAnswer(
          '💡 100% thợ đều được xác thực danh tính e-KYC CCCD và điểm sao đánh giá thực tế từ các đơn hàng trước đó. Bạn hoàn toàn an tâm nhé!',
        );
      } else {
        setAiAnswer(
          `💡 Trợ lý AI Green House ghi nhận câu hỏi: "${aiQuestion}". Nếu cần hỗ trợ khẩn cấp, bạn vui lòng gọi hotline 1900 8888 để được tổng đài viên phục vụ ngay lập tức 24/7!`,
        );
      }
    }, 600);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray[50] }}>
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
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
          onPress={() => router.back()}
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
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            color: COLORS.gray[900],
            marginLeft: 12,
            flex: 1,
          }}
        >
          Trợ giúp Vua Thợ
        </Text>
        <Badge label="24/7 Online" color="#ECFDF5" textColor={COLORS.success} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
      >
        {/* ── 1. Hotline & Emergency Card ─────────────────────────────── */}
        <Card
          style={{
            backgroundColor: '#0F172A',
            padding: 18,
            borderRadius: 20,
            borderWidth: 0,
            gap: 14,
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PhoneCall size={22} color="#FFF" />
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF' }}>
                  Tổng đài Hỗ trợ 24/7
                </Text>
                <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  Giải quyết khiếu nại & Cứu hộ sự cố
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)',
              padding: 12,
              borderRadius: 14,
            }}
          >
            <View>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>
                HOTLINE MIỄN PHÍ CƯỚC
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#34D399', marginTop: 2 }}>
                1900 8888
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleCallHotline}
              style={{
                backgroundColor: COLORS.primary,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <PhoneCall size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13.5 }}>Gọi ngay</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* ── 2. AI Support Assistant Card ─────────────────────────────── */}
        <Card style={{ padding: 16, gap: 12, borderColor: '#FED7AA', borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: COLORS.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                Hỏi đáp nhanh cùng Trợ lý AI
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
                Giải đáp quy trình, hướng dẫn thao tác tức thì
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: COLORS.gray[200],
              borderRadius: 14,
              backgroundColor: '#fff',
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: COLORS.gray[900],
                paddingVertical: 11,
              }}
              placeholder="Nhập thắc mắc của bạn (VD: cách thanh toán, bảo hành...)"
              placeholderTextColor={COLORS.gray[400]}
              value={aiQuestion}
              onChangeText={setAiQuestion}
              onSubmitEditing={handleAskAi}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAskAi}
              disabled={aiLoading}
              style={{
                backgroundColor: COLORS.primary,
                padding: 8,
                borderRadius: 10,
              }}
            >
              <Send size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* AI Response Display */}
          {aiAnswer && (
            <View
              style={{
                backgroundColor: '#DCFCE7',
                padding: 12,
                borderRadius: 12,
                borderLeftWidth: 4,
                borderLeftColor: COLORS.primary,
              }}
            >
              <Text style={{ fontSize: 13.5, color: COLORS.gray[800], lineHeight: 20 }}>
                {aiAnswer}
              </Text>
            </View>
          )}
        </Card>

        {/* ── 3. Quick Action Topics ──────────────────────────────────── */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
            Chủ đề trợ giúp phổ biến
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/sos')}
              style={{
                flex: 1,
                backgroundColor: '#FEF2F2',
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#FECACA',
                gap: 6,
              }}
            >
              <Zap size={22} color={COLORS.error} />
              <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.error }}>
                Cứu hộ SOS 15p
              </Text>
              <Text style={{ fontSize: 11.5, color: COLORS.gray[600], lineHeight: 16 }}>
                Sự cố khẩn cấp điện nước, khóa cửa
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/policy-insurance' as any)}
              style={{
                flex: 1,
                backgroundColor: '#ECFDF5',
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#A7F3D0',
                gap: 6,
              }}
            >
              <ShieldCheck size={22} color={COLORS.success} />
              <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.success }}>
                Bảo hiểm 30 ngày
              </Text>
              <Text style={{ fontSize: 11.5, color: COLORS.gray[600], lineHeight: 16 }}>
                Cam kết bảo hành và bồi thường 100%
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. Frequently Asked Questions (Accordion) ───────────────── */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
            Câu hỏi thường gặp (FAQ)
          </Text>

          <Card style={{ gap: 0, padding: 0 }}>
            {FAQS.map((faq, index) => {
              const isOpen = expandedFaq === index;
              return (
                <View key={index}>
                  {index > 0 && <Separator my={0} />}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setExpandedFaq(isOpen ? null : index)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 16,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: '700',
                        color: isOpen ? COLORS.primary : COLORS.gray[800],
                        lineHeight: 20,
                      }}
                    >
                      {faq.q}
                    </Text>
                    {isOpen ? (
                      <ChevronUp size={18} color={COLORS.primary} />
                    ) : (
                      <ChevronDown size={18} color={COLORS.gray[400]} />
                    )}
                  </TouchableOpacity>

                  {isOpen && (
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingBottom: 16,
                        paddingTop: 0,
                      }}
                    >
                      <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 21 }}>
                        {faq.a}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
