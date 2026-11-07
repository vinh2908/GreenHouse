import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Heart, Star, Briefcase, CalendarPlus, RotateCcw } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { Alert } from '@/components/common/app-alert';
import {
  useFavorites,
  useRemoveFavorite,
  useRebookJob,
  type FavoriteHelperItem,
} from '@/hooks/use-api';
import { useTranslation } from '@/hooks/use-i18n';
import { useAuthStore } from '@/stores/auth.store';
import apiClient from '@/services/api-client';
import { Avatar, Card, COLORS, EmptyState, ErrorState, LoadingSpinner, useThemeColors } from '@/components/ui';

function helperOf(fav: FavoriteHelperItem) {
  return typeof fav.helper_id === 'object' && fav.helper_id ? fav.helper_id : null;
}

function helperIdOf(fav: FavoriteHelperItem): string | undefined {
  return typeof fav.helper_id === 'string' ? fav.helper_id : fav.helper_id?._id;
}

// P2-5: giờ đặt lại phải qua gate 07:00–22:00 của backend
// (assertWorkingHoursStart) — kẹp về khung giờ hợp lệ thay vì hứa một giờ
// mà "Đặt lại ngay" sẽ bị từ chối (vd. đơn gốc 22:30 → 22:00).
function clampToWorkingHours(time: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!m) return '09:00';
  const mins = Number(m[1]) * 60 + Number(m[2]);
  const clamped = Math.min(Math.max(mins, 7 * 60), 22 * 60);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export default function FavoriteHelpersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, fs, lang } = useTranslation();
  const tc = useThemeColors();
  const { data: favorites, isLoading, isError, isRefetching, refetch } = useFavorites();
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const removeFavorite = useRemoveFavorite();
  const rebookJob = useRebookJob();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(customer)/profile');
  };

  // Đặt việc mới: mở màn hình Đăng việc, chọn sẵn thợ yêu thích để gửi riêng
  const handleBookWithHelper = (fav: FavoriteHelperItem) => {
    const helper = helperOf(fav);
    if (!helper) return;
    router.push({
      pathname: '/(customer)/booking',
      params: {
        favorite_helper_id: helper._id,
        favorite_helper_name:
          helper.full_name ?? (lang === 'en' ? 'Favorite Helper' : 'Thợ yêu thích'),
      },
    });
  };

  // Đặt lại 1 chạm: tạo đơn mới từ đơn hoàn thành gần nhất với thợ này
  const handleRebook = async (fav: FavoriteHelperItem) => {
    const helper = helperOf(fav);
    if (!helper) return;
    try {
      const { data } = await apiClient.get(
        `/customers/me/favorites/${helper._id}/last-completed-job`,
      );
      const lastJob = data.data;
      const effectiveTime = clampToWorkingHours(lastJob.preferred_time_start);
      Alert.alert(
        lang === 'en' ? 'Rebook with this helper?' : 'Đặt lại việc với thợ này?',
        lang === 'en'
          ? `New job will be similar to "${lastJob.title}" (tomorrow, ${effectiveTime}) and prioritized exclusively for ${helper.full_name ?? 'helper'} for 24 hours.`
          : `Đơn mới sẽ giống đơn "${lastJob.title}" (ngày mai, ${effectiveTime}) và được ưu tiên gửi riêng cho ${helper.full_name ?? 'thợ'} trong 24 giờ.`,
        [
          { text: lang === 'en' ? 'Not now' : 'Để sau', style: 'cancel' },
          {
            text: lang === 'en' ? 'Rebook Now' : 'Đặt lại ngay',
            onPress: async () => {
              try {
                const res = await rebookJob.mutateAsync({
                  sourceJobId: lastJob._id,
                  preferred_time_start: effectiveTime,
                });
                const newJob = (res as any)?.data?.data;
                if (newJob?._id) {
                  router.push({ pathname: '/job-detail/[id]', params: { id: newJob._id } });
                } else {
                  router.push('/(customer)/jobs');
                }
              } catch {
                // Toast lỗi đã được hook hiển thị
              }
            },
          },
        ],
      );
    } catch {
      Toast.show({
        type: 'info',
        text1:
          lang === 'en'
            ? 'No completed job with this helper yet'
            : 'Chưa có đơn hoàn thành với thợ này',
        text2:
          lang === 'en'
            ? 'Use "Book New Job" to create your first order with this helper.'
            : 'Hãy dùng "Đặt việc mới" để tạo đơn đầu tiên với thợ.',
      });
    }
  };

  const handleRemove = (fav: FavoriteHelperItem) => {
    const helper = helperOf(fav);
    const helperId = helperIdOf(fav);
    if (!helperId) return;
    Alert.alert(
      lang === 'en' ? 'Remove favorite helper?' : 'Bỏ thợ yêu thích?',
      lang === 'en'
        ? `Remove ${helper?.full_name ?? 'this helper'} from your favorites list?`
        : `Bỏ ${helper?.full_name ?? 'thợ này'} khỏi danh sách yêu thích?`,
      [
        { text: lang === 'en' ? 'Stay' : 'Ở lại', style: 'cancel' },
        {
          text: lang === 'en' ? 'Remove' : 'Bỏ yêu thích',
          style: 'destructive',
          onPress: () => removeFavorite.mutate(helperId),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: tc.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', color: tc.text }}>
            {lang === 'en' ? 'Favorite Helpers' : 'Thợ yêu thích'}
          </Text>
          <Text style={{ fontSize: fs(12), color: tc.textMuted }}>
            {lang === 'en'
              ? 'Quick rebooking and exclusive dispatch priority for trusted helpers'
              : 'Đặt việc nhanh và ưu tiên gửi riêng cho thợ quen'}
          </Text>
        </View>
      </View>

      {isError ? (
        <ErrorState
          title={
            lang === 'en'
              ? 'Unable to load favorite helpers'
              : 'Không thể tải danh sách thợ yêu thích'
          }
          subtitle={
            lang === 'en'
              ? 'Could not connect to server. Please check your network and retry.'
              : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.'
          }
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !isAuth ? (
        <EmptyState
          icon={<Heart size={36} color={COLORS.gray[400]} />}
          title={lang === 'en' ? 'Log in to see favorite helpers' : 'Đăng nhập để xem thợ yêu thích'}
          subtitle={
            lang === 'en'
              ? 'Log in to save helpers you trust and rebook them in one tap.'
              : 'Đăng nhập để lưu thợ quen và đặt lại việc với họ chỉ bằng một chạm.'
          }
          action={lang === 'en' ? 'Log in' : 'Đăng nhập'}
          onAction={() => router.push('/(auth)/login')}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[COLORS.primary]}
            />
          }
        >
          {(favorites ?? []).length === 0 ? (
            <EmptyState
              icon={<Heart size={36} color={COLORS.gray[400]} />}
              title={lang === 'en' ? 'No favorite helpers yet' : 'Chưa có thợ yêu thích'}
              subtitle={
                lang === 'en'
                  ? 'When you find a great helper, tap the heart icon on their profile or on a completed job to save them for easy rebooking.'
                  : 'Khi gặp thợ làm tốt, hãy bấm trái tim ở hồ sơ thợ hoặc ở đơn đã hoàn thành để lưu lại và đặt việc nhanh lần sau.'
              }
              action={lang === 'en' ? 'Post a Job Now' : 'Đăng việc ngay'}
              onAction={() => router.push('/(customer)/booking')}
            />
          ) : (
            (favorites ?? []).map(fav => {
              const helper = helperOf(fav);
              // P2-7: thợ đã xóa / không populate được thì hiện hàng "không còn
              // khả dụng" thay vì lặng lẽ nuốt mất, kèm nút bỏ yêu thích.
              if (!helper) {
                return (
                  <Card key={fav._id} style={{ gap: 8 }}>
                    <View
                      style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
                    >
                      <Avatar name="?" size={54} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}>
                          {lang === 'en' ? 'Helper no longer available' : 'Thợ không còn khả dụng'}
                        </Text>
                        <Text style={{ fontSize: fs(12.5), color: tc.textMuted, marginTop: 3 }}>
                          {lang === 'en'
                            ? 'This helper profile could not be loaded. You can remove them from favorites.'
                            : 'Không tải được hồ sơ thợ này. Bạn có thể bỏ thợ khỏi danh sách yêu thích.'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemove(fav)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Heart size={20} color="#EC4899" fill="#EC4899" />
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              }
              const p = fav.helper_profile;
              const hasReviews = (p?.total_reviews ?? 0) > 0 && typeof p?.rating === 'number';
              return (
                <Card key={fav._id} style={{ gap: 12 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: '/helper-profile/[id]',
                        params: { id: helper._id },
                      })
                    }
                    style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
                  >
                    <Avatar name={helper.full_name} uri={helper.avatar} size={54} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: fs(16), fontWeight: '800', color: tc.text }}
                      >
                        {helper.full_name ?? (lang === 'en' ? 'Helper' : 'Thợ')}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          marginTop: 3,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Star size={13} color="#F59E0B" fill="#F59E0B" />
                          <Text
                            style={{
                              fontSize: fs(12.5),
                              fontWeight: '700',
                              color: tc.textSecondary,
                            }}
                          >
                            {hasReviews
                              ? `${(p?.rating ?? 0).toFixed(1)} (${p?.total_reviews ?? 0})`
                              : lang === 'en'
                                ? 'No reviews yet'
                                : 'Chưa có đánh giá'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Briefcase size={13} color={COLORS.gray[500]} />
                          <Text style={{ fontSize: fs(12.5), color: tc.textSecondary }}>
                            {(p?.completed_jobs ?? 0) +
                              (lang === 'en' ? ' jobs done' : ' đơn đã xong')}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(fav)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Heart size={20} color="#EC4899" fill="#EC4899" />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleRebook(fav)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: COLORS.primary,
                        paddingVertical: 10,
                        borderRadius: 8,
                      }}
                    >
                      <RotateCcw size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(13) }}>
                        {lang === 'en' ? '1-Tap Rebook' : 'Đặt lại 1 chạm'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleBookWithHelper(fav)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: COLORS.primaryLight,
                        paddingVertical: 10,
                        borderRadius: 8,
                      }}
                    >
                      <CalendarPlus size={15} color={COLORS.primaryDark} />
                      <Text
                        style={{ color: COLORS.primaryDark, fontWeight: '700', fontSize: fs(13) }}
                      >
                        {lang === 'en' ? 'Book New Job' : 'Đặt việc mới'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
