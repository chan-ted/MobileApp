import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

type ChatThread = {
  eventId: string;
  eventTitle: string;
  eventTime: string;
  lastMessageContent: string;
  lastMessageTime: string;
  unreadCount: number;
};

export default function MessagesTabScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchThreads(user.id);
      } else {
        setLoading(false);
      }
    }
    initUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchThreads(user.id);
      }
    }, [user])
  );

  async function fetchThreads(userId: string) {
    setLoading(true);
    try {
      // 1. Get all event IDs where the user is a participant
      const { data: participantRows, error: pError } = await supabase
        .from('event_participants')
        .select('event_id, last_read_at')
        .eq('user_id', userId);

      if (pError) throw pError;

      const participantEventMap = new Map(
        participantRows?.map(p => [p.event_id, p.last_read_at]) || []
      );
      const participantEventIds = participantRows?.map(p => p.event_id) || [];

      // 2. Get events created by the user
      const { data: createdEvents, error: cError } = await supabase
        .from('events')
        .select('id, title, start_time, created_by')
        .eq('created_by', userId);

      if (cError) throw cError;

      const createdEventMap = new Map(createdEvents?.map(e => [e.id, e]) || []);

      // 3. Fetch missing event details for participant events
      const missingIds = participantEventIds.filter(id => !createdEventMap.has(id));
      let participantEvents: any[] = [];
      if (missingIds.length > 0) {
        const { data: fetchedMissing, error: mError } = await supabase
          .from('events')
          .select('id, title, start_time, created_by')
          .in('id', missingIds);
        if (!mError && fetchedMissing) {
          participantEvents = fetchedMissing;
        }
      }

      const allEvents = [...(createdEvents || []), ...participantEvents];
      const uniqueEventsMap = new Map(allEvents.map(e => [e.id, e]));

      // 4. For each event, fetch the latest message. If none exist, filter it out.
      const threadPromises = Array.from(uniqueEventsMap.values()).map(async (ev) => {
        const { data: msgData } = await supabase
          .from('event_messages')
          .select(`
            content,
            created_at,
            sender_id,
            profiles:sender_id (email, full_name)
          `)
          .eq('event_id', ev.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const latestMsg = msgData && msgData.length > 0 ? msgData[0] : null;
        
        // Skip events with no messages
        if (!latestMsg) return null;

        const senderProfile: any = Array.isArray(latestMsg.profiles) 
          ? latestMsg.profiles[0] 
          : latestMsg.profiles;
        const senderName = senderProfile?.full_name || senderProfile?.email || 'Someone';

        const lastMessageContent = `${senderName}: ${latestMsg.content}`;
        const lastMessageTime = latestMsg.created_at;

        // Determine unread count
        let lastReadAt = participantEventMap.get(ev.id);
        if (!lastReadAt && ev.created_by === userId) {
          lastReadAt = new Date(0).toISOString();
        }

        let unreadCount = 0;
        if (lastReadAt) {
          const { count } = await supabase
            .from('event_messages')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id)
            .gt('created_at', lastReadAt)
            .neq('sender_id', userId);

          if (count !== null) unreadCount = count;
        }

        return {
          eventId: ev.id,
          eventTitle: ev.title,
          eventTime: ev.start_time,
          lastMessageContent,
          lastMessageTime,
          unreadCount,
        };
      });

      const results = await Promise.all(threadPromises);
      // Filter out nulls (events with no messages)
      const threadsList = results.filter(Boolean) as ChatThread[];

      // Sort by newest activity descending
      threadsList.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());

      setThreads(threadsList);
    } catch (error: any) {
      console.error('Error fetching message threads:', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Ionicons name="chatbubbles-outline" size={22} color="#007AFF" />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No active conversations.</Text>
          <Text style={styles.emptySubText}>Send a message in any event chat to see it here!</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.eventId}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.threadCard, item.unreadCount > 0 && styles.unreadCard]}
              activeOpacity={0.8}
              onPress={() => router.push(`/event/${item.eventId}` as any)}
            >
              <View style={styles.threadHeader}>
                <Text style={styles.eventTitle} numberOfLines={1}>{item.eventTitle}</Text>
                <Text style={styles.timeText}>
                  {new Date(item.lastMessageTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </Text>
              </View>

              <View style={styles.threadBody}>
                <Text style={[styles.previewText, item.unreadCount > 0 && styles.unreadPreviewText]} numberOfLines={1}>
                  {item.lastMessageContent}
                </Text>

                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 13, color: '#888' },
  listContainer: { paddingBottom: 20 },
  threadCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  unreadCard: {
    backgroundColor: '#F0F7FF',
    borderColor: '#CCE0FF',
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  timeText: { fontSize: 12, color: '#888' },
  threadBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewText: { fontSize: 13, color: '#666', flex: 1, marginRight: 8 },
  unreadPreviewText: { fontWeight: '600', color: '#111' },
  badge: {
    backgroundColor: '#007AFF',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
});