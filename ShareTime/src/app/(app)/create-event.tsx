import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  id: string;
  email: string;
  full_name?: string;
};

export default function CreateEventScreen() {
  const router = useRouter();
  
  // Core Event Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  
  // Date/Time Picker States
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');

  // Participant Search & Selection States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Picker Helpers ---
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
        if (selectedDate >= endDate) {
          setEndDate(new Date(selectedDate.getTime() + 60 * 60 * 1000));
        }
      } else {
        setEndDate(selectedDate);
      }
    }
  };

  // --- Participant Search & Selection Logic ---
  async function handleSearch(text: string) {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .ilike('email', `%${text.trim()}%`)
        .neq('id', user?.id || '') // Exclude current user
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err: any) {
      console.error('Error searching profiles:', err.message);
    } finally {
      setIsSearching(false);
    }
  }

  function addParticipant(profile: Profile) {
    if (selectedParticipants.some(p => p.id === profile.id)) {
      Alert.alert('Notice', 'User is already added.');
      return;
    }
    setSelectedParticipants([...selectedParticipants, profile]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeParticipant(id: string) {
    setSelectedParticipants(selectedParticipants.filter(p => p.id !== id));
  }

  // --- Submit & Save Event + Participants ---
  async function handleCreateEvent() {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an event title.');
      return;
    }

    if (endDate <= startDate) {
      Alert.alert('Error', 'End time must be after the start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Create the Event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
          title,
          description,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 2. Batch-insert Invited Participants into event_participants junction table
      if (selectedParticipants.length > 0) {
        const participantRows = selectedParticipants.map(profile => ({
          event_id: eventData.id,
          user_id: profile.id,
          status: 'pending',
        }));

        const { error: participantError } = await supabase
          .from('event_participants')
          .insert(participantRows);

        if (participantError) throw participantError;
      }

      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView 
        contentContainerStyle={styles.container} 
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headerTitle}>Create New Event</Text>

        {/* Event Details */}
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

        {/* Date & Time Selectors */}
        <Text style={styles.label}>Start Time</Text>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('start', 'date')}>
            <Text style={styles.pickerButtonText}>📅 {startDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('start', 'time')}>
            <Text style={styles.pickerButtonText}>🕒 {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>End Time</Text>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('end', 'date')}>
            <Text style={styles.pickerButtonText}>📅 {endDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('end', 'time')}>
            <Text style={styles.pickerButtonText}>🕒 {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        </View>

        {showPicker && (
          <DateTimePicker
            value={activeField === 'start' ? startDate : endDate}
            mode={pickerMode}
            display="default"
            onChange={onDateChange}
          />
        )}

        {/* --- Participants Section --- */}
        <Text style={styles.label}>Add Participants</Text>
        
        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#888" style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search user by email..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
          />
          {isSearching && <ActivityIndicator size="small" color="#007AFF" />}
        </View>

        {/* Dropdown Search Results */}
        {searchResults.length > 0 && (
          <View style={styles.resultsContainer}>
            {searchResults.map(item => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.resultItem}
                onPress={() => addParticipant(item)}
              >
                <View>
                  <Text style={styles.resultEmail}>{item.email}</Text>
                  {item.full_name ? <Text style={styles.resultName}>{item.full_name}</Text> : null}
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#007AFF" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected Participants Chips */}
        {selectedParticipants.length > 0 && (
          <View style={styles.chipsContainer}>
            {selectedParticipants.map(participant => (
              <View key={participant.id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{participant.email}</Text>
                <TouchableOpacity onPress={() => removeParticipant(participant.id)}>
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.disabledButton]} 
          onPress={handleCreateEvent}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Save Event</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    padding: 20, 
    flexGrow: 1, 
    paddingTop: 60,
    paddingBottom: 150 // <-- Crucial: Gives extra space to scroll results above keyboard
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF', padding: 12, borderRadius: 8, fontSize: 15, color: '#111' },
  textArea: { height: 80, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  pickerButton: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF', padding: 14, borderRadius: 8, alignItems: 'center' },
  pickerButtonText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#111' },
  resultsContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  resultEmail: { fontSize: 14, color: '#111', fontWeight: '500' },
  resultName: { fontSize: 12, color: '#666' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 6,
  },
  chipText: { fontSize: 13, color: '#007AFF', fontWeight: '500', maxWidth: 180 },
  submitButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  disabledButton: { backgroundColor: '#A0C7FF' },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});