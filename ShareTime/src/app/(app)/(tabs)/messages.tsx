import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Sample placeholder chats (you can later connect this to your Supabase messaging tables)
const DUMMY_CHATS = [
  { 
    id: '1', 
    name: 'Event Organizers Group', 
    lastMessage: 'See you all tomorrow at 10 AM!', 
    time: '10:30 AM' 
  },
  { 
    id: '2', 
    name: 'Tech Meetup Chat', 
    lastMessage: 'Great presentation everyone!', 
    time: 'Yesterday' 
  },
];

export default function MessagesScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {/* Conversations List */}
      <FlatList
        data={DUMMY_CHATS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.chatCard} activeOpacity={0.7}>
            <View style={styles.avatarContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.chatInfo}>
              <View style={styles.chatHeaderRow}>
                <Text style={styles.chatName}>{item.name}</Text>
                <Text style={styles.chatTime}>{item.time}</Text>
              </View>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
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
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
  },
  listContainer: {
    paddingBottom: 20,
  },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  chatTime: {
    fontSize: 12,
    color: '#888',
  },
  lastMessage: {
    fontSize: 13,
    color: '#666',
  },
});