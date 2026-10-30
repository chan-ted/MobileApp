import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AnimatedSplashOverlay } from '@/components/animated-icon'; // Adjust path if needed

export default function HomeScreen() {
  const router = useRouter();
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  useEffect(() => {
    // Hide the splash overlay after your animation completes (e.g., 2 seconds)
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login' as any);
  }

  return (
    <View style={styles.container}>
      {/* Main Screen Content */}
      <Text style={styles.title}>Welcome to the App! 🎉</Text>
      <Text style={styles.subtitle}>You are successfully logged in.</Text>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>

      {/* Conditional Splash Animation Overlay on top */}
      {isSplashVisible && (
        <View style={styles.overlayContainer}>
          <AnimatedSplashOverlay />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 24,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#FFFFFF', // Optional: add a background so it covers what's underneath while animating
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});