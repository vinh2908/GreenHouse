import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Card } from '@/components/ui';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';

export default function FeedbackScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const history = useQuery({
    queryKey: ['feedback', 'my'],
    enabled: !!user,
    queryFn: async () => (await apiClient.get('/feedback/my')).data.data,
  });
  const submit = useMutation({
    mutationFn: () => apiClient.post('/feedback', { message: message.trim() }),
    onSuccess: () => {
      setMessage('');
      setSent(true);
      qc.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 56, gap: 16 }}>
      <Button
        title="Quay lại"
        variant="outline"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/profile'))}
      />
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700' }}>
        Góp ý ứng dụng
      </Text>
      <Text>Gửi lỗi bạn gặp hoặc đề xuất cải thiện. Nội dung được gửi đến quản trị viên.</Text>
      {!user ? (
        <Button title="Đăng nhập để gửi góp ý" onPress={() => router.push('/(auth)/login')} />
      ) : (
        <>
          <Input
            label="Nội dung góp ý"
            multiline
            value={message}
            onChangeText={v => {
              setMessage(v);
              setSent(false);
            }}
            maxLength={2000}
            placeholder="Mô tả ít nhất 10 ký tự"
          />
          <Button
            title="Gửi góp ý"
            loading={submit.isPending}
            disabled={message.trim().length < 10}
            onPress={() => submit.mutate()}
          />
          {sent && <Text accessibilityRole="alert">Đã gửi góp ý. Cảm ơn bạn!</Text>}
          {submit.isError && (
            <Text accessibilityRole="alert">
              Chưa gửi được góp ý. Nội dung vẫn được giữ để bạn thử lại.
            </Text>
          )}
          <Text style={{ fontWeight: '700' }}>Góp ý đã gửi</Text>
          {history.isError && <Button title="Tải lại góp ý" onPress={() => history.refetch()} />}
          {history.data?.map((item: any) => (
            <Card key={item._id}>
              <Text>{item.message}</Text>
              <Text>{item.status === 'resolved' ? 'Đã xử lý' : 'Đang chờ xử lý'}</Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
