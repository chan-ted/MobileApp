import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function CreateEventScreen() {
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Start and End Date States
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 60 * 60 * 1000)); // Default +1 hour
  
  // Picker Control States
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');

  const openPicker = (field: 'start' | 'end', mode: 'date' | 'time') => {
    setActiveField(field);
    setPickerMode(mode);
    setShowPicker(true);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      if (activeField === 'start') {
        setStartDate(selectedDate);
        // If end date is now before the new start date, automatically push end date forward 1 hour
        if (selectedDate >= endDate) {
          setEndDate(new Date(selectedDate.getTime() + 60 * 60 * 1000));
        }
      } else {
        setEndDate(selectedDate);
      }
    }
  };

  async function handleCreateEvent() {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an event title.');
      return;
    }

    if (endDate <= startDate) {
      Alert.alert('Error', 'End time must be after the start time.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('events').insert({
        title,
        description,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        created_by: user.id,
      });

      if (error) throw error;
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Create New Event</Text>

      <Text style={styles.label}>Event Title</Text>
      <TextInput 
        style={styles.input} 
        placeholder="e.g., Team Sync" 
        placeholderTextColor="#999"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput 
        style={[styles.input, styles.textArea]} 
        placeholder="Optional details..." 
        placeholderTextColor="#999"
        multiline
        value={description}
        onChangeText={setDescription}
      />

      {/* Start Date & Time Section */}
      <Text style={styles.label}>Start Time</Text>
      <View style={styles.dateTimeRow}>
        <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('start', 'date')}>
          <Text style={styles.pickerButtonText}>📅 {startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('start', 'time')}>
          <Text style={styles.pickerButtonText}>🕒 {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
      </View>

      {/* End Date & Time Section */}
      <Text style={styles.label}>End Time</Text>
      <View style={styles.dateTimeRow}>
        <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('end', 'date')}>
          <Text style={styles.pickerButtonText}>📅 {endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('end', 'time')}>
          <Text style={styles.pickerButtonText}>🕒 {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Native Picker Component (Shared for both Start and End) */}
      {showPicker && (
        <DateTimePicker
          value={activeField === 'start' ? startDate : endDate}
          mode={pickerMode}
          display="default"
          onChange={onDateChange}
        />
      )}

      <TouchableOpacity style={styles.submitButton} onPress={handleCreateEvent}>
        <Text style={styles.submitButtonText}>Save Event</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F8F9FA', flexGrow: 1, paddingTop: 60 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF', padding: 12, borderRadius: 8, fontSize: 15, color: '#111' },
  textArea: { height: 80, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  pickerButton: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF', padding: 14, borderRadius: 8, alignItems: 'center' },
  pickerButtonText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  submitButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});