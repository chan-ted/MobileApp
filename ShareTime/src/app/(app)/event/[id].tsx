import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

type RsvpStatus = 'accepted' | 'pending' | 'declined';

type Profile = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Venue = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
};

type Participant = {
  id: string;
  user_id: string;
  status: RsvpStatus;
  profiles: Profile;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  profiles: {
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
  };
};

function SmallAvatar({
  uri,
  name,
  size = 20,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#E5E7EB',
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.smallAvatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.smallAvatarInitial, { fontSize: Math.max(9, size * 0.48) }]}>
        {initial}
      </Text>
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);

  // Current User RSVP Status
  const [myStatus, setMyStatus] = useState<RsvpStatus>('pending');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Event Details States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState('');
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);

  // Participants States
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  // --- Mark as Read Function ---
  const markAsRead = useCallback(async (targetEventId: string, userId: string) => {
    try {
      const nowIso = new Date().toISOString();

      const { data } = await supabase
        .from('event_participants')
        .update({ last_read_at: nowIso })
        .eq('event_id', targetEventId)
        .eq('user_id', userId)
        .select();

      if (!data || data.length === 0) {
        await supabase
          .from('event_participants')
          .insert({
            event_id: targetEventId,
            user_id: userId,
            status: 'accepted',
            last_read_at: nowIso,
          });
      }
    } catch (err) {
      console.error('Error marking event as read:', err);
    }
  }, []);

  // --- Fetch Participants ---
  const fetchParticipants = useCallback(
    async (activeUserId?: string | null) => {
      if (!eventId) return;

      try {
        const { data: participantRows, error: partError } = await supabase
          .from('event_participants')
          .select('id, user_id, status')
          .eq('event_id', eventId);

        if (partError) throw partError;
        if (!participantRows || participantRows.length === 0) {
          setParticipants([]);
          return;
        }

        const userIds = participantRows.map(p => p.user_id);
        const { data: profileRows, error: profError } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds);

        if (profError) throw profError;

        const profileMap = new Map(profileRows?.map(p => [p.id, p]) || []);

        const uniqueParticipantsMap = new Map<string, Participant>();
        participantRows.forEach(p => {
          if (!uniqueParticipantsMap.has(p.user_id)) {
            uniqueParticipantsMap.set(p.user_id, {
              id: p.id,
              user_id: p.user_id,
              status: p.status,
              profiles: profileMap.get(p.user_id) || {
                id: p.user_id,
                email: 'Unknown',
                avatar_url: null,
              },
            });
          }
        });

        const list = Array.from(uniqueParticipantsMap.values());
        setParticipants(list);

        const lookupUserId = activeUserId ?? currentUserId;
        if (lookupUserId) {
          const mine = list.find(item => item.user_id === lookupUserId);
          if (mine) {
            setMyStatus(mine.status);
          }
        }
      } catch (error: any) {
        console.error('Error fetching participants:', error.message);
      }
    },
    [eventId, currentUserId]
  );

  // --- Fetch Event Metadata, Venue, Organizer & Participants ---
  const loadEventDetails = useCallback(async () => {
    if (!eventId) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;

      setTitle(eventData.title);
      setDescription(eventData.description || '');
      setStartTime(eventData.start_time || '');
      setEndTime(eventData.end_time || '');
      setCreatorId(eventData.created_by);
      setIsOrganizer(eventData.created_by === user.id);

      let loadedVenue: Venue | null = null;
      if (eventData.venue_id) {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name, description, image_url')
          .eq('id', eventData.venue_id)
          .single();

        loadedVenue = venueData || null;
      }
      setVenue(loadedVenue);

      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('email, full_name, avatar_url')
        .eq('id', eventData.created_by)
        .single();

      setCreatorName(creatorProfile?.full_name || creatorProfile?.email || 'Unknown Organizer');
      setCreatorAvatarUrl(creatorProfile?.avatar_url || null);

      await fetchParticipants(user.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, [eventId, fetchParticipants]);

  // Refresh event details on initial focus AND whenever returning from /event/edit/[id]
  useFocusEffect(
    useCallback(() => {
      loadEventDetails();
    }, [loadEventDetails])
  );

  // Initial mount: mark messages as read, load messages, and subscribe to Realtime chat
  useEffect(() => {
    if (!eventId) return;

    async function initChat() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await markAsRead(eventId, user.id);
      }
      await fetchMessages();
    }

    initChat();

    const channel = supabase
      .channel(`chat:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_messages',
          filter: `event_id=eq.${eventId}`,
        },
        async payload => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('email, full_name, avatar_url')
            .eq('id', payload.new.sender_id)
            .single();

          const newMsg: Message = {
            id: payload.new.id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            sender_id: payload.new.sender_id,
            profiles: profileData || { email: 'Unknown', avatar_url: null },
          };

          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, markAsRead]);

  // --- Change Current User RSVP Status (accepted / pending / declined) ---
  async function handleChangeMyStatus(nextStatus: RsvpStatus) {
    if (!currentUserId || !eventId || updatingStatus || myStatus === nextStatus) return;

    setUpdatingStatus(true);
    try {
      const { data: updatedRows, error: updateError } = await supabase
        .from('event_participants')
        .update({ status: nextStatus })
        .eq('event_id', eventId)
        .eq('user_id', currentUserId)
        .select('id');

      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase
          .from('event_participants')
          .insert({
            event_id: eventId,
            user_id: currentUserId,
            status: nextStatus,
          });

        if (insertError) throw insertError;
      }

      setMyStatus(nextStatus);
      await fetchParticipants(currentUserId);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not update your status.');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function fetchMessages() {
    if (!eventId) return;

    try {
      const { data, error } = await supabase
        .from('event_messages')
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles:sender_id (email, full_name, avatar_url)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedMessages: Message[] = (data || []).map((item: any) => ({
        id: item.id,
        content: item.content,
        created_at: item.created_at,
        sender_id: item.sender_id,
        profiles: Array.isArray(item.profiles)
          ? item.profiles[0] || { email: 'Unknown', avatar_url: null }
          : item.profiles || { email: 'Unknown', avatar_url: null },
      }));

      setMessages(formattedMessages);
    } catch (error: any) {
      console.error('Error fetching messages:', error.message);
    }
  }

  // --- Instant Messaging Logic ---
  async function handleSendMessage() {
    if (!inputText.trim() || !currentUserId || !eventId) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const { data, error } = await supabase
        .from('event_messages')
        .insert({
          event_id: eventId,
          sender_id: currentUserId,
          content: textToSend,
        })
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles:sender_id (email, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;

      if (data) {
        const normalizedMsg: Message = {
          id: (data as any).id,
          content: (data as any).content,
          created_at: (data as any).created_at,
          sender_id: (data as any).sender_id,
          profiles: Array.isArray((data as any).profiles)
            ? ((data as any).profiles[0] || { email: 'Unknown', avatar_url: null })
            : ((data as any).profiles || { email: 'Unknown', avatar_url: null }),
        };

        setMessages(prev => {
          if (prev.some(m => m.id === normalizedMsg.id)) return prev;
          return [...prev, normalizedMsg];
        });
      }
    } catch (error: any) {
      console.error('Error sending message:', error.message);
      Alert.alert('Error', 'Failed to send message.');
    }
  }

  if (loading) {
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {/* Fixed Navigation Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            Event Details & Chat
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Main Body */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              {/* Event Info Card */}
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitleHeading} numberOfLines={2}>
                    {title || 'Untitled Event'}
                  </Text>

                  {isOrganizer && (
                    <View style={styles.organizerActionsGroup}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>You're the Organizer</Text>
                      </View>
                      {eventId && (
                        <TouchableOpacity
                          style={styles.inlineEditIconButton}
                          onPress={() => router.push(`/event/edit/${eventId}` as any)}
                          accessibilityLabel="Edit Event"
                          hitSlop={6}
                        >
                          <Ionicons name="create-outline" size={18} color="#007AFF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                {/* Your RSVP Status Selector (Accepted / Pending / Declined) */}
                <Text style={styles.label}>Your RSVP Status</Text>
                <View style={styles.rsvpRow}>
                  {(['accepted', 'pending', 'declined'] as RsvpStatus[]).map(statusOption => {
                    const active = myStatus === statusOption;
                    const label =
                      statusOption === 'accepted'
                        ? 'Accepted'
                        : statusOption === 'pending'
                        ? 'Pending'
                        : 'Declined';

                    return (
                      <TouchableOpacity
                        key={statusOption}
                        style={[
                          styles.rsvpOption,
                          active && styles.rsvpOptionActive,
                          active && statusOption === 'accepted' && styles.rsvpAcceptedActive,
                          active && statusOption === 'pending' && styles.rsvpPendingActive,
                          active && statusOption === 'declined' && styles.rsvpDeclinedActive,
                        ]}
                        onPress={() => handleChangeMyStatus(statusOption)}
                        disabled={updatingStatus}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.rsvpOptionText,
                            active && styles.rsvpOptionTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Organizer Info with Picture */}
                <Text style={styles.label}>Organizer</Text>
                <TouchableOpacity
                  style={styles.organizerRow}
                  activeOpacity={creatorId ? 0.75 : 1}
                  disabled={!creatorId}
                  onPress={() => {
                    if (creatorId) {
                      router.push(`/profile/${creatorId}` as any);
                    }
                  }}
                >
                  <SmallAvatar uri={creatorAvatarUrl} name={creatorName} size={28} />
                  <Text style={styles.organizerValueText} numberOfLines={1}>
                    {creatorName}
                  </Text>
                  {!!creatorId && (
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  )}
                </TouchableOpacity>

                {/* Venue Info & Chip with Picture */}
                <Text style={styles.label}>Venue</Text>
                {venue ? (
                  <TouchableOpacity
                    style={styles.venueChip}
                    activeOpacity={0.75}
                    onPress={() => router.push(`/venue/${venue.id}` as any)}
                  >
                    {venue.image_url ? (
                      <Image source={{ uri: venue.image_url }} style={styles.venueChipImage} />
                    ) : (
                      <View style={styles.venueChipFallbackIcon}>
                        <Ionicons name="location" size={16} color="#007AFF" />
                      </View>
                    )}
                    <Text style={styles.venueLinkText} numberOfLines={1}>
                      {venue.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#007AFF" />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.valueText}>No venue assigned</Text>
                )}

                {/* Description */}
                <Text style={styles.label}>Description</Text>
                <Text style={styles.valueText}>
                  {description || 'No description provided.'}
                </Text>

                {/* Start Time */}
                <Text style={styles.label}>Start Time</Text>
                <Text style={styles.valueText}>
                  🕒 {startTime ? new Date(startTime).toLocaleString() : 'Not set'}
                </Text>

                {/* End Time */}
                <Text style={styles.label}>End Time</Text>
                <Text style={styles.valueText}>
                  🏁 {endTime ? new Date(endTime).toLocaleString() : 'Not set'}
                </Text>
              </View>

              {/* Participants Card */}
              <View style={styles.card}>
                <Text style={styles.sectionHeading}>Participants ({participants.length})</Text>

                <View style={styles.chipsContainer}>
                  {participants.map(p => {
                    const isCreator = p.user_id === creatorId;
                    const displayLabel = p.profiles?.full_name || p.profiles?.email;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.chip, isCreator && styles.organizerChip]}
                        activeOpacity={0.7}
                        onPress={() => router.push(`/profile/${p.user_id}` as any)}
                      >
                        <SmallAvatar
                          uri={p.profiles?.avatar_url}
                          name={displayLabel}
                          size={20}
                        />

                        <Text style={styles.chipText} numberOfLines={1}>
                          {displayLabel}
                        </Text>

                        {isCreator && (
                          <View style={styles.organizerBadge}>
                            <Text style={styles.organizerBadgeText}>Organizer</Text>
                          </View>
                        )}

                        <View
                          style={[
                            styles.statusDot,
                            p.status === 'accepted'
                              ? styles.dotAccepted
                              : p.status === 'declined'
                              ? styles.dotDeclined
                              : styles.dotPending,
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Text style={styles.discussionHeading}>Discussion Thread</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.sender_id === currentUserId;
            const senderLabel = item.profiles?.full_name || item.profiles?.email;
            return (
              <View style={[styles.bubbleWrapper, isMe ? styles.myMessage : styles.theirMessage]}>
                {!isMe && (
                  <View style={styles.senderRow}>
                    <SmallAvatar uri={item.profiles?.avatar_url} name={senderLabel} size={18} />
                    <Text style={styles.senderName}>{senderLabel}</Text>
                  </View>
                )}
                <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
                  {item.content}
                </Text>
              </View>
            );
          }}
        />

        {/* Instant Chat Input Footer */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const PAGE_BG = '#F8F9FA';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG, paddingTop: 60 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PAGE_BG,
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginHorizontal: 8,
  },
  headerSpacer: { width: 38 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  headerSection: { gap: 12 },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  cardTitleHeading: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    lineHeight: 26,
  },
  organizerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  inlineEditIconButton: {
    width: 30,
    height: 30,
    backgroundColor: '#EBF3FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCEBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  discussionHeading: { fontSize: 16, fontWeight: 'bold', color: '#111', marginVertical: 12 },
  badge: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: { color: '#0369A1', fontSize: 11, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 10 },
  valueText: { fontSize: 15, color: '#111', fontWeight: '500', marginTop: 2 },

  // Organizer Row with Avatar
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  organizerValueText: {
    fontSize: 15,
    color: '#111',
    fontWeight: '600',
    flexShrink: 1,
  },

  // RSVP Status Selector
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  rsvpOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  rsvpOptionActive: { borderWidth: 1 },
  rsvpAcceptedActive: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  rsvpPendingActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  rsvpDeclinedActive: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  rsvpOptionText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  rsvpOptionTextActive: { color: '#111827', fontWeight: '700' },

  // Venue Chip with Picture
  venueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    backgroundColor: '#EBF3FF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  venueChipImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DBEAFE',
  },
  venueChipFallbackIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueLinkText: { fontSize: 14, color: '#007AFF', fontWeight: '600', flexShrink: 1 },

  // Small Avatars
  smallAvatarFallback: {
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarInitial: {
    color: '#1D4ED8',
    fontWeight: '700',
  },

  // Chips & Participants
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 16,
    gap: 6,
  },
  organizerChip: { backgroundColor: '#EBF3FF', borderWidth: 1, borderColor: '#CCE0FF' },
  organizerBadge: {
    backgroundColor: '#007AFF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  organizerBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500', maxWidth: 130 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotAccepted: { backgroundColor: '#10B981' },
  dotPending: { backgroundColor: '#F59E0B' },
  dotDeclined: { backgroundColor: '#EF4444' },

  // Chat Bubbles
  bubbleWrapper: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 10 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  senderName: { fontSize: 11, color: '#666', fontWeight: '600' },
  messageText: { fontSize: 14 },
  myText: { color: '#FFF' },
  theirText: { color: '#111' },

  // Footer Input
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    alignItems: 'center',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});