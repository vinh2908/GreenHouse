import { Redirect } from 'expo-router';

export default function Index() {
  // TODO: Check auth state and redirect accordingly
  // For now, redirect to login
  return <Redirect href="/(auth)/login" />;
}
