import { View, Text, ScrollView, TouchableOpacity, Switch, SafeAreaView } from 'react-native';
import { useState } from 'react';

export default function HelperDashboardScreen() {
  const [isOnline, setIsOnline] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView>
        {/* Header */}
        <View className="bg-primary px-6 pt-6 pb-10">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white text-sm opacity-80">Xin chào 👋</Text>
              <Text className="text-white text-xl font-bold mt-1">Dashboard</Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-xs mb-2">
                {isOnline ? 'Đang nhận việc' : 'Ngoại tuyến'}
              </Text>
              <Switch
                value={isOnline}
                onValueChange={setIsOnline}
                trackColor={{ false: '#ffffff50', true: '#ffffff' }}
                thumbColor={isOnline ? '#FF6B1A' : '#f4f3f4'}
              />
            </View>
          </View>
        </View>

        {/* Stats */}
        <View className="px-6 -mt-4">
          <View className="bg-white rounded-2xl p-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 mb-4">Thống kê hôm nay</Text>
            <View className="flex-row justify-between">
              <StatCard label="Đơn hoàn thành" value="0" />
              <StatCard label="Thu nhập" value="0₫" />
              <StatCard label="Đánh giá" value="5.0" />
            </View>
          </View>
        </View>

        {/* Available jobs placeholder */}
        <View className="px-6 mt-4 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Đơn có thể nhận</Text>
          {!isOnline ? (
            <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
              <Text className="text-3xl mb-2">📴</Text>
              <Text className="text-gray-500 text-sm text-center">
                Bật trạng thái online để nhận đơn
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
              <Text className="text-3xl mb-2">🔍</Text>
              <Text className="text-gray-500 text-sm">Đang tìm đơn phù hợp...</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">{label}</Text>
    </View>
  );
}
