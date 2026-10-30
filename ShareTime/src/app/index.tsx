import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login' as any);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to the App! 🎉</Text>
      <Text style={styles.subtitle}>You are successfully logged in.</Text>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
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