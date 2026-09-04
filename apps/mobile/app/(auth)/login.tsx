import { View, Text, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import { Link } from 'expo-router';

export default function LoginScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 justify-center">
        {/* Logo */}
        <View className="items-center mb-10">
          <View className="w-20 h-20 rounded-2xl bg-primary items-center justify-center mb-4">
            <Text className="text-white font-bold text-3xl">H</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-900">HomeMate</Text>
          <Text className="text-gray-500 mt-1">Giúp việc nhà chuyên nghiệp</Text>
        </View>

        {/* Form */}
        <View className="space-y-4">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-2">Số điện thoại</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50"
              placeholder="0xxx xxx xxx"
              keyboardType="phone-pad"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-2">Mật khẩu</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50"
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          <TouchableOpacity className="items-end">
            <Link href="/(auth)/forgot-password">
              <Text className="text-primary text-sm">Quên mật khẩu?</Text>
            </Link>
          </TouchableOpacity>

          <TouchableOpacity className="bg-primary rounded-xl py-4 items-center mt-2">
            <Text className="text-white font-semibold text-base">Đăng nhập</Text>
          </TouchableOpacity>
        </View>

        {/* Register */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-gray-500">Chưa có tài khoản? </Text>
          <Link href="/(auth)/register">
            <Text className="text-primary font-semibold">Đăng ký ngay</Text>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
