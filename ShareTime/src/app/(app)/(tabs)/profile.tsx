// app/(app)/(tabs)/profile.tsx
import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { pickAndUploadAvatar } from '@/lib/uploadAvatar';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  id: string;
  email: string;
  full_name?: string;
  bio?: string;
  avatar_url?: string | null;
};

type CreatedEvent = {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  venues?: {
    name: string;
  } | null;
};

export default function MyProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [createdEvents, setCreatedEvents] = useState<CreatedEvent[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');

  const fetchMyProfileAndEvents = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, eventsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single(),
        supabase
          .from('events')
          .select(`
            id,
            title,
            start_time,
            end_time,
            venues:venue_id (name)
          `)
          .eq('created_by', user.id)
          .order('start_time', { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (eventsRes.error) throw eventsRes.error;

      setProfile(profileRes.data);
      setFullName(profileRes.data.full_name || '');
      setBio(profileRes.data.bio || '');

      const normalizedEvents: CreatedEvent[] = (eventsRes.data || []).map((ev: any) => ({
        id: ev.id,
        title: ev.title,
        start_time: ev.start_time,
        end_time: ev.end_time,
        venues: Array.isArray(ev.venues) ? (ev.venues[0] ?? null) : (ev.venues ?? null),
      }));

      setCreatedEvents(normalizedEvents);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMyProfileAndEvents(false);
    }, [fetchMyProfileAndEvents])
  );

  async function handleChangeAvatar() {
    if (!profile || uploadingAvatar) return;

    try {
      setUploadingAvatar(true);
      const newAvatarUrl = await pickAndUploadAvatar(profile.id);
      if (newAvatarUrl) {
        setProfile(prev => (prev ? { ...prev, avatar_url: newAvatarUrl } : null));
        Alert.alert('Success', 'Profile picture updated!');
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Could not update profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          bio: bio.trim(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, full_name: fullName.trim(), bio: bio.trim() } : null);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  function handleCancelEdit() {
    setFullName(profile?.full_name || '');
    setBio(profile?.bio || '');
    setIsEditing(false);
  }

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  function formatEventDate(startIso: string, endIso?: string | null) {
    const start = new Date(startIso);
    const datePart = start.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const startTimePart = start.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (!endIso) {
      return `${datePart} · ${startTimePart}`;
    }

    const endTimePart = new Date(endIso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} · ${startTimePart} – ${endTimePart}`;
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMyProfileAndEvents(true)}
          />
        }
      >
        <Text style={styles.headerTitle}>My Profile</Text>

        {/* Profile Details Card */}
        <View style={styles.card}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity
              style={styles.avatarTouchable}
              onPress={handleChangeAvatar}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
              accessibilityLabel="Change profile picture"
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={40} color="#007AFF" />
                </View>
              )}

              <View style={styles.cameraBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="camera" size={16} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleChangeAvatar} disabled={uploadingAvatar}>
              <Text style={styles.changePhotoLink}>
                {uploadingAvatar
                  ? 'Uploading...'
                  : profile?.avatar_url
                  ? 'Change Photo'
                  : 'Upload Photo'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Email</Text>
          <Text style={styles.emailText}>{profile?.email}</Text>

          <Text style={styles.label}>Full Name</Text>
          {isEditing ? (
            <TextInput 
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
            />
          ) : (
            <Text style={styles.valueText}>{profile?.full_name || 'No full name provided.'}</Text>
          )}

          <Text style={styles.label}>Bio</Text>
          {isEditing ? (
            <TextInput 
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell others a bit about yourself..."
              multiline
            />
          ) : (
            <Text style={styles.valueText}>{profile?.bio || 'No bio provided.'}</Text>
          )}

          <View style={styles.actionSection}>
            {isEditing ? (
              <View style={styles.editRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editProfileButton} onPress={() => setIsEditing(true)}>
                <Ionicons name="create-outline" size={18} color="#007AFF" />
                <Text style={styles.editProfileButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Events Created by User */}
        <View style={styles.eventsSection}>
          <Text style={styles.sectionTitle}>My Created Events ({createdEvents.length})</Text>

          {createdEvents.length === 0 ? (
            <View style={styles.emptyEventsCard}>
              <Ionicons name="calendar-outline" size={26} color="#8E8E93" />
              <Text style={styles.emptyEventsText}>You haven't created any events yet.</Text>
            </View>
          ) : (
            createdEvents.map(ev => (
              <TouchableOpacity
                key={ev.id}
                style={styles.eventLinkCard}
                activeOpacity={0.75}
                onPress={() => router.push(`/event/${ev.id}` as any)}
              >
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text style={styles.eventDate}>
                    {formatEventDate(ev.start_time, ev.end_time)}
                  </Text>
                  {ev.venues?.name ? (
                    <Text style={styles.eventVenue} numberOfLines={1}>
                      📍 {ev.venues.name}
                    </Text>
                  ) : null}
                </View>

                <Ionicons name="chevron-forward" size={18} color="#007AFF" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F8F9FA', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 40 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 20 },
  
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#EFEFEF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  avatarContainer: { alignItems: 'center', marginBottom: 20 },
  avatarTouchable: { position: 'relative' },
  avatarImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#CCE0FF' },
  avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EBF3FF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CCE0FF' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  changePhotoLink: {
    marginTop: 8,
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },

  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 14 },
  emailText: { fontSize: 15, color: '#333', fontWeight: '500', marginTop: 4 },
  valueText: { fontSize: 15, color: '#111', fontWeight: '500', marginTop: 4, lineHeight: 20 },

  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#DDD', padding: 10, borderRadius: 8, fontSize: 15, color: '#111', marginTop: 4 },
  textArea: { height: 80, textAlignVertical: 'top' },

  actionSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16, gap: 12 },
  editProfileButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#EBF3FF', padding: 12, borderRadius: 8, gap: 6 },
  editProfileButtonText: { color: '#007AFF', fontWeight: '600', fontSize: 15 },
  
  editRow: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, backgroundColor: '#F1F3F5', padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButtonText: { color: '#495057', fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: '600' },

  signOutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, gap: 6 },
  signOutButtonText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },

  // Created Events List
  eventsSection: { marginTop: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },
  emptyEventsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    gap: 8,
  },
  emptyEventsText: { fontSize: 14, color: '#6B7280' },
  eventLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    gap: 10,
  },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  eventDate: { fontSize: 13, color: '#007AFF', fontWeight: '500', marginTop: 4 },
  eventVenue: { fontSize: 12, color: '#4B5563', marginTop: 4 },
});