import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: 'white',
        tabBarActiveTintColor: '#0f172a',
      }}
    >
      <Tabs.Screen name="scan" options={{ title: 'Audit' }} />
      <Tabs.Screen name="reconciliation" options={{ title: 'Reconciliation' }} />
      <Tabs.Screen name="investigations" options={{ title: 'Investigations' }} />
    </Tabs>
  );
}
