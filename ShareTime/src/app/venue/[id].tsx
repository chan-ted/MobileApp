import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type Venue = {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type VenueEvent = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  created_by: string;
};

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit state (only used when viewer is creator)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const isCreator = Boolean(venue && currentUserId && venue.creator_id === currentUserId);

  const fetchVenueAndEvents = useCallback(async (isRefresh = false) => {
    if (!id) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('id, creator_id, name, description, created_at')
        .eq('id', id)
        .single();

      if (venueError) throw venueError;
      setVenue(venueData);
      setEditName(venueData.name);
      setEditDescription(venueData.description ?? '');

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, start_time, end_time, created_by')
        .eq('venue_id', id)
        .order('start_time', { ascending: true });

      if (eventsError) throw eventsError;
      setEvents(eventsData ?? []);
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Could not load venue details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVenueAndEvents(false);
  }, [fetchVenueAndEvents]);

  async function handleSaveVenue() {
    if (!venue) return;

    if (!isCreator) {
      Alert.alert('Not Allowed', 'Only the venue creator can edit this venue.');
      return;
    }

    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Venue name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const { data: updatedVenue, error } = await supabase
        .from('venues')
        .update({
          name: trimmedName,
          description: editDescription.trim() || null,
        })
        .eq('id', venue.id)
        .eq('creator_id', venue.creator_id)
        .select('id, creator_id, name, description, created_at')
        .single();

      if (error) throw error;

      setVenue(updatedVenue);
      setEditName(updatedVenue.name);
      setEditDescription(updatedVenue.description ?? '');
      setIsEditing(false);
      Alert.alert('Saved', 'Venue details updated.');
    } catch (error: any) {
      Alert.alert('Update Failed', error.message ?? 'Could not update venue.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (!venue) return;
    setEditName(venue.name);
    setEditDescription(venue.description ?? '');
    setIsEditing(false);
  }

  function formatEventRange(startIso: string, endIso: string) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const datePart = start.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} · ${startTime} – ${endTime}`;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Venue not found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => fetchVenueAndEvents(true)} />
      }
    >
      {/* Venue Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="location" size={22} color="#007AFF" />
          </View>

          {isCreator && !isEditing && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Ionicons name="create-outline" size={18} color="#007AFF" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditing ? (
          <View style={styles.editForm}>
            <Text style={styles.fieldLabel}>Venue Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Venue name"
              placeholderTextColor="#999"
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Add venue notes, capacity, directions..."
              placeholderTextColor="#999"
              multiline
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelEdit}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSaveVenue}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.venueTitle}>{venue.name}</Text>
            {isCreator && (
              <View style={styles.creatorTag}>
                <Text style={styles.creatorTagText}>Created by you</Text>
              </View>
            )}
            <Text style={styles.venueDescription}>
              {venue.description?.trim()
                ? venue.description
                : 'No description provided for this venue.'}
            </Text>
          </>
        )}
      </View>

      {/* Events at This Venue */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Events at This Venue ({events.length})</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyEventsCard}>
          <Ionicons name="calendar-clear-outline" size={28} color="#8E8E93" />
          <Text style={styles.emptyText}>No events scheduled here yet.</Text>
        </View>
      ) : (
        events.map(event => (
          <TouchableOpacity
            key={event.id}
            style={styles.eventCard}
            activeOpacity={0.75}
            onPress={() => router.push(`/event/${event.id}` as any)}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventTime}>
              {formatEventRange(event.start_time, event.end_time)}
            </Text>
            {event.description ? (
              <Text style={styles.eventDescription} numberOfLines={2}>
                {event.description}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EBF3FF',
  },
  editButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  venueTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  creatorTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  creatorTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  venueDescription: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 8,
  },
  editForm: {
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    minWidth: 110,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  emptyEventsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  eventCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  eventTime: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: 4,
  },
  eventDescription: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
  },
  backButton: {
    marginTop: 14,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});