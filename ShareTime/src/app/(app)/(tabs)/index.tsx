import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator 
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Define the Event type for TypeScript
type EventItem = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
};

export default function HomeScreen() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch events whenever the screen comes into focus (e.g. returning from Create Event)
  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [])
  );

  async function fetchEvents() {
    setLoading(true);
    try {
      // Because RLS is enabled, Supabase automatically filters or allows 
      // access based on your security policies.
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: true });

      if (error) {
        throw error;
      }

      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching events:', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Your Schedule</Text>
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => router.push('/create-event')}
        >
          <Text style={styles.addButtonText}>+ New Event</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No events found.</Text>
          <Text style={styles.emptySubText}>Tap "+ New Event" to get started!</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.eventCard}
              onPress={() => {
                // Later, you can navigate to event details or chat here:
                // router.push(`/event/${item.id}`);
              }}
            >
              <Text style={styles.eventTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.eventDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.eventTime}>
                🕒 {new Date(item.start_time).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', padding: 16 },
  headerContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16,
    marginTop: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  addButton: { 
    backgroundColor: '#007AFF', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 8 
  },
  addButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 14, color: '#888', marginTop: 4 },
  eventCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  eventTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  eventDescription: { fontSize: 14, color: '#666', marginBottom: 8 },
  eventTime: { fontSize: 12, color: '#007AFF', fontWeight: '500' },
});