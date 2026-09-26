import { Stack } from 'expo-router';
import { AppThemeProvider } from '../lib/app-theme';
import { MotionProvider } from '../lib/motion';

export default function RootLayout() {
  return <MotionProvider><AppThemeProvider><Stack screenOptions={{ headerShown: false }} /></AppThemeProvider></MotionProvider>;
}
