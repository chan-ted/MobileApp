import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Renders the bottom tabs group */}
      <Stack.Screen name="(tabs)" />
      
      {/* Renders create-event as a modal overlay on top of tabs */}
      <Stack.Screen 
        name="create-event" 
        options={{ 
          presentation: 'modal', 
          headerShown: true, 
          title: 'Create Event' 
        }} 
      />
    </Stack>
  );
}