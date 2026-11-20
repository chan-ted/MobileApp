import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
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
import { pickAndUploadAvatar } from '@/lib/uploadAvatar';

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type OrganizedEvent = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  venues?: {
    name: string;
  } | null;
};

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [organizedEvents, setOrganizedEvents] = useState<OrganizedEvent[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const isOwner = Boolean(profile && currentUserId && profile.id === currentUserId);

  const loadProfileData = useCallback(async (isRefresh = false) => {
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

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .eq('id', id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          id,
          title,
          start_time,
          end_time,
          venues:venue_id (name)
        `)
        .eq('created_by', id)
        .order('start_time', { ascending: false })
        .limit(10);

      if (eventsError) throw eventsError;

      const normalizedEvents: OrganizedEvent[] = (eventsData ?? []).map((ev: any) => ({
        id: ev.id,
        title: ev.title,
        start_time: ev.start_time,
        end_time: ev.end_time,
        venues: Array.isArray(ev.venues) ? (ev.venues[0] ?? null) : (ev.venues ?? null),
      }));

      setOrganizedEvents(normalizedEvents);
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Could not load profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadProfileData(false);
  }, [loadProfileData]);

  async function handleChangeAvatar() {
    if (!profile || !isOwner) return;

    setUploadingAvatar(true);
    try {
      const newAvatarUrl = await pickAndUploadAvatar(profile.id);
      if (newAvatarUrl) {
        setProfile(prev => (prev ? { ...prev, avatar_url: newAvatarUrl } : prev));
        Alert.alert('Success', 'Profile picture updated.');
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message ?? 'Could not update profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function getInitials(name?: string | null, email?: string | null) {
    const source = name?.trim() || email?.trim() || '?';
    const parts = source.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source[0].toUpperCase();
  }

  function formatDateRange(startIso: string, endIso: string) {
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

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Profile not found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayName = profile.full_name?.trim() || profile.email || 'User';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadProfileData(true)} />
      }
    >
      {/* Top Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarWrapper}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>
                {getInitials(profile.full_name, profile.email)}
              </Text>
            </View>
          )}

          {isOwner && (
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={handleChangeAvatar}
              disabled={uploadingAvatar}
              accessibilityLabel="Change profile picture"
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="camera" size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.displayName}>{displayName}</Text>
        {profile.email ? <Text style={styles.emailText}>{profile.email}</Text> : null}

        {isOwner && (
          <View style={styles.ownerBadge}>
            <Text style={styles.ownerBadgeText}>Your Profile</Text>
          </View>
        )}

        {isOwner && (
          <TouchableOpacity
            style={[styles.changePhotoBtn, uploadingAvatar && styles.disabledBtn]}
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar}
          >
            <Ionicons name="image-outline" size={18} color="#007AFF" />
            <Text style={styles.changePhotoText}>
              {uploadingAvatar
                ? 'Uploading Photo...'
                : profile.avatar_url
                ? 'Change Profile Picture'
                : 'Upload Profile Picture'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Organized Events Section */}
      <Text style={styles.sectionTitle}>Organized Events ({organizedEvents.length})</Text>

      {organizedEvents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={26} color="#8E8E93" />
          <Text style={styles.emptyText}>No events organized yet.</Text>
        </View>
      ) : (
        organizedEvents.map(ev => (
          <TouchableOpacity
            key={ev.id}
            style={styles.eventCard}
            activeOpacity={0.75}
            onPress={() => router.push(`/event/${ev.id}` as any)}
          >
            <Text style={styles.eventTitle}>{ev.title}</Text>
            <Text style={styles.eventMeta}>
              {formatDateRange(ev.start_time, ev.end_time)}
            </Text>
            {ev.venues?.name ? (
              <Text style={styles.eventVenue}>📍 {ev.venues.name}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  iconButton: {
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
  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#EBF3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 34,
    fontWeight: '700',
    color: '#007AFF',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  displayName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  emailText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  ownerBadge: {
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  ownerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#EBF3FF',
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginTop: 24,
    marginBottom: 12,
  },
  emptyCard: {
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
  eventMeta: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: 4,
  },
  eventVenue: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 4,
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