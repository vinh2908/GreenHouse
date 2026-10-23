import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';

export default function ChatIndexScreen() {
  const user = useAuthStore(s => s.user);

  if (user?.active_role === 'helper') {
    return <Redirect href={'/(helper)/messages' as any} />;
  }
  return <Redirect href={'/(customer)/messages' as any} />;
}
