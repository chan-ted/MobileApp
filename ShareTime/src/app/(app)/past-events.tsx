import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl 
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

type EventItem = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  created_by: string;
};

export default function PastEventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch past events when the screen loads
  useEffect(() => {
    fetchPastEvents();
  }, []);

  async function fetchPastEvents() {
    try {
      setLoading(true);
      const nowIso = new Date().toISOString();

      // Query events where the start time is in the past
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .lt('start_time', nowIso)
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching past events:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    fetchPastEvents();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Events</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Events List */}
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No past events found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.eventCard}
            onPress={() => router.push(`/event/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </View>

            <Text style={styles.eventDescription} numberOfLines={2}>
              {item.description || 'No description provided.'}
            </Text>

            <View style={styles.cardFooter}>
              <View style={styles.timeRow}>
                <Ionicons name="calendar-outline" size={14} color="#666" />
                <Text style={styles.timeText}>
                  {new Date(item.start_time).toLocaleDateString()} at {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 60 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 },
  backButton: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  eventCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  eventDescription: { fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: '#666', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: '#888', fontWeight: '500' },
});