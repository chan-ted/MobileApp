import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  FlatList 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

type EventItem = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
};

export default function EventsHomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Fetch current user and their events on mount
  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchEvents(user.id);
      }
      setLoadingUser(false);
    }
    initUser();
  }, []);

  // Refetch events whenever the screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchEvents(user.id);
      }
    }, [user])
  );

  async function fetchEvents(userId: string) {
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', userId) // <-- Updated to match your column name!
        .order('start_time', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching events:', error.message);
    } finally {
      setLoadingEvents(false);
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

      {/* Schedule Header & Create Event Button */}
      <View style={styles.scheduleHeaderRow}>
        <Text style={styles.sectionTitle}>Your Schedule</Text>
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
          <Text style={styles.emptyText}>No scheduled events yet.</Text>
          <Text style={styles.emptySubText}>Tap "+ New Event" above to create one!</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.eventDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.eventTime}>
                🕒 {new Date(item.start_time).toLocaleString()}
              </Text>
            </View>
          )}
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
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
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
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  eventDescription: { fontSize: 13, color: '#666', marginBottom: 8 },
  eventTime: { fontSize: 12, color: '#007AFF', fontWeight: '500' },
});