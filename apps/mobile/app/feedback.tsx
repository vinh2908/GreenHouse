import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Card } from '@/components/ui';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useTranslation } from '@/hooks/use-i18n';

export default function FeedbackScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { t, fs, lang } = useTranslation();
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
        title={lang === 'en' ? 'Back' : 'Quay lại'}
        variant="outline"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/profile'))}
      />
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700' }}>
        {lang === 'en' ? 'App Feedback' : 'Góp ý ứng dụng'}
      </Text>
      <Text>
        {lang === 'en'
          ? 'Report a bug or suggest improvements. Your message is delivered to administrators.'
          : 'Gửi lỗi bạn gặp hoặc đề xuất cải thiện. Nội dung được gửi đến quản trị viên.'}
      </Text>
      {!user ? (
        <Button
          title={lang === 'en' ? 'Log in to send feedback' : 'Đăng nhập để gửi góp ý'}
          onPress={() => router.push('/(auth)/login')}
        />
      ) : (
        <>
          <Input
            label={lang === 'en' ? 'Feedback content' : 'Nội dung góp ý'}
            multiline
            value={message}
            onChangeText={v => {
              setMessage(v);
              setSent(false);
            }}
            maxLength={2000}
            placeholder={
              lang === 'en'
                ? 'Describe in at least 10 characters'
                : 'Mô tả ít nhất 10 ký tự'
            }
          />
          <Button
            title={lang === 'en' ? 'Send feedback' : 'Gửi góp ý'}
            loading={submit.isPending}
            disabled={message.trim().length < 10}
            onPress={() => submit.mutate()}
          />
          {sent && (
            <Text accessibilityRole="alert">
              {lang === 'en' ? 'Feedback sent. Thank you!' : 'Đã gửi góp ý. Cảm ơn bạn!'}
            </Text>
          )}
          {submit.isError && (
            <Text accessibilityRole="alert">
              {lang === 'en'
                ? 'Failed to send feedback. Your text is kept so you can try again.'
                : 'Chưa gửi được góp ý. Nội dung vẫn được giữ để bạn thử lại.'}
            </Text>
          )}
          <Text style={{ fontWeight: '700' }}>
            {lang === 'en' ? 'Submitted feedback' : 'Góp ý đã gửi'}
          </Text>
          {history.isError && (
            <Button
              title={lang === 'en' ? 'Reload feedback' : 'Tải lại góp ý'}
              onPress={() => history.refetch()}
            />
          )}
          {history.data?.map((item: any) => (
            <Card key={item._id}>
              <Text>{item.message}</Text>
              <Text>
                {item.status === 'resolved'
                  ? lang === 'en'
                    ? 'Resolved'
                    : 'Đã xử lý'
                  : lang === 'en'
                    ? 'Pending'
                    : 'Đang chờ xử lý'}
              </Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
