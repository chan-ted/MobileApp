import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  ScrollView 
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase'; // Adjust path if your supabase client is located elsewhere

export default function CreateEventScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreateEvent() {
    // 1. Basic validation
    if (!title.trim() || !startTime.trim() || !endTime.trim()) {
      Alert.alert('Missing Fields', 'Please fill in the title, start time, and end time.');
      return;
    }

    setLoading(true);

    try {
      // 2. Get the currently logged-in user to assign as the creator
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert('Authentication Error', 'You must be logged in to create an event.');
        setLoading(false);
        return;
      }

      // 3. Insert into Supabase 'events' table
      const { error } = await supabase.from('events').insert({
        title,
        description,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        created_by: user.id, // Links directly to auth.users(id)
      });

      if (error) {
        throw error;
      }

      Alert.alert('Success!', 'Event created successfully.', [
        { text: 'OK', onPress: () => router.back() } // Go back to the previous screen
      ]);

    } catch (error: any) {
      Alert.alert('Error Creating Event', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Create New Event</Text>

      <Text style={styles.label}>Event Title *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Friday Team Dinner"
        placeholderTextColor="#888"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Add optional notes, location, or details..."
        placeholderTextColor="#888"
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.label}>Start Time (ISO Format) *</Text>
      <TextInput
        style={styles.input}
        placeholder="2026-11-10T18:00:00Z"
        placeholderTextColor="#888"
        value={startTime}
        onChangeText={setStartTime}
      />

      <Text style={styles.label}>End Time (ISO Format) *</Text>
      <TextInput
        style={styles.input}
        placeholder="2026-11-10T20:00:00Z"
        placeholderTextColor="#888"
        value={endTime}
        onChangeText={setEndTime}
      />

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleCreateEvent}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Save Event</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#FFF', flexGrow: 1 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
    marginBottom: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});