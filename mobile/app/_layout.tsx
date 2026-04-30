import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { getDb } from '../src/db';

export default function RootLayout() {
  useEffect(() => {
    void getDb();
  }, []);
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: 'white' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="investigations/index" options={{ title: 'Investigations' }} />
        <Stack.Screen name="investigations/[id]" options={{ title: 'Investigation' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
