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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { scheduleOneHourEventReminder, cancelEventReminder } from '@/lib/notifications';

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

function getInitials(profile: ProfileOption): string {
  const source = (profile.full_name || profile.email || '?').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;

  const [loadingEvent, setLoadingEvent] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [organizerId, setOrganizerId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date>(new Date(Date.now() + 3 * 60 * 60 * 1000));
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
  const [initialInviteeIds, setInitialInviteeIds] = useState<string[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    loadEventForEdit(eventId);
  }, [eventId]);

  async function loadEventForEdit(targetEventId: string) {
    try {
      setLoadingEvent(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const signedInId = user?.id ?? null;
      setCurrentUserId(signedInId);

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, title, description, start_time, end_time, venue_id, created_by')
        .eq('id', targetEventId)
        .single();

      if (eventError) throw eventError;
      if (!eventData) throw new Error('Event not found.');

      if (signedInId && eventData.created_by !== signedInId) {
        Alert.alert('Permission Denied', 'Only the event organizer can edit this event.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setOrganizerId(eventData.created_by);
      setTitle(eventData.title || '');
      setDescription(eventData.description || '');

      const parsedStart = new Date(eventData.start_time);
      const parsedEnd = eventData.end_time
        ? new Date(eventData.end_time)
        : new Date(parsedStart.getTime() + 60 * 60 * 1000);

      if (!Number.isNaN(parsedStart.getTime())) setStartDate(parsedStart);
      if (!Number.isNaN(parsedEnd.getTime())) setEndDate(parsedEnd);

      if (eventData.venue_id) {
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('id, name, description, image_url')
          .eq('id', eventData.venue_id)
          .single();

        if (!venueError && venueData) {
          setSelectedVenue(venueData);
          setVenueQuery(venueData.name);
        }
      }

      const { data: participantRows, error: partError } = await supabase
        .from('event_participants')
        .select('user_id, profiles(id, email, full_name, avatar_url)')
        .eq('event_id', targetEventId);

      if (partError) throw partError;

      const inviteeProfiles: ProfileOption[] = [];
      (participantRows || []).forEach((row: any) => {
        if (!row.user_id || row.user_id === eventData.created_by) return;
        const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        inviteeProfiles.push({
          id: row.user_id,
          email: prof?.email || '',
          full_name: prof?.full_name ?? null,
          avatar_url: prof?.avatar_url ?? null,
        });
      });

      setSelectedInvitees(inviteeProfiles);
      setInitialInviteeIds(inviteeProfiles.map(p => p.id));
    } catch (error: any) {
      Alert.alert('Load Failed', error.message || 'Could not load event details.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoadingEvent(false);
    }
  }

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
      const ownerId = organizerId || currentUserId;
      if (ownerId && !excludedIds.includes(ownerId)) {
        excludedIds.push(ownerId);
      }

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

  async function handleSaveChanges() {
    if (!eventId) return;

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
      const activeUserId = user?.id || currentUserId;
      const ownerId = organizerId || activeUserId;

      if (!activeUserId || !ownerId) {
        throw new Error('You must be signed in to update this event.');
      }

      // 1. Resolve existing or newly typed venue
      let resolvedVenue: VenueOption | null = selectedVenue;
      const trimmedVenue = venueQuery.trim();
      if (!resolvedVenue && trimmedVenue.length > 0) {
        const { data: createdVenue, error: venueError } = await supabase
          .from('venues')
          .insert({
            name: trimmedVenue,
            creator_id: ownerId,
          })
          .select('id, name, description, image_url')
          .single();

        if (venueError) throw venueError;
        resolvedVenue = createdVenue;
      }

      // 2. Update event record
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      const { data: updatedEvent, error: eventError } = await supabase
        .from('events')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          start_time: startIso,
          end_time: endIso,
          venue_id: resolvedVenue ? resolvedVenue.id : null,
        })
        .eq('id', eventId)
        .select('*')
        .single();

      if (eventError) throw eventError;

      // 3. Sync invited participants (keep organizer row intact)
      const currentInviteeIds = selectedInvitees.map(u => u.id);
      const removedIds = initialInviteeIds.filter(uid => !currentInviteeIds.includes(uid));
      const addedInvitees = selectedInvitees.filter(u => !initialInviteeIds.includes(u.id));

      if (removedIds.length > 0) {
        const { error: deletePartError } = await supabase
          .from('event_participants')
          .delete()
          .eq('event_id', eventId)
          .in('user_id', removedIds);

        if (deletePartError) throw deletePartError;
      }

      if (addedInvitees.length > 0) {
        const newRows = addedInvitees.map(inv => ({
          event_id: eventId,
          user_id: inv.id,
          status: 'pending',
        }));

        const { error: insertPartError } = await supabase
          .from('event_participants')
          .insert(newRows);

        if (insertPartError) throw insertPartError;
      }

      // 4. Reschedule (or cancel if now within 1 hour) the 1-hour reminder notification
      const triggerMs = new Date(updatedEvent.start_time).getTime() - 60 * 60 * 1000;
      if (triggerMs <= Date.now()) {
        await cancelEventReminder(updatedEvent.id);
      } else {
        await scheduleOneHourEventReminder({
          eventId: updatedEvent.id,
          title: updatedEvent.title,
          startTimeIso: updatedEvent.start_time,
          venueName: resolvedVenue?.name ?? null,
        });
      }

      router.back();
    } catch (error: any) {
      Alert.alert('Update Failed', error.message || 'Could not update event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Fixed Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Event</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadingEvent ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
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
                  onValueChange={(_, selected) => {
                    if (selected) {
                      setStartDate(selected);
                      if (endDate.getTime() <= selected.getTime()) {
                        setEndDate(new Date(selected.getTime() + 60 * 60 * 1000));
                      }
                    }
                  }}
                  onDismiss={() => setShowStartPicker(false)}
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
                  onValueChange={(_, selected) => {
                    if (selected) setEndDate(selected);
                  }}
                  onDismiss={() => setShowEndPicker(false)}
                />
                <TouchableOpacity style={styles.doneBtn} onPress={() => setShowEndPicker(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* VENUE SECTION */}
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
                        <Image source={{ uri: v.image_url }} style={styles.venueResultThumb} />
                      ) : (
                        <View style={styles.venueResultPlaceholder}>
                          <Ionicons name="location-outline" size={18} color="#007AFF" />
                        </View>
                      )}
                      <View style={styles.resultTextCol}>
                        <Text style={styles.resultText} numberOfLines={1}>
                          {v.name}
                        </Text>
                        {!!v.description && (
                          <Text style={styles.resultSubtext} numberOfLines={1}>
                            {v.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#007AFF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedVenue && (
              <View style={styles.selectedVenueCard}>
                {selectedVenue.image_url ? (
                  <Image
                    source={{ uri: selectedVenue.image_url }}
                    style={styles.selectedVenueBanner}
                  />
                ) : (
                  <View style={styles.selectedVenueBannerPlaceholder}>
                    <Ionicons name="image-outline" size={26} color="#9CA3AF" />
                    <Text style={styles.placeholderLabel}>No venue photo</Text>
                  </View>
                )}
                <View style={styles.selectedVenueBody}>
                  <View style={styles.selectedVenueHeaderRow}>
                    <Text style={styles.selectedVenueTitle}>{selectedVenue.name}</Text>
                    <TouchableOpacity onPress={handleClearVenue} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  {!!selectedVenue.description && (
                    <Text style={styles.selectedVenueDesc} numberOfLines={2}>
                      {selectedVenue.description}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* PARTICIPANTS SECTION */}
            <Text style={styles.label}>Invited Participants (by email)</Text>
            <View style={styles.searchBox}>
              <Ionicons name="person-add-outline" size={18} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search user email to add..."
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
                    <View style={styles.resultLeft}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={styles.userResultAvatar} />
                      ) : (
                        <View style={styles.userAvatarFallback}>
                          <Text style={styles.userAvatarFallbackText}>{getInitials(u)}</Text>
                        </View>
                      )}
                      <View style={styles.resultTextCol}>
                        <Text style={styles.resultText} numberOfLines={1}>
                          {u.full_name || u.email}
                        </Text>
                        {!!u.full_name && (
                          <Text style={styles.resultSubtext} numberOfLines={1}>
                            {u.email}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedInvitees.length > 0 && (
              <View style={styles.chipsRow}>
                {selectedInvitees.map(inv => (
                  <View key={inv.id} style={styles.inviteChip}>
                    {inv.avatar_url ? (
                      <Image source={{ uri: inv.avatar_url }} style={styles.inviteChipAvatar} />
                    ) : (
                      <View style={styles.inviteChipAvatarFallback}>
                        <Text style={styles.inviteChipAvatarText}>{getInitials(inv)}</Text>
                      </View>
                    )}
                    <Text style={styles.inviteChipText} numberOfLines={1}>
                      {inv.full_name || inv.email}
                    </Text>
                    <TouchableOpacity onPress={() => removeInvitee(inv.id)} hitSlop={6}>
                      <Ionicons name="close-circle" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.reminderNote}>
              <Ionicons name="notifications-outline" size={16} color="#007AFF" />
              <Text style={styles.reminderNoteText}>
                Saving will reschedule your 1-hour reminder notification for the updated start time.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabledBtn]}
              onPress={handleSaveChanges}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const PAGE_BG = '#F8F9FA';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PAGE_BG,
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  headerSpacer: {
    width: 38,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 50,
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
    overflow: 'hidden',
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
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  resultTextCol: {
    flex: 1,
  },
  venueResultThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  venueResultPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedVenueCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCEBFE',
    backgroundColor: '#F8FBFF',
    overflow: 'hidden',
  },
  selectedVenueBanner: {
    width: '100%',
    height: 140,
    backgroundColor: '#E5E7EB',
  },
  selectedVenueBannerPlaceholder: {
    width: '100%',
    height: 90,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  selectedVenueBody: {
    padding: 10,
  },
  selectedVenueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedVenueTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  selectedVenueDesc: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 4,
  },
  userResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  userAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
  },
  resultSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
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
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 999,
  },
  inviteChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DBEAFE',
  },
  inviteChipAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteChipAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  inviteChipText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
    maxWidth: 140,
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