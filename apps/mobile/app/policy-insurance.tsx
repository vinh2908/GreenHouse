import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  PhoneCall,
  DollarSign,
  HeartHandshake,
} from 'lucide-react-native';
import { Button, Card, COLORS, Badge, Separator } from '@/components/ui';
import Toast from 'react-native-toast-message';

const TABS = ['insurance', 'privacy', 'claim'] as const;
type TabType = typeof TABS[number];

export default function PolicyInsuranceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('insurance');

  const handleCallSupport = () => {
    Linking.openURL('tel:19008888').catch(() => {
      Toast.show({ type: 'info', text1: 'Tổng đài bảo hiểm: 1900 8888' });
    });
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
          Bảo mật & Bảo hiểm
        </Text>
        <Badge label="Bảo đảm 100%" color="#ECFDF5" textColor={COLORS.success} />
      </View>

      {/* ── Tabs Selector ─────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#fff',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.gray[200],
          gap: 8,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('insurance')}
          style={{
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: activeTab === 'insurance' ? COLORS.primaryLight : 'transparent',
            borderWidth: activeTab === 'insurance' ? 1.5 : 0,
            borderColor: COLORS.primary,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: activeTab === 'insurance' ? COLORS.primary : COLORS.gray[600],
            }}
          >
            🛡️ Gói Bảo hiểm
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('privacy')}
          style={{
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: activeTab === 'privacy' ? COLORS.primaryLight : 'transparent',
            borderWidth: activeTab === 'privacy' ? 1.5 : 0,
            borderColor: COLORS.primary,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: activeTab === 'privacy' ? COLORS.primary : COLORS.gray[600],
            }}
          >
            🔒 Bảo mật
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('claim')}
          style={{
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: activeTab === 'claim' ? COLORS.primaryLight : 'transparent',
            borderWidth: activeTab === 'claim' ? 1.5 : 0,
            borderColor: COLORS.primary,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: activeTab === 'claim' ? COLORS.primary : COLORS.gray[600],
            }}
          >
            📋 Bồi thường
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
      >
        {/* ── TAB 1: BẢO HIỂM DỊCH VỤ ──────────────────────────────────── */}
        {activeTab === 'insurance' && (
          <>
            {/* Hero Guarantee Banner */}
            <Card
              style={{
                backgroundColor: '#064E3B',
                padding: 18,
                borderRadius: 20,
                borderWidth: 0,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: '#10B981',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={26} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#FFF' }}>
                    Cam Kết Vàng HomeMate
                  </Text>
                  <Text style={{ fontSize: 13, color: '#A7F3D0', marginTop: 2 }}>
                    Bảo hành 30 ngày • Bảo hiểm tài sản 50 triệu
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 20 }}>
                Mọi công việc được thực hiện qua HomeMate đều tự động áp dụng chính sách bảo hiểm toàn diện mà không phát sinh thêm bất kỳ chi phí nào.
              </Text>
            </Card>

            {/* Insurance Pillars */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                3 Trụ cột Bảo hiểm Toàn diện
              </Text>

              {/* Pillar 1 */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                    <CheckCircle2 size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                      1. Bảo hành tay nghề 30 ngày
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      Khắc phục lỗi hoàn toàn miễn phí
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  Nếu sự cố tái diễn hoặc công việc vệ sinh, sửa chữa chưa đạt yêu cầu đã thỏa thuận, thợ sẽ quay lại bảo hành miễn phí trong vòng 24 giờ.
                </Text>
              </Card>

              {/* Pillar 2 */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: '#EEF4FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <DollarSign size={20} color={COLORS.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                      2. Bảo hiểm tài sản & Đổ vỡ
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      Bồi thường tối đa đến 50.000.000₫
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  Bảo hiểm chi trả trong trường hợp thợ gây hư hỏng thiết bị gia dụng hoặc đổ vỡ đồ vật có giá trị trong quá trình tác nghiệp tại gia đình bạn.
                </Text>
              </Card>

              {/* Pillar 3 */}
              <Card style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: '#ECFDF5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <HeartHandshake size={20} color={COLORS.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                      3. Thợ xác thực e-KYC 100%
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      Lý lịch tư pháp trong sạch & Đào tạo an toàn
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  Mọi thợ đều được kiểm tra hồ sơ căn cước công dân gắn chip, giấy chứng nhận nghề và ký cam kết bảo vệ an toàn cho gia chủ.
                </Text>
              </Card>
            </View>
          </>
        )}

        {/* ── TAB 2: CHÍNH SÁCH BẢO MẬT ────────────────────────────────── */}
        {activeTab === 'privacy' && (
          <View style={{ gap: 14 }}>
            <Card style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Lock size={22} color={COLORS.primary} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                  Chính sách Bảo mật Thông tin
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 21 }}>
                HomeMate cam kết bảo vệ tối đa dữ liệu riêng tư và thông tin cá nhân của bạn theo tiêu chuẩn bảo mật quốc tế ISO/IEC 27001 và Nghị định 13/2023/NĐ-CP về Bảo vệ dữ liệu cá nhân.
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                1. Thu thập thông tin tối thiểu
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                • Chúng tôi chỉ thu thập số điện thoại, tên, địa chỉ thực hiện đơn hàng và hình ảnh sự cố để phục vụ việc điều phối thợ.{'\n'}
                • Số điện thoại của bạn được mã hóa và ẩn danh khi liên hệ qua tổng đài hoặc hệ thống chat nội bộ.
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                2. Bảo mật thanh toán & Escrow
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                • Không lưu trữ thông tin thẻ ngân hàng hoặc mật khẩu tài khoản ví điện tử.{'\n'}
                • Cơ chế thanh toán giữ hộ (Escrow) bảo đảm quyền lợi đôi bên: Khách nghiệm thu xong thợ mới nhận tiền.
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                3. Quyền của người dùng
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                Bạn có toàn quyền xem, chỉnh sửa hoặc yêu cầu xóa bỏ hoàn toàn dữ liệu cá nhân và lịch sử hoạt động bất kỳ lúc nào trong phần cài đặt tài khoản.
              </Text>
            </Card>
          </View>
        )}

        {/* ── TAB 3: QUY TRÌNH BỒI THƯỜNG ──────────────────────────────── */}
        {activeTab === 'claim' && (
          <View style={{ gap: 14 }}>
            <Card style={{ padding: 16, gap: 12, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={22} color="#D97706" />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>
                  Quy trình Bồi thường & Khiếu nại 24h
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, color: '#B45309', lineHeight: 20 }}>
                Khi có sự cố ngoài ý muốn, đội ngũ Chăm sóc khách hàng HomeMate sẽ tiếp nhận và hoàn tất thẩm định đền bù trong vòng 24 giờ làm việc.
              </Text>
            </Card>

            {/* Steps */}
            <Card style={{ padding: 16, gap: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                4 Bước yêu cầu bồi thường đơn giản:
              </Text>

              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      Gửi yêu cầu hoặc gọi Hotline 1900 8888
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      Thông báo sự cố trong vòng 48h sau khi hoàn thành đơn.
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      Cung cấp ảnh/video hiện trường
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      Gửi hình ảnh thiệt hại hoặc lỗi kỹ thuật để chuyên viên thẩm định.
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      Thẩm định & Phương án xử lý
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      HomeMate cử giám định viên hoặc đối chiếu lịch sử làm việc của thợ.
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>4</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      Chi trả bồi thường / Sửa chữa miễn phí
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      Tiền bồi thường chuyển thẳng vào tài khoản ngân hàng của bạn.
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            <Button
              title="📞 Liên hệ Tổng đài Khiếu nại (1900 8888)"
              onPress={handleCallSupport}
              style={{ marginTop: 4 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
