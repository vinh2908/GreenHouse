import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useState } from 'react';import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { vnDateTimeKey, formatRelativeTime } from '@/utils/date-format';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';
import {
  useHelperPublicProfile,
  useHelperReviews,
  useReplyReview,
  useSelectQuote,
  useFavorites,
  useAddFavorite,
  useRemoveFavorite,
  useAppealReview,
} from '@/hooks/use-api';
import { useHelperStatusSocket } from '@/hooks/use-socket';
import { Button, Card, Avatar, LoadingSpinner, COLORS, Separator, StarRating, ErrorState, useThemeColors } from '@/components/ui';

export default function HelperPublicProfileScreen() {
  const { id, jobId, quoteId } = useLocalSearchParams<{
    id: string;
    jobId?: string;
    quoteId?: string;
  }>();
  const router = useRouter();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();

  const { user } = useAuthStore();
  // B71: kháng nghị đánh giá (chỉ thợ xem hồ sơ của chính mình)
  const appealReview = useAppealReview();
  const [appealFor, setAppealFor] = React.useState<string | null>(null);
  const [appealReason, setAppealReason] = React.useState('');
  const { data: profile, isLoading: pLoading, isError: pError, refetch } = useHelperPublicProfile(id);
  // B113: đang xem hồ sơ thợ → nhận helper:status_changed để cập nhật trạng thái ngay
  useHelperStatusSocket(id);
  const { data: reviewsData, isLoading: rLoading } = useHelperReviews(id);
  const selectQuote = useSelectQuote();
  // B1: thợ trả lời đánh giá của chính mình (chỉ hiện khi đang xem hồ sơ của mình)
  // S12: route id có thể là user id (favorites, job-detail) hoặc Helper doc id
  // ((helper)/profile fallback) — so với cả hai.
  const helperOwnerId =
    typeof profile?.user_id === 'object' && profile?.user_id
      ? (profile.user_id as { _id?: string })._id
      : typeof profile?.user_id === 'string'
        ? profile.user_id
        : undefined;
  const isOwnProfile =
    !!user?._id && (user._id === id || (helperOwnerId != null && user._id === helperOwnerId));
  const replyReview = useReplyReview();
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // ── Thợ yêu thích ──────────────────────────────────────────────────────
  // Khách chưa đăng nhập không phải "khách hàng": ẩn tim, bấm tim → đăng nhập.
  const isCustomer = !!user && user.active_role !== 'helper';
  const { data: favorites } = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const isFavorite = (favorites ?? []).some(f => {
    const hid = typeof f.helper_id === 'string' ? f.helper_id : f.helper_id?._id;
    return hid === id;
  });
  const toggleFavorite = () => {
    if (!id) return;
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
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

  const insets = useSafeAreaInsets();

  if (pLoading) return <LoadingSpinner />;

  // P1-6: fetch lỗi/404 không được render hồ sơ giả (tên "Thợ", 0.0★, badge đỏ).
  if (pError || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: tc.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: Math.max(insets.top + 6, 18),
            paddingBottom: 14,
            backgroundColor: tc.surface,
            borderBottomWidth: 1,
            borderBottomColor: tc.border,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBack}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: tc.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={20} color={COLORS.gray[800]} />
          </TouchableOpacity>
          <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text, marginLeft: 12 }}>
            {lang === 'en' ? 'Verified Helper Profile' : 'Hồ sơ thợ uy tín'}
          </Text>
        </View>
        <ErrorState
          title={lang === 'en' ? 'Unable to load helper profile' : 'Không thể tải hồ sơ thợ'}
          subtitle={
            lang === 'en'
              ? 'This helper may not exist or the network failed. Please retry.'
              : 'Thợ này có thể không tồn tại hoặc mạng gặp sự cố. Vui lòng thử lại.'
          }
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const helperUser =
    typeof profile?.user_id === 'object' && profile?.user_id ? profile.user_id : {};
  const helperName =
    helperUser?.full_name || profile?.full_name || (lang === 'en' ? 'Helper' : 'Thợ');
  const helperAvatar = helperUser?.avatar || profile?.avatar;
  const ratingScore = profile?.average_rating || profile?.rating || 0;
  const totalCompleted = profile?.total_completed || profile?.completed_jobs || 0;
  const isVerified = profile?.verification_status === 'approved';

  // P1-4: giá thật từ service_ids đã populate (base_price_min/max) — không
  // dùng giá cứng 70–100k/giờ hay 150k/ca cho mọi thợ.
  const pricedServices = ((profile?.service_ids ?? []) as any[]).filter(
    s =>
      s &&
      typeof s === 'object' &&
      (typeof s.base_price_min === 'number' || typeof s.base_price_max === 'number'),
  );
  const formatPriceRange = (s: any): string => {
    const min = s.base_price_min;
    const max = s.base_price_max;
    if (typeof min === 'number' && typeof max === 'number' && max > min)
      return `${min.toLocaleString('vi-VN')}₫ – ${max.toLocaleString('vi-VN')}₫`;
    if (typeof min === 'number')
      return `${lang === 'en' ? 'From ' : 'Từ '}${min.toLocaleString('vi-VN')}₫`;
    return `${(max as number).toLocaleString('vi-VN')}₫`;
  };
  // Khung giờ thật: chỉ khi thợ đã bật lịch làm việc (availability.enabled);
  // mặc định enabled=false nghĩa là nhận việc linh hoạt, không phải 07:00–19:00.
  const availability = profile?.availability as
    | { enabled?: boolean; days_of_week?: number[]; start_time?: string; end_time?: string }
    | undefined;
  const availabilityDays = (availability?.days_of_week ?? []).filter(
    (d: number) => d >= 0 && d <= 6,
  );
  const dayLabels =
    lang === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const availabilityDaysText =
    availabilityDays.length === 7
      ? lang === 'en'
        ? '(Every day of the week)'
        : '(Tất cả các ngày trong tuần)'
      : availabilityDays.length > 0
        ? `(${availabilityDays.map(d => dayLabels[d]).join(', ')})`
        : '';

  const reviewsList = reviewsData?.reviews || [];

  const handleMessageHelper = () => {
    if (jobId) {
      router.push({ pathname: '/chat/[jobId]', params: { jobId } });
      return;
    }
    Toast.show({
      type: 'info',
      text1:
        lang === 'en' ? 'Select or create a job to chat' : 'Chọn hoặc tạo đơn hàng để nhắn tin',
      text2:
        lang === 'en'
          ? 'The chat will automatically open when you select helper quote.'
          : 'Cuộc trò chuyện sẽ tự động mở khi bạn chọn báo giá của thợ.',
    });
    router.push('/(customer)/booking');
  };

  const handleHireHelper = async () => {
    if (jobId && quoteId) {
      try {
        await selectQuote.mutateAsync({
          jobId,
          quote_id: quoteId,
          scheduled_at: vnDateTimeKey(1),
        });
        Toast.show({
          type: 'success',
          text1: lang === 'en' ? `Selected ${helperName}!` : `Đã chọn ${helperName}!`,
          text2:
            lang === 'en'
              ? 'Digital contract created successfully.'
              : 'Hợp đồng số đã được tạo thành công.',
        });
        router.replace({ pathname: '/job-detail/[id]', params: { id: jobId } });
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          (lang === 'en' ? 'Unable to select this quote' : 'Chưa thể chọn báo giá này');
        Toast.show({ type: 'error', text1: msg });
      }
      return;
    }
    router.push('/(customer)/booking');
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* ── Top Bar (Safe Insets) ────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top + 6, 18),
          paddingBottom: 14,
          backgroundColor: tc.surface,
          borderBottomWidth: 1,
          borderBottomColor: tc.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: tc.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color={COLORS.gray[800]} />
        </TouchableOpacity>
        <Text style={{ fontSize: fs(17), fontWeight: '800', color: tc.text }}>
          {lang === 'en' ? 'Verified Helper Profile' : 'Hồ sơ thợ uy tín'}
        </Text>
        {isCustomer ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={toggleFavorite}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
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
                  backgroundColor: tc.surface,
                  borderRadius: 14,
                  padding: 2,
                }}
              >
                <ShieldCheck size={24} color={COLORS.success} />
              </View>
            )}
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: fs(20), fontWeight: '900', color: tc.text }}>
              {helperName}
            </Text>
            {profile?.working_areas?.length > 0 && (
              <Text style={{ fontSize: fs(13), color: tc.textMuted, fontWeight: '500' }}>
                {lang === 'en' ? 'Operating in: ' : 'Hoạt động: '}
                {profile.working_areas.join(', ')}
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
              <Text style={{ fontSize: fs(12.5), fontWeight: '800', color: COLORS.success }}>
                {lang === 'en'
                  ? 'Identity & Judicial Records Verified (e-KYC 100%)'
                  : 'Đã xác minh nhân thân & Hồ sơ tư pháp (e-KYC 100%)'}
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
              <Text style={{ fontSize: fs(12.5), fontWeight: '800', color: '#D97706' }}>
                {lang === 'en' ? 'e-KYC Verification Pending' : 'Hồ sơ e-KYC đang chờ duyệt'}
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
              <Text style={{ fontSize: fs(12.5), fontWeight: '800', color: COLORS.error }}>
                {lang === 'en' ? 'e-KYC Identity Not Verified' : 'Chưa xác minh danh tính e-KYC'}
              </Text>
            </View>
          )}
        </Card>

        {/* ── 2. KHỐI CHỈ SỐ UY TÍN & KINH NGHIỆM ──────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Star size={20} color="#F59E0B" />
              <Text style={{ fontSize: fs(20), fontWeight: '900', color: '#F59E0B' }}>
                {ratingScore.toFixed(1)}
              </Text>
            </View>
            <Text style={{ fontSize: fs(11), color: tc.textMuted, fontWeight: '700' }}>
              {profile?.total_reviews || reviewsList.length || 0}{' '}
              {lang === 'en' ? 'reviews' : 'đánh giá'}
            </Text>
          </Card>

          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <Text style={{ fontSize: fs(20), fontWeight: '900', color: tc.text }}>
              {totalCompleted}
            </Text>
            <Text style={{ fontSize: fs(11), color: tc.textMuted, fontWeight: '700' }}>
              {lang === 'en' ? 'Jobs done' : 'Đơn hoàn tất'}
            </Text>
          </Card>

          <Card style={{ flex: 1, alignItems: 'center', padding: 14, gap: 4 }}>
            <Text style={{ fontSize: fs(20), fontWeight: '900', color: COLORS.success }}>
              {profile?.completion_rate == null ? '—' : `${profile.completion_rate}%`}
            </Text>
            <Text style={{ fontSize: fs(11), color: tc.textMuted, fontWeight: '700' }}>
              {lang === 'en' ? 'Completion rate' : 'Tỷ lệ hoàn thành'}
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
            <Text style={{ fontSize: fs(14), fontWeight: '800', color: '#B45309' }}>
              {lang === 'en' ? 'Partner Service Commitment' : 'Cam kết dịch vụ từ đối tác'}
            </Text>
          </View>
          <Text style={{ fontSize: fs(12.5), color: '#92400E', lineHeight: 18 }}>
            {lang === 'en'
              ? `${profile?.completion_rate == null ? '' : `• Job completion rate: ${profile.completion_rate}% (No arbitrary cancellation).\n` }• ${profile?.years_experience ? `Over ${profile.years_experience} years` : 'Proven'} practical experience.\n• Service quality warranty and safety insurance during work.`
              : `${profile?.completion_rate == null ? '' : `• Tỷ lệ hoàn thành công việc: ${profile.completion_rate}% (Không hủy ngang).\n`}• ${profile?.years_experience ? `Hơn ${profile.years_experience} năm` : 'Có'} kinh nghiệm thực tế trong lĩnh vực.\n• Bảo hành chất lượng dịch vụ và bảo hiểm an toàn trong quá trình làm việc.`}
          </Text>
        </Card>

        {/* ── 3. KỸ NĂNG CHUYÊN MÔN ────────────────────────────────────── */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Wrench size={18} color={COLORS.primary} />
            <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
              {lang === 'en' ? 'Specialized Skills' : 'Kỹ năng chuyên sâu'}
            </Text>
          </View>

          {profile?.skills?.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {profile.skills.map((skill: string) => (
                <View
                  key={skill}
                  style={{
                    backgroundColor: tc.subtle,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ fontSize: fs(12.5), fontWeight: '700', color: tc.text }}>
                    ✓ {skill}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {profile?.bio && (
            <>
              <Separator my={4} />
              <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 19 }}>
                {profile.bio}
              </Text>
            </>
          )}
        </Card>

        {/* ── 4. BẢNG GIÁ THAM KHẢO & KHUNG GIỜ HOẠT ĐỘNG ─────────────── */}
        <Card style={{ gap: 10, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Calendar size={18} color={COLORS.primary} />
            <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
              {lang === 'en'
                ? 'Reference Pricing & Working Hours'
                : 'Bảng giá tham khảo & Khung giờ rảnh'}
            </Text>
          </View>

          {pricedServices.length > 0 ? (
            pricedServices.map((s: any) => (
              <View
                key={String(s._id || s.slug || s.name)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: fs(13.5), color: tc.textSecondary }}>
                  {s.name || s.slug}
                </Text>
                <Text style={{ fontSize: fs(14), fontWeight: '800', color: COLORS.primary }}>
                  {formatPriceRange(s)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: fs(13.5), color: tc.textSecondary, paddingVertical: 4 }}>
              {lang === 'en'
                ? 'No price list yet — price is agreed when booking.'
                : 'Chưa cập nhật bảng giá — giá sẽ thỏa thuận khi đặt việc.'}
            </Text>
          )}

          <View
            style={{
              backgroundColor: tc.background,
              padding: 10,
              borderRadius: 8,
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: fs(12.5), color: tc.textSecondary, fontWeight: '600' }}>
              {lang === 'en' ? 'Working hours: ' : 'Khung giờ làm việc: '}
              {availability?.enabled ? (
                <>
                  <Text style={{ color: tc.text, fontWeight: '800' }}>
                    {availability.start_time || '07:00'} – {availability.end_time || '19:00'}
                  </Text>{' '}
                  {availabilityDaysText}
                </>
              ) : (
                <Text style={{ color: tc.text, fontWeight: '800' }}>
                  {lang === 'en'
                    ? 'Flexible — as scheduled when booking'
                    : 'Linh hoạt theo lịch hẹn khi đặt việc'}
                </Text>
              )}
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
              <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
                {lang === 'en' ? 'Customer Reviews' : 'Khách hàng đánh giá'} (
                {profile?.total_reviews || reviewsList.length || 0})
              </Text>
            </View>
            <StarRating rating={ratingScore} />
          </View>

          {reviewsList.length === 0 ? (
            <View
              style={{
                backgroundColor: tc.background,
                padding: 20,
                borderRadius: 14,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: fs(14), fontWeight: '700', color: tc.textSecondary }}>
                {lang === 'en'
                  ? 'No reviews from customers yet'
                  : 'Chưa có đánh giá nào từ khách hàng'}
              </Text>
              <Text
                style={{
                  fontSize: fs(12),
                  color: tc.textMuted,
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                {lang === 'en'
                  ? 'Reviews and ratings after completed jobs will be displayed here.'
                  : 'Các đánh giá và nhận xét sau khi bạn hoàn thành các đơn hàng sẽ được hiển thị đầy đủ tại đây.'}
              </Text>
            </View>
          ) : (
            reviewsList.map((r: any) => (
              <View
                key={r._id}
                style={{ backgroundColor: tc.background, padding: 12, borderRadius: 14, gap: 6 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: fs(14), color: tc.text }}>
                    {r.customer_id?.full_name ||
                      (lang === 'en' ? 'Anonymous Customer' : 'Khách hàng ẩn danh')}
                  </Text>
                  <StarRating rating={r.rating} size={12} />
                </View>
                {r.comment && (
                  <Text style={{ fontSize: fs(13), color: tc.textSecondary, lineHeight: 18 }}>
                    "{r.comment}"
                  </Text>
                )}
                {r.admin_reply && (
                  <View
                    style={{
                      backgroundColor: tc.surface,
                      padding: 8,
                      borderRadius: 8,
                      marginTop: 4,
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.gray[400],
                    }}
                  >
                    <Text
                      style={{ fontSize: fs(12), color: tc.textSecondary, fontStyle: 'italic' }}
                    >
                      {lang === 'en' ? 'Admin replied: ' : 'Admin phản hồi: '}"{r.admin_reply}"
                    </Text>
                  </View>
                )}
                {/* B1: thợ trả lời đánh giá (chỉ chủ hồ sơ, mỗi đánh giá 1 lần) */}
                {isOwnProfile && !r.helper_reply && (
                  <View style={{ marginTop: 6, gap: 8 }}>
                    {replyingId === r._id ? (
                      <>
                        <TextInput
                          value={replyText}
                          onChangeText={setReplyText}
                          placeholder={
                            lang === 'en'
                              ? 'Write your reply to this review...'
                              : 'Viết phản hồi cho đánh giá này...'
                          }
                          placeholderTextColor={COLORS.gray[400]}
                          multiline
                          style={{
                            backgroundColor: tc.surface,
                            borderWidth: 1,
                            borderColor: tc.border,
                            borderRadius: 8,
                            padding: 10,
                            fontSize: fs(13),
                            color: tc.text,
                            minHeight: 64,
                            textAlignVertical: 'top',
                          }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Button
                            title={lang === 'en' ? 'Send reply' : 'Gửi phản hồi'}
                            size="sm"
                            disabled={!replyText.trim() || replyReview.isPending}
                            onPress={() => {
                              replyReview.mutate(
                                { id: r._id, reply: replyText.trim() },
                                {
                                  onSuccess: () => {
                                    setReplyingId(null);
                                    setReplyText('');
                                  },
                                },
                              );
                            }}
                          />
                          <Button
                            title={lang === 'en' ? 'Cancel' : 'Hủy'}
                            variant="outline"
                            size="sm"
                            onPress={() => {
                              setReplyingId(null);
                              setReplyText('');
                            }}
                          />
                        </View>
                      </>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          setReplyingId(r._id);
                          setReplyText('');
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fs(13),
                            fontWeight: '700',
                            color: COLORS.primary,
                          }}
                        >
                          {lang === 'en' ? 'Reply to this review' : 'Trả lời đánh giá này'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <Text style={{ fontSize: fs(11), color: tc.textMuted, marginTop: 2 }}>
                  {formatRelativeTime(r.created_at, lang)}
                </Text>
                {isOwnProfile && r.appeal_status === 'pending' && (
                  <Text style={{ fontSize: fs(12), color: COLORS.primary, marginTop: 4 }}>
                    {lang === 'en'
                      ? 'Appeal pending admin review'
                      : 'Kháng nghị đang chờ quản trị viên xử lý'}
                  </Text>
                )}
                {isOwnProfile && r.appeal_status !== 'pending' && (
                  <>
                    {appealFor === r._id ? (
                      <View style={{ gap: 8, marginTop: 6 }}>
                        <TextInput
                          value={appealReason}
                          onChangeText={setAppealReason}
                          placeholder={
                            lang === 'en'
                              ? 'Reason for appeal...'
                              : 'Lý do kháng nghị đánh giá này...'
                          }
                          multiline
                          style={{
                            borderWidth: 1,
                            borderColor: COLORS.gray[300],
                            borderRadius: 8,
                            padding: 8,
                            fontSize: fs(13),
                            minHeight: 56,
                            textAlignVertical: 'top',
                          }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Button
                            title={lang === 'en' ? 'Send appeal' : 'Gửi kháng nghị'}
                            size="sm"
                            disabled={!appealReason.trim() || appealReview.isPending}
                            onPress={() => {
                              appealReview.mutate(
                                { reviewId: r._id, reason: appealReason.trim() },
                                { onSuccess: () => { setAppealFor(null); setAppealReason(''); } },
                              );
                            }}
                          />
                          <Button
                            title={lang === 'en' ? 'Cancel' : 'Huỷ'}
                            size="sm"
                            variant="outline"
                            onPress={() => { setAppealFor(null); setAppealReason(''); }}
                          />
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setAppealFor(r._id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: fs(13), color: COLORS.primary, fontWeight: '700', marginTop: 4 }}>
                          {lang === 'en' ? 'Appeal this review' : 'Kháng nghị đánh giá này'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* ── Bottom Floating Bar: Nhắn tin / Thuê thợ ─────────────────── */}
      {!isOwnProfile && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: tc.surface,
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: tc.border,
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
            title={lang === 'en' ? 'Chat with helper' : 'Nhắn tin với thợ'}
            variant="outline"
            style={{ flex: 1 }}
            icon={<MessageCircle size={18} color={COLORS.primary} />}
            onPress={handleMessageHelper}
          />
          <Button
            title={
              quoteId
                ? lang === 'en'
                  ? 'Accept quote'
                  : 'Chấp nhận báo giá'
                : lang === 'en'
                  ? 'Hire this helper'
                  : 'Thuê thợ này'
            }
            style={{ flex: 1 }}
            loading={selectQuote.isPending}
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={handleHireHelper}
          />
          {isCustomer && !quoteId && (
            <Button
              title={lang === 'en' ? 'Monthly contract' : 'Thuê theo tháng'}
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
