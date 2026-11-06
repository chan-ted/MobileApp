import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  FlatList,
  TouchableOpacity
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

type EventItem = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  created_by: string;
};

export default function PastEventsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchPastEvents(user.id);
      }
      setLoading(false);
    }
    initUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchPastEvents(user.id);
      }
    }, [user])
  );

  async function fetchPastEvents(userId: string) {
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', userId)
        .lt('start_time', nowIso)
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching past events:', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Events</Text>
        <View style={styles.spacer} />
      </View>

      {/* Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="time-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No past events found.</Text>
          <Text style={styles.emptySubText}>Completed events will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={[styles.eventCard, styles.pastCard]}>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#FFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  spacer: { width: 36 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 13, color: '#888' },
  listContainer: { paddingBottom: 20 },
  eventCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  pastCard: {
    opacity: 0.8,
    backgroundColor: '#FAFAFA',
  },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  eventDescription: { fontSize: 13, color: '#777', marginBottom: 8 },
  eventTime: { fontSize: 12, color: '#666', fontWeight: '500' },
});