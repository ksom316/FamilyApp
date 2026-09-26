import { Stack } from 'expo-router';
import { AppThemeProvider } from '../lib/app-theme';
import { MotionProvider } from '../lib/motion';
import { PushNotificationsProvider } from '../components/PushNotificationsProvider';

export default function RootLayout() {
  return <MotionProvider><AppThemeProvider><PushNotificationsProvider><Stack screenOptions={{ headerShown: false }} /></PushNotificationsProvider></AppThemeProvider></MotionProvider>;
}
