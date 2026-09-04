import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';

const SERVICES = [
  { id: '1', name: 'Giúp việc theo giờ', icon: '🧹', color: '#FFF3E8' },
  { id: '2', name: 'Giúp việc theo ngày', icon: '📅', color: '#E8F4FF' },
  { id: '3', name: 'Tổng vệ sinh nhà', icon: '🏠', color: '#E8FFE8' },
  { id: '4', name: 'Giúp việc định kỳ', icon: '🔄', color: '#FFE8F0' },
  { id: '5', name: 'Nấu ăn gia đình', icon: '🍳', color: '#FFF8E8' },
];

export default function CustomerHomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView>
        {/* Header */}
        <View className="bg-primary px-6 pt-6 pb-10">
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text className="text-white text-sm opacity-80">Xin chào 👋</Text>
              <Text className="text-white text-xl font-bold mt-1">Bạn cần giúp gì hôm nay?</Text>
            </View>
            <TouchableOpacity className="w-10 h-10 rounded-full bg-white/20 items-center justify-center">
              <Text className="text-white text-lg">🔔</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar placeholder */}
          <TouchableOpacity className="bg-white rounded-xl px-4 py-3 flex-row items-center mt-2">
            <Text className="text-gray-400 flex-1">Tìm kiếm dịch vụ...</Text>
            <Text>🔍</Text>
          </TouchableOpacity>
        </View>

        {/* Services */}
        <View className="px-6 -mt-4">
          <View className="bg-white rounded-2xl p-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 mb-4">Dịch vụ</Text>
            <View className="flex-row flex-wrap gap-3">
              {SERVICES.map(service => (
                <TouchableOpacity
                  key={service.id}
                  className="items-center w-[48%] rounded-xl p-4"
                  style={{ backgroundColor: service.color }}
                >
                  <Text className="text-3xl mb-2">{service.icon}</Text>
                  <Text className="text-xs font-medium text-gray-700 text-center">
                    {service.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Recent bookings placeholder */}
        <View className="px-6 mt-4 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Đơn gần đây</Text>
          <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
            <Text className="text-3xl mb-2">📋</Text>
            <Text className="text-gray-500 text-sm">Bạn chưa có đơn nào</Text>
            <TouchableOpacity className="mt-3 bg-primary rounded-xl px-6 py-2">
              <Text className="text-white font-medium text-sm">Đặt lịch ngay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
