import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase'; // Adjust import path to your supabase client

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle Log In
  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', error.message);
    } else {
      // Navigate to main app screen and clear navigation history
      router.replace('/');
    }
  }

  // Optional: Handle Sign Up redirection or quick registration
  async function handleSignUp() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter an email and password to register.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else if (data.session) {
      // User is logged in immediately
      router.replace('/');
    } else {
      // Email confirmation is required by default in Supabase
      Alert.alert('Check your email!', 'Please check your inbox to confirm your account.');
    }
  }

  
  return (
    <View style={{ flex: 1, backgroundColor: '#E0F2FE', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#0F172A', marginBottom: 20 }}>
        TEST LOGIN SCREEN
      </Text>

      {/* Email Input */}
      <TextInput
        style={{
          height: 52,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#0284C7',
          borderRadius: 8,
          paddingHorizontal: 16,
          fontSize: 16,
          marginBottom: 16,
          color: '#000000',
        }}
        placeholder="Email address"
        placeholderTextColor="#64748B"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      {/* Password Input */}
      <TextInput
        style={{
          height: 52,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#0284C7',
          borderRadius: 8,
          paddingHorizontal: 16,
          fontSize: 16,
          marginBottom: 16,
          color: '#000000',
        }}
        placeholder="Password"
        placeholderTextColor="#64748B"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Action Button */}
      <TouchableOpacity
        style={{
          height: 52,
          backgroundColor: '#0284C7',
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={handleLogin}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Log In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  input: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    marginBottom: 16,
    color: '#1A1A1A',
  },
  buttonPrimary: {
    height: 52,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSecondaryText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
});