import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// Prevent native splash screen from auto-hiding immediately
SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Hide the native splash screen as soon as the tabs mount
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF', headerShown: false }}>
        {/* Tab 1: Event Schedule / Home */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Events',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color as any} />
            ),
          }}
        />

        {/* Tab 2: Messages */}
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color as any} />
            ),
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}