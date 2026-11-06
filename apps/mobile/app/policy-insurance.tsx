import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
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
import { useTranslation } from '@/hooks/use-i18n';
import Toast from 'react-native-toast-message';

const TABS = ['insurance', 'privacy', 'claim'] as const;
type TabType = (typeof TABS)[number];

export default function PolicyInsuranceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('insurance');

  const handleCallSupport = () => {
    Linking.openURL('tel:19008888').catch(() => {
      Toast.show({
        type: 'info',
        text1: lang === 'en' ? 'Insurance Hotline: 1900 8888' : 'Tổng đài bảo hiểm: 1900 8888',
      });
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
          {lang === 'en' ? 'Privacy & Insurance' : 'Bảo mật & Bảo hiểm'}
        </Text>
        <Badge
          label={lang === 'en' ? '100% Guaranteed' : 'Bảo đảm 100%'}
          color="#ECFDF5"
          textColor={COLORS.success}
        />
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
            {lang === 'en' ? 'Insurance' : 'Gói Bảo hiểm'}
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
            {lang === 'en' ? 'Privacy' : 'Bảo mật'}
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
            {lang === 'en' ? 'Claims' : 'Bồi thường'}
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
                    {lang === 'en' ? 'Green House Golden Guarantee' : 'Cam Kết Vàng Green House'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#A7F3D0', marginTop: 2 }}>
                    {lang === 'en'
                      ? '30-Day Warranty • 50M Property Insurance'
                      : 'Bảo hành 30 ngày • Bảo hiểm tài sản 50 triệu'}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 20 }}>
                {lang === 'en'
                  ? 'Every job completed through Green House automatically includes comprehensive insurance coverage at no extra cost.'
                  : 'Mọi công việc được thực hiện qua Green House đều tự động áp dụng chính sách bảo hiểm toàn diện mà không phát sinh thêm bất kỳ chi phí nào.'}
              </Text>
            </Card>

            {/* Insurance Pillars */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                {lang === 'en' ? '3 Comprehensive Insurance Pillars' : '3 Trụ cột Bảo hiểm Toàn diện'}
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
                      {lang === 'en'
                        ? '1. 30-Day Workmanship Warranty'
                        : '1. Bảo hành tay nghề 30 ngày'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      {lang === 'en'
                        ? 'Completely free problem resolution'
                        : 'Khắc phục lỗi hoàn toàn miễn phí'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  {lang === 'en'
                    ? 'If the issue reoccurs or the cleaning/repair does not meet agreed quality, the helper will return for warranty service free of charge within 24 hours.'
                    : 'Nếu sự cố tái diễn hoặc công việc vệ sinh, sửa chữa chưa đạt yêu cầu đã thỏa thuận, thợ sẽ quay lại bảo hành miễn phí trong vòng 24 giờ.'}
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
                      {lang === 'en'
                        ? '2. Property Damage & Breakage Insurance'
                        : '2. Bảo hiểm tài sản & Đổ vỡ'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      {lang === 'en'
                        ? 'Up to 50,000,000₫ compensation'
                        : 'Bồi thường tối đa đến 50.000.000₫'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  {lang === 'en'
                    ? 'Insurance covers accidental appliance damage or breakage of valuable items caused by the helper during the service.'
                    : 'Bảo hiểm chi trả trong trường hợp thợ gây hư hỏng thiết bị gia dụng hoặc đổ vỡ đồ vật có giá trị trong quá trình tác nghiệp tại gia đình bạn.'}
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
                      {lang === 'en'
                        ? '3. 100% e-KYC Verified Helpers'
                        : '3. Thợ xác thực e-KYC 100%'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[500] }}>
                      {lang === 'en'
                        ? 'Clean background check & safety training'
                        : 'Lý lịch tư pháp trong sạch & Đào tạo an toàn'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 20 }}>
                  {lang === 'en'
                    ? 'All helpers have verified chip citizen ID, professional certifications, and signed safety commitments to protect homeowners.'
                    : 'Mọi thợ đều được kiểm tra hồ sơ căn cước công dân gắn chip, giấy chứng nhận nghề và ký cam kết bảo vệ an toàn cho gia chủ.'}
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
                  {lang === 'en' ? 'Information Privacy Policy' : 'Chính sách Bảo mật Thông tin'}
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[700], lineHeight: 21 }}>
                {lang === 'en'
                  ? 'Green House is committed to safeguarding your private data and personal information in accordance with international ISO/IEC 27001 standards and Decree 13/2023/ND-CP on Personal Data Protection.'
                  : 'Green House cam kết bảo vệ tối đa dữ liệu riêng tư và thông tin cá nhân của bạn theo tiêu chuẩn bảo mật quốc tế ISO/IEC 27001 và Nghị định 13/2023/NĐ-CP về Bảo vệ dữ liệu cá nhân.'}
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                {lang === 'en' ? '1. Minimal Data Collection' : '1. Thu thập thông tin tối thiểu'}
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                {lang === 'en'
                  ? `• We only collect your phone number, name, service address, and issue photos to dispatch helpers.\n• Your phone number is masked and encrypted when contacting via hotline or in-app chat.`
                  : `• Chúng tôi chỉ thu thập số điện thoại, tên, địa chỉ thực hiện đơn hàng và hình ảnh sự cố để phục vụ việc điều phối thợ.\n• Số điện thoại của bạn được mã hóa và ẩn danh khi liên hệ qua tổng đài hoặc hệ thống chat nội bộ.`}
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                {lang === 'en' ? '2. Payment Security & Escrow' : '2. Bảo mật thanh toán & Escrow'}
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                {lang === 'en'
                  ? `• We do not store credit card credentials or e-wallet passwords.\n• Escrow holds funds safely: payment is only released to the helper once you inspect and approve the job.`
                  : `• Không lưu trữ thông tin thẻ ngân hàng hoặc mật khẩu tài khoản ví điện tử.\n• Cơ chế thanh toán giữ hộ (Escrow) bảo đảm quyền lợi đôi bên: Khách nghiệm thu xong thợ mới nhận tiền.`}
              </Text>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                {lang === 'en' ? '3. User Rights' : '3. Quyền của người dùng'}
              </Text>
              <Text style={{ fontSize: 13.5, color: COLORS.gray[600], lineHeight: 20 }}>
                {lang === 'en'
                  ? 'You have the right to view, update, or request complete deletion of your personal data and activity history at any time in account settings.'
                  : 'Bạn có toàn quyền xem, chỉnh sửa hoặc yêu cầu xóa bỏ hoàn toàn dữ liệu cá nhân và lịch sử hoạt động bất kỳ lúc nào trong phần cài đặt tài khoản.'}
              </Text>
            </Card>
          </View>
        )}

        {/* ── TAB 3: QUY TRÌNH BỒI THƯỜNG ──────────────────────────────── */}
        {activeTab === 'claim' && (
          <View style={{ gap: 14 }}>
            <Card
              style={{
                padding: 16,
                gap: 12,
                backgroundColor: '#FFFBEB',
                borderColor: '#FDE68A',
                borderWidth: 1.5,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={22} color="#D97706" />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>
                  {lang === 'en'
                    ? '24h Claim & Dispute Resolution Process'
                    : 'Quy trình Bồi thường & Khiếu nại 24h'}
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, color: '#B45309', lineHeight: 20 }}>
                {lang === 'en'
                  ? 'In case of an incident, the Green House support team reviews and settles the claim within 24 working hours.'
                  : 'Khi có sự cố ngoài ý muốn, đội ngũ Chăm sóc khách hàng Green House sẽ tiếp nhận và hoàn tất thẩm định đền bù trong vòng 24 giờ làm việc.'}
              </Text>
            </Card>

            {/* Steps */}
            <Card style={{ padding: 16, gap: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gray[900] }}>
                {lang === 'en'
                  ? '4 Simple Steps to File a Claim:'
                  : '4 Bước yêu cầu bồi thường đơn giản:'}
              </Text>

              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      {lang === 'en'
                        ? 'Submit request or call Hotline 1900 8888'
                        : 'Gửi yêu cầu hoặc gọi Hotline 1900 8888'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      {lang === 'en'
                        ? 'Report the incident within 48h after job completion.'
                        : 'Thông báo sự cố trong vòng 48h sau khi hoàn thành đơn.'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      {lang === 'en'
                        ? 'Provide photo/video evidence'
                        : 'Cung cấp ảnh/video hiện trường'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      {lang === 'en'
                        ? 'Send photos of damage or technical faults for specialist assessment.'
                        : 'Gửi hình ảnh thiệt hại hoặc lỗi kỹ thuật để chuyên viên thẩm định.'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      {lang === 'en'
                        ? 'Assessment & Resolution Plan'
                        : 'Thẩm định & Phương án xử lý'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      {lang === 'en'
                        ? 'Green House sends an assessor or cross-checks helper service history.'
                        : 'Green House cử giám định viên hoặc đối chiếu lịch sử làm việc của thợ.'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: COLORS.success,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>4</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[900] }}>
                      {lang === 'en'
                        ? 'Payout Compensation / Free Repair'
                        : 'Chi trả bồi thường / Sửa chữa miễn phí'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.gray[600], marginTop: 2 }}>
                      {lang === 'en'
                        ? 'Compensation funds are transferred directly into your bank account.'
                        : 'Tiền bồi thường chuyển thẳng vào tài khoản ngân hàng của bạn.'}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            <Button
              title={
                lang === 'en'
                  ? 'Contact Claims Hotline (1900 8888)'
                  : 'Liên hệ Tổng đài Khiếu nại (1900 8888)'
              }
              icon={<PhoneCall size={16} color="#fff" />}
              onPress={handleCallSupport}
              style={{ marginTop: 4 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
