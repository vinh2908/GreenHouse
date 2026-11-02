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
import apiClient from '@/services/api-client';
import { Avatar, Card, COLORS, EmptyState, LoadingSpinner } from '@/components/ui';

function helperOf(fav: FavoriteHelperItem) {
  return typeof fav.helper_id === 'object' && fav.helper_id ? fav.helper_id : null;
}

export default function FavoriteHelpersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: favorites, isLoading, isRefetching, refetch } = useFavorites();
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
        favorite_helper_name: helper.full_name ?? 'Thợ yêu thích',
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
      Alert.alert(
        'Đặt lại việc với thợ này?',
        `Đơn mới sẽ giống đơn "${lastJob.title}" (ngày mai, ${
          lastJob.preferred_time_start ?? '09:00'
        }) và được ưu tiên gửi riêng cho ${helper.full_name ?? 'thợ'} trong 24 giờ.`,
        [
          { text: 'Để sau', style: 'cancel' },
          {
            text: 'Đặt lại ngay',
            onPress: async () => {
              try {
                const res = await rebookJob.mutateAsync({ sourceJobId: lastJob._id });
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
        text1: 'Chưa có đơn hoàn thành với thợ này',
        text2: 'Hãy dùng "Đặt việc mới" để tạo đơn đầu tiên với thợ.',
      });
    }
  };

  const handleRemove = (fav: FavoriteHelperItem) => {
    const helper = helperOf(fav);
    if (!helper) return;
    Alert.alert(
      'Bỏ thợ yêu thích?',
      `Bỏ ${helper.full_name ?? 'thợ này'} khỏi danh sách yêu thích?`,
      [
        { text: 'Ở lại', style: 'cancel' },
        {
          text: 'Bỏ yêu thích',
          style: 'destructive',
          onPress: () => removeFavorite.mutate(helper._id),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray[900] }}>
            Thợ yêu thích ❤️
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.gray[500] }}>
            Đặt việc nhanh và ưu tiên gửi riêng cho thợ quen
          </Text>
        </View>
      </View>

      {isLoading ? (
        <LoadingSpinner />
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
              emoji="❤️"
              title="Chưa có thợ yêu thích"
              subtitle="Khi gặp thợ làm tốt, hãy bấm trái tim ở hồ sơ thợ hoặc ở đơn đã hoàn thành để lưu lại và đặt việc nhanh lần sau."
              action="Đăng việc ngay"
              onAction={() => router.push('/(customer)/booking')}
            />
          ) : (
            (favorites ?? []).map(fav => {
              const helper = helperOf(fav);
              if (!helper) return null;
              const p = fav.helper_profile;
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
                      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.gray[900] }}>
                        {helper.full_name ?? 'Thợ'}
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
                            style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.gray[700] }}
                          >
                            {(p?.rating ?? 0).toFixed(1)} ({p?.total_reviews ?? 0})
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Briefcase size={13} color={COLORS.gray[500]} />
                          <Text style={{ fontSize: 12.5, color: COLORS.gray[600] }}>
                            {p?.completed_jobs ?? 0} đơn đã xong
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
                        borderRadius: 10,
                      }}
                    >
                      <RotateCcw size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        Đặt lại 1 chạm
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
                        borderRadius: 10,
                      }}
                    >
                      <CalendarPlus size={15} color={COLORS.primaryDark} />
                      <Text style={{ color: COLORS.primaryDark, fontWeight: '700', fontSize: 13 }}>
                        Đặt việc mới
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
