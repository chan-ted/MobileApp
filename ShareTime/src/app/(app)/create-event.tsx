import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { scheduleOneHourEventReminder } from '@/lib/notifications';

type VenueOption = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
};

type ProfileOption = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

export default function CreateEventScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const defaultStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const defaultEnd = new Date(Date.now() + 3 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(defaultEnd);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Venue Search / Create States
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueOption[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueOption | null>(null);
  const [searchingVenues, setSearchingVenues] = useState(false);

  // Invitees States
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<ProfileOption[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<ProfileOption[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    }
    loadUser();
  }, []);

  async function handleVenueSearch(text: string) {
    setVenueQuery(text);
    setSelectedVenue(null);

    if (text.trim().length < 1) {
      setVenueResults([]);
      return;
    }

    setSearchingVenues(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, description, image_url')
        .ilike('name', `%${text.trim()}%`)
        .order('name', { ascending: true })
        .limit(6);

      if (error) throw error;
      setVenueResults(data || []);
    } catch (err: any) {
      console.error('Venue search error:', err.message);
    } finally {
      setSearchingVenues(false);
    }
  }

  function handleSelectVenue(venue: VenueOption) {
    setSelectedVenue(venue);
    setVenueQuery(venue.name);
    setVenueResults([]);
  }

  function handleClearVenue() {
    setSelectedVenue(null);
    setVenueQuery('');
    setVenueResults([]);
  }

  async function handleInviteSearch(text: string) {
    setInviteQuery(text);
    if (text.trim().length < 2) {
      setInviteResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const excludedIds = selectedInvitees.map(u => u.id);
      if (currentUserId) excludedIds.push(currentUserId);

      let query = supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .ilike('email', `%${text.trim()}%`)
        .limit(6);

      if (excludedIds.length > 0) {
        query = query.not('id', 'in', `(${excludedIds.join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInviteResults(data || []);
    } catch (err: any) {
      console.error('User search error:', err.message);
    } finally {
      setSearchingUsers(false);
    }
  }

  function addInvitee(userProfile: ProfileOption) {
    setSelectedInvitees(prev => [...prev, userProfile]);
    setInviteQuery('');
    setInviteResults([]);
  }

  function removeInvitee(userId: string) {
    setSelectedInvitees(prev => prev.filter(u => u.id !== userId));
  }

  const pickStartDateTime = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: startDate,
        mode: 'date',
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) {
            DateTimePickerAndroid.open({
              value: selected,
              mode: 'time',
              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type === 'set' && selectedTime) {
                  const next = new Date(selected);
                  next.setHours(selectedTime.getHours());
                  next.setMinutes(selectedTime.getMinutes());
                  setStartDate(next);
                  if (endDate.getTime() <= next.getTime()) {
                    setEndDate(new Date(next.getTime() + 60 * 60 * 1000));
                  }
                }
              },
            });
          }
        },
      });
    } else {
      setShowStartPicker(true);
    }
  };

  const pickEndDateTime = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: endDate,
        mode: 'date',
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) {
            DateTimePickerAndroid.open({
              value: selected,
              mode: 'time',
              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type === 'set' && selectedTime) {
                  const next = new Date(selected);
                  next.setHours(selectedTime.getHours());
                  next.setMinutes(selectedTime.getMinutes());
                  setEndDate(next);
                }
              },
            });
          }
        },
      });
    } else {
      setShowEndPicker(true);
    }
  };

  async function handleCreateEvent() {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter an event title.');
      return;
    }

    if (endDate.getTime() < startDate.getTime()) {
      Alert.alert('Validation Error', 'End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const organizerId = user?.id || currentUserId;
      if (!organizerId) {
        throw new Error('You must be signed in to create an event.');
      }

      // 1. Resolve existing or newly typed venue
      let resolvedVenue: VenueOption | null = selectedVenue;
      const trimmedVenue = venueQuery.trim();
      if (!resolvedVenue && trimmedVenue.length > 0) {
        const { data: createdVenue, error: venueError } = await supabase
          .from('venues')
          .insert({
            name: trimmedVenue,
            creator_id: organizerId,
          })
          .select('id, name, description, image_url')
          .single();

        if (venueError) throw venueError;
        resolvedVenue = createdVenue;
      }

      // 2. Insert event
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      const { data: createdEvent, error: eventError } = await supabase
        .from('events')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          start_time: startIso,
          end_time: endIso,
          venue_id: resolvedVenue ? resolvedVenue.id : null,
          created_by: organizerId,
        })
        .select('*')
        .single();

      if (eventError) throw eventError;

      // 3. Add organizer + invited participants
      const participantRows = [
        {
          event_id: createdEvent.id,
          user_id: organizerId,
          status: 'accepted',
        },
        ...selectedInvitees.map(inv => ({
          event_id: createdEvent.id,
          user_id: inv.id,
          status: 'pending',
        })),
      ];

      const { error: partError } = await supabase
        .from('event_participants')
        .insert(participantRows);

      if (partError) throw partError;

      // 4. Schedule stand-by 1-hour reminder notification
      await scheduleOneHourEventReminder({
        eventId: createdEvent.id,
        title: createdEvent.title,
        startTimeIso: createdEvent.start_time,
        venueName: resolvedVenue?.name ?? null,
      });
   

      router.replace(`/event/${createdEvent.id}` as any);
    } catch (error: any) {
      Alert.alert('Create Failed', error.message || 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Event</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Event Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Team Lunch or Outdoor Run"
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add agenda, notes, or details..."
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={styles.label}>Start Time</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={pickStartDateTime}>
            <Text style={styles.pickerText}>🕒 {startDate.toLocaleString()}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && showStartPicker && (
            <View style={styles.iosPickerBox}>
              <DateTimePicker
                value={startDate}
                mode="datetime"
                display="spinner"
                onChange={(_, selected) => {
                  if (selected) {
                    setStartDate(selected);
                    if (endDate.getTime() <= selected.getTime()) {
                      setEndDate(new Date(selected.getTime() + 60 * 60 * 1000));
                    }
                  }
                }}
              />
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowStartPicker(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>End Time</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={pickEndDateTime}>
            <Text style={styles.pickerText}>🏁 {endDate.toLocaleString()}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && showEndPicker && (
            <View style={styles.iosPickerBox}>
              <DateTimePicker
                value={endDate}
                mode="datetime"
                display="spinner"
                onChange={(_, selected) => {
                  if (selected) setEndDate(selected);
                }}
              />
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowEndPicker(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>Venue</Text>
          <View style={styles.searchBox}>
            <Ionicons name="location-outline" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search existing venue or type a new one..."
              placeholderTextColor="#999"
              value={venueQuery}
              onChangeText={handleVenueSearch}
            />
            {searchingVenues && <ActivityIndicator size="small" color="#007AFF" />}
            {venueQuery.length > 0 && !searchingVenues && (
              <TouchableOpacity onPress={handleClearVenue}>
                <Ionicons name="close-circle" size={18} color="#888" />
              </TouchableOpacity>
            )}
          </View>

          {venueResults.length > 0 && (
            <View style={styles.resultsBox}>
              {venueResults.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={styles.resultRow}
                  onPress={() => handleSelectVenue(v)}
                >
                  <View style={styles.resultLeft}>
                    {v.image_url ? (
                      <Image source={{ uri: v.image_url }} style={styles.venueThumb} />
                    ) : (
                      <Ionicons name="location-outline" size={18} color="#007AFF" />
                    )}
                    <Text style={styles.resultText}>{v.name}</Text>
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#007AFF" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Invite Participants (by email)</Text>
          <View style={styles.searchBox}>
            <Ionicons name="person-add-outline" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search user email..."
              placeholderTextColor="#999"
              value={inviteQuery}
              onChangeText={handleInviteSearch}
              autoCapitalize="none"
            />
            {searchingUsers && <ActivityIndicator size="small" color="#007AFF" />}
          </View>

          {inviteResults.length > 0 && (
            <View style={styles.resultsBox}>
              {inviteResults.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.resultRow}
                  onPress={() => addInvitee(u)}
                >
                  <Text style={styles.resultText}>{u.full_name || u.email}</Text>
                  <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedInvitees.length > 0 && (
            <View style={styles.chipsRow}>
              {selectedInvitees.map(inv => (
                <View key={inv.id} style={styles.inviteChip}>
                  <Text style={styles.inviteChipText} numberOfLines={1}>
                    {inv.full_name || inv.email}
                  </Text>
                  <TouchableOpacity onPress={() => removeInvitee(inv.id)}>
                    <Ionicons name="close-circle" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.reminderNote}>
            <Ionicons name="notifications-outline" size={16} color="#007AFF" />
            <Text style={styles.reminderNoteText}>
              A stand-by reminder will be scheduled for 1 hour before start time.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.disabledBtn]}
            onPress={handleCreateEvent}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>Create Event</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F8F9FA',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 50,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: '#FFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 11,
    fontSize: 15,
    color: '#111',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
  },
  pickerText: {
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  iosPickerBox: {
    marginTop: 6,
  },
  doneBtn: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  doneBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
  },
  resultsBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  venueThumb: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  resultText: {
    fontSize: 14,
    color: '#111',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EBF3FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  inviteChipText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
    maxWidth: 150,
  },
  reminderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F7FF',
    padding: 10,
    borderRadius: 8,
    marginTop: 18,
  },
  reminderNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
  },
  submitBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});