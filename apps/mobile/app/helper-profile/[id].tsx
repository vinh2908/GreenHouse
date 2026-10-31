import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ShieldCheck,
  Star,
  CheckCircle2,
  Wrench,
  MessageCircle,
  Calendar,
  Award,
  ThumbsUp,
  Heart,
} from 'lucide-react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHelperPublicProfile,
  useHelperReviews,
  useSelectQuote,
  useFavorites,
  useAddFavorite,
  useRemoveFavorite,
} from '@/hooks/use-api';
import {
  Button,
  Card,
  Avatar,
  LoadingSpinner,
  COLORS,
  Separator,
  StarRating,
} from '@/components/ui';

dayjs.extend(relativeTime);
dayjs.locale('vi');

export default function HelperPublicProfileScreen() {
  const { id, jobId, quoteId } = useLocalSearchParams<{
    id: string;
    jobId?: string;
    quoteId?: string;
  }>();
  const router = useRouter();

  const { user } = useAuthStore();
  const { data: profile, isLoading: pLoading, refetch } = useHelperPublicProfile(id);
  const { data: reviewsData, isLoading: rLoading } = useHelperReviews(id);
  const selectQuote = useSelectQuote();

  // ── Thợ yêu thích ──────────────────────────────────────────────────────
  const isCustomer = user?.active_role !== 'helper';
  const { data: favorites } = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const isFavorite = (favorites ?? []).some(f => {
    const hid = typeof f.helper_id === 'string' ? f.helper_id : f.helper_id?._id;
    return hid === id;
  });
  const toggleFavorite = () => {
    if (!id) return;
    if (isFavorite) removeFavorite.mutate(id);
    else addFavorite.mutate(id);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(user?.active_role === 'helper' ? '/(helper)/dashboard' : '/(customer)/home');
  };

  if (pLoading) return <LoadingSpinner />;

  const helperUser =
    typeof profile?.user_id === 'object' && profile?.user_id ? profile.user_id : {};
  const helperName = helperUser?.full_name || profile?.full_name || 'Thợ';
  const helperAvatar = helperUser?.avatar || profile?.avatar;
  const ratingScore = profile?.average_rating || profile?.rating || 0;
  const totalCompleted = profile?.total_completed || profile?.completed_jobs || 0;
  const isVerified = profile?.verification_status === 'approved';

  const reviewsList = reviewsData?.reviews || [];
  const insets = useSafeAreaInsets();

  const handleMessageHelper = () => {
    if (jobId) {
      router.push({ pathname: '/chat/[jobId]', params: { jobId } });
      return;
    }
    Toast.show({
      type: 'info',
      text1: 'Chọn hoặc tạo đơn hàng để nhắn tin',
      text2: 'Cuộc trò chuyện sẽ tự động mở khi bạn chọn báo giá của thợ.',
    });
    router.push('/(customer)/booking');
  };

  const handleHireHelper = async () => {
    if (jobId && quoteId) {
      try {
        await selectQuote.mutateAsync({
          jobId,
          quote_id: quoteId,
          scheduled_at: dayjs().add(1, 'day').format('YYYY-MM-DDT09:00:00'),
        });
        Toast.show({
          type: 'success',
          text1: `Đã chọn ${helperName}! 🎉`,
          text2: 'Hợp đồng số đã được tạo thành công.',
        });
        router.replace({ pathname: '/job-detail/[id]', params: { id: jobId } });
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'Chưa thể chọn báo giá này';
        Toast.show({ type: 'error', text1: msg });
      }
      return;
    }
    router.push('/(customer)/booking');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* ── Top Bar (Safe Insets) ────────────────────────────────────── */}
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
          Hồ sơ thợ uy tín
        </Text>
        {isCustomer ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={toggleFavorite}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: isFavorite ? '#FDF2F8' : COLORS.gray[100],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Heart
              size={20}
              color={isFavorite ? '#EC4899' : COLORS.gray[500]}
              fill={isFavorite ? '#EC4899' : 'transparent'}
            />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={pLoading || rLoading}
            onRefresh={refetch}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── 1. KHỐI THÔNG TIN ĐỊNH DANH ──────────────────────────────── */}
        <Card style={{ alignItems: 'center', padding: 20, gap: 12 }}>
          <View style={{ position: 'relative' }}>
            <Avatar name={helperName} uri={helperAvatar} size={84} />
            {isVerified && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  padding: 2,
                }}
              >
                <ShieldCheck size={24} color={COLORS.success} />
              </View>
            )}
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.gray[900] }}>
              {helperName}
            </Text>
            {profile?.working_areas?.length > 0 && (
              <Text style={{ fontSize: 13, color: COLORS.gray[500], fontWeight: '500' }}>
                Hoạt động: {profile.working_areas.join(', ')}
              </Text>
            )}
          </View>

          {profile?.verification_status === 'approved' ? (
            <View
              style={{
                backgroundColor: '#ECFDF5',
                borderWidth: 1.5,
                borderColor: '#A7F3D0',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ShieldCheck size={18} color={COLORS.success} />
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.success }}>
                Đã xác minh nhân thân & Hồ sơ tư pháp (e-KYC 100%)
              </Text>
            </View>
          ) : profile?.verification_status === 'pending' ? (
            <View
              style={{
                backgroundColor: '#FFFBEB',
                borderWidth: 1.5,
                borderColor: '#FDE68A',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ShieldCheck size={18} color="#D97706" />
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#D97706' }}>
                Hồ sơ e-KYC đang chờ duyệt
              </Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#FEF2F2',
                borderWidth: 1.5,
                borderColor: '#FECACA',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ShieldCheck size={18} color={COLORS.error} />
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.error }}>
                Chưa xác minh danh tính e-KYC
              </Text>
            </View>
          )}
        </Card>

        {/* ── 2. KHỐI CHỈ SỐ UY TÍN & KINH NGHIỆM ──────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Star size={20} color="#F59E0B" />
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#F59E0B' }}>
                {ratingScore.toFixed(1)}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
              {profile?.total_reviews || reviewsList.length || 0} đánh giá
            </Text>
          </Card>

          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.gray[900] }}>
              {totalCompleted}
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
              Đơn hoàn tất
            </Text>
          </Card>

          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.success }}>
              {profile?.completion_rate ?? 100}%
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.gray[500], fontWeight: '700' }}>
              Đúng giờ hẹn
            </Text>
          </Card>
        </View>

        <Card
          style={{
            backgroundColor: '#FFFBEB',
            borderWidth: 1.5,
            borderColor: '#FDE68A',
            padding: 14,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Award size={18} color="#D97706" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#B45309' }}>
              Cam kết dịch vụ từ đối tác
            </Text>
          </View>
          <Text style={{ fontSize: 12.5, color: '#92400E', lineHeight: 18 }}>
            • Tỷ lệ hoàn thành công việc: {profile?.completion_rate ?? 100}% (Không hủy ngang).
            {'\n'}• {profile?.years_experience ? `Hơn ${profile.years_experience} năm` : 'Có'} kinh
            nghiệm thực tế trong lĩnh vực.{'\n'}• Bảo hành chất lượng dịch vụ và bảo hiểm an toàn
            trong quá trình làm việc.
          </Text>
        </Card>

        {/* ── 3. KỸ NĂNG CHUYÊN MÔN ────────────────────────────────────── */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Wrench size={18} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
              Kỹ năng chuyên sâu
            </Text>
          </View>

          {profile?.skills?.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {profile.skills.map((skill: string) => (
                <View
                  key={skill}
                  style={{
                    backgroundColor: COLORS.gray[100],
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.gray[800] }}>
                    ✓ {skill}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {profile?.bio && (
            <>
              <Separator my={4} />
              <Text style={{ fontSize: 13, color: COLORS.gray[600], lineHeight: 19 }}>
                {profile.bio}
              </Text>
            </>
          )}
        </Card>

        {/* ── 4. BẢNG GIÁ THAM KHẢO & KHUNG GIỜ HOẠT ĐỘNG ─────────────── */}
        <Card style={{ gap: 10, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Calendar size={18} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
              Bảng giá tham khảo & Khung giờ rảnh
            </Text>
          </View>

          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 13.5, color: COLORS.gray[600] }}>Công thợ theo giờ:</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
              70.000₫ – 100.000₫ / giờ
            </Text>
          </View>

          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 13.5, color: COLORS.gray[600] }}>
              Gói sửa điện nước cơ bản:
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
              Từ 150.000₫ / ca
            </Text>
          </View>

          <View
            style={{
              backgroundColor: COLORS.gray[50],
              padding: 10,
              borderRadius: 10,
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 12.5, color: COLORS.gray[600], fontWeight: '600' }}>
              🕐 Khung giờ làm việc:{' '}
              <Text style={{ color: COLORS.gray[900], fontWeight: '800' }}>
                {profile?.availability?.start_time || '07:00'} –{' '}
                {profile?.availability?.end_time || '19:00'}
              </Text>{' '}
              (Tất cả các ngày trong tuần)
            </Text>
          </View>
        </Card>

        {/* ── 5. ĐÁNH GIÁ THỰC TẾ TỪ KHÁCH HÀNG CŨ ────────────────────── */}
        <Card style={{ gap: 14, padding: 16 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ThumbsUp size={18} color={COLORS.primary} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                Khách hàng đánh giá ({profile?.total_reviews || reviewsList.length || 0})
              </Text>
            </View>
            <StarRating rating={ratingScore} />
          </View>

          {reviewsList.length === 0 ? (
            <View
              style={{
                backgroundColor: COLORS.gray[50],
                padding: 20,
                borderRadius: 14,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray[700] }}>
                Chưa có đánh giá nào từ khách hàng
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.gray[500],
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                Các đánh giá và nhận xét sau khi bạn hoàn thành các đơn hàng sẽ được hiển thị đầy đủ
                tại đây.
              </Text>
            </View>
          ) : (
            reviewsList.map((r: any) => (
              <View
                key={r._id}
                style={{ backgroundColor: COLORS.gray[50], padding: 12, borderRadius: 12, gap: 6 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 14, color: COLORS.gray[900] }}>
                    {r.customer_id?.full_name || 'Khách hàng ẩn danh'}
                  </Text>
                  <StarRating rating={r.rating} size={12} />
                </View>
                {r.comment && (
                  <Text style={{ fontSize: 13, color: COLORS.gray[700], lineHeight: 18 }}>
                    "{r.comment}"
                  </Text>
                )}
                {r.helper_reply && (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      padding: 8,
                      borderRadius: 8,
                      marginTop: 4,
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.primary,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: COLORS.gray[600], fontStyle: 'italic' }}>
                      Thợ phản hồi: "{r.helper_reply}"
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: 11, color: COLORS.gray[400], marginTop: 2 }}>
                  {dayjs(r.created_at).fromNow()}
                </Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* ── Bottom Floating Bar: Nhắn tin / Thuê thợ ─────────────────── */}
      {user?._id !== id && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#fff',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: COLORS.gray[100],
            flexDirection: 'row',
            gap: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <Button
            title="Nhắn tin với thợ"
            variant="outline"
            style={{ flex: 1 }}
            icon={<MessageCircle size={18} color={COLORS.primary} />}
            onPress={handleMessageHelper}
          />
          <Button
            title={quoteId ? 'Chấp nhận báo giá' : 'Thuê thợ này'}
            style={{ flex: 1 }}
            loading={selectQuote.isPending}
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={handleHireHelper}
          />
          {isCustomer && !quoteId && (
            <Button
              title="📅 Thuê theo tháng"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() =>
                router.push({
                  pathname: '/monthly-contract-create',
                  params: { helperId: String(id) },
                })
              }
            />
          )}
        </View>
      )}
    </View>
  );
}
