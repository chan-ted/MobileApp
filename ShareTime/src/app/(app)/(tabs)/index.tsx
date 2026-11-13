import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  FlatList, 
  Alert 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

type CombinedEvent = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  created_by: string;
  isOrganizer: boolean;
  status: 'accepted' | 'pending' | 'declined';
};

export default function EventsHomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  
  const [events, setEvents] = useState<CombinedEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchAllEvents(user.id);
      }
      setLoadingUser(false);
    }
    initUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchAllEvents(user.id);
      }
    }, [user])
  );

  async function fetchAllEvents(userId: string) {
    setLoadingEvents(true);
    try {
      const nowIso = new Date().toISOString();

      const { data: createdEvents, error: createdError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', userId)
        .gte('start_time', nowIso);

      if (createdError) throw createdError;

      const { data: invitedData, error: invitedError } = await supabase
        .from('event_participants')
        .select(`
          status,
          events (
            id,
            title,
            description,
            start_time,
            end_time,
            created_by
          )
        `)
        .eq('user_id', userId);

      if (invitedError) throw invitedError;

      const formattedCreated: CombinedEvent[] = (createdEvents || []).map(ev => ({
        ...ev,
        isOrganizer: true,
        status: 'accepted',
      }));

      const createdIds = new Set(formattedCreated.map(e => e.id));

      const formattedInvited: CombinedEvent[] = (invitedData || [])
        .filter((item: any) => item.events && !createdIds.has(item.events.id) && item.events.start_time >= nowIso)
        .map((item: any) => ({
          ...item.events,
          isOrganizer: false,
          status: item.status,
        }));

      const combined = [...formattedCreated, ...formattedInvited].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      setEvents(combined);
    } catch (error: any) {
      console.error('Error fetching events:', error.message);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function handleUpdateInvitationStatus(eventId: string, newStatus: 'accepted' | 'declined') {
    try {
      if (!user) return;

      const { error } = await supabase
        .from('event_participants')
        .update({ status: newStatus })
        .eq('event_id', eventId)
        .eq('user_id', user.id);

      if (error) throw error;

      fetchAllEvents(user.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login' as any);
  }

  const userEmail = user?.email || 'Loading user...';

  return (
    <View style={styles.container}>
      {/* Top Header & User Profile Bar */}
      <View style={styles.topBar}>
        <View style={styles.userInfoContainer}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          {loadingUser ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Text style={styles.emailText} numberOfLines={1}>{userEmail}</Text>
          )}
        </View>
        
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Buttons Row */}
      <View style={styles.scheduleHeaderRow}>
        <TouchableOpacity 
          style={styles.historyButton} 
          onPress={() => router.push('/past-events' as any)}
        >
          <Ionicons name="time-outline" size={16} color="#007AFF" />
          <Text style={styles.historyButtonText}>Past Events</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.historyButton} 
          onPress={() => router.push('/upcoming-events' as any)}
        >
          <Ionicons name="time-outline" size={16} color="#007AFF" />
          <Text style={styles.historyButtonText}>Upcoming Events</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.createButton} 
          onPress={() => router.push('/create-event' as any)}
        >
          <Text style={styles.createButtonText}>+ New Event</Text>
        </TouchableOpacity>
      </View>

      {/* Events List */}
      {loadingEvents ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No upcoming events or invitations.</Text>
          <Text style={styles.emptySubText}>Tap "+ New Event" above to create one!</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const isPending = !item.isOrganizer && item.status === 'pending';

            return (
              <View style={styles.eventCard}>
                {/* Clickable Card Body linked to Event Details */}
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={() => router.push(`/event/${item.id}` as any)}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    
                    {item.isOrganizer ? (
                      <View style={[styles.badge, styles.badgeOrganizer]}>
                        <Text style={styles.badgeOrganizerText}>Organizer</Text>
                      </View>
                    ) : item.status === 'accepted' ? (
                      <View style={[styles.badge, styles.badgeAccepted]}>
                        <Text style={styles.badgeAcceptedText}>Attending</Text>
                      </View>
                    ) : item.status === 'declined' ? (
                      <View style={[styles.badge, styles.badgeDeclined]}>
                        <Text style={styles.badgeDeclinedText}>Declined</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, styles.badgePending]}>
                        <Text style={styles.badgePendingText}>Pending Invite</Text>
                      </View>
                    )}
                  </View>

                  {item.description ? (
                    <Text style={styles.eventDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  <Text style={styles.eventTime}>
                    🕒 {new Date(item.start_time).toLocaleString()}
                  </Text>
                </TouchableOpacity>

                {/* Accept / Decline Action Buttons for Pending Invites (Separate from card click) */}
                {isPending && (
                  <View style={styles.inviteActionsRow}>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleUpdateInvitationStatus(item.id, 'accepted')}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                      <Text style={styles.actionButtonText}>Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.actionButton, styles.declineButton]}
                      onPress={() => handleUpdateInvitationStatus(item.id, 'declined')}
                    >
                      <Ionicons name="close" size={16} color="#EF4444" />
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  userInfoContainer: {
    flex: 1,
    marginRight: 12,
  },
  welcomeText: { fontSize: 12, color: '#666' },
  emailText: { fontSize: 14, fontWeight: 'bold', color: '#111' },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  logoutButtonText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  historyButtonText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 13, color: '#888', marginTop: 4 },
  listContainer: { paddingBottom: 20 },
  eventCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', flex: 1, marginRight: 8 },
  eventDescription: { fontSize: 13, color: '#666', marginBottom: 8 },
  eventTime: { fontSize: 12, color: '#007AFF', fontWeight: '500' },
  
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  badgeOrganizer: { backgroundColor: '#E0F2FE' },
  badgeOrganizerText: { color: '#0369A1', fontSize: 11, fontWeight: '600' },
  badgeAccepted: { backgroundColor: '#DCFCE7' },
  badgeAcceptedText: { color: '#15803D', fontSize: 11, fontWeight: '600' },
  badgeDeclined: { backgroundColor: '#FEE2E2' },
  badgeDeclinedText: { color: '#B91C1C', fontSize: 11, fontWeight: '600' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgePendingText: { color: '#B45309', fontSize: 11, fontWeight: '600' },

  inviteActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  acceptButton: { backgroundColor: '#10B981' },
  actionButtonText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  declineButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FECACA' },
  declineButtonText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
});