import React, { useState, useEffect, useRef } from 'react';
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
  Platform 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

type Profile = {
  id: string;
  email: string;
  full_name?: string;
};

type Participant = {
  id: string;
  user_id: string;
  status: 'accepted' | 'pending' | 'declined';
  profiles: Profile;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  profiles: {
    email: string;
    full_name?: string;
  };
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Event Details States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState('');
  
  // Picker visibility toggles (mainly for iOS inline display)
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Original states for cancel revert
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');
  const [originalStartTime, setOriginalStartTime] = useState('');
  const [originalEndTime, setOriginalEndTime] = useState('');

  // Participants States
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);

        // 1. Fetch Event Details
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .single();

        if (eventError) throw eventError;

        setTitle(eventData.title);
        setDescription(eventData.description || '');
        setStartTime(eventData.start_time || '');
        setEndTime(eventData.end_time || '');

        setOriginalTitle(eventData.title);
        setOriginalDescription(eventData.description || '');
        setOriginalStartTime(eventData.start_time || '');
        setOriginalEndTime(eventData.end_time || '');

        setCreatorId(eventData.created_by);

        if (eventData.created_by === user.id) {
          setIsOrganizer(true);
        }

        // 2. Fetch Creator Profile via 2-step query
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', eventData.created_by)
          .single();

        setCreatorName(creatorProfile?.full_name || creatorProfile?.email || 'Unknown Organizer');

        // 3. Mark event messages as read immediately upon opening
        await markAsRead(id, user.id);

        // 4. Fetch Participants & Messages
        await fetchParticipants();
        await fetchMessages();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      } finally {
        setLoading(false);
      }
    }

    init();

    // 5. Realtime Chat Subscription
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${id}` },
        async (payload) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', payload.new.sender_id)
            .single();

          const newMsg: Message = {
            id: payload.new.id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            sender_id: payload.new.sender_id,
            profiles: profileData || { email: 'Unknown' },
          };

          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // --- Mark as Read Function ---
  async function markAsRead(eventId: string, userId: string) {
    try {
      const nowIso = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('event_participants')
        .update({ last_read_at: nowIso })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .select();

      if (!data || data.length === 0) {
        await supabase
          .from('event_participants')
          .insert({
            event_id: eventId,
            user_id: userId,
            status: 'accepted',
            last_read_at: nowIso,
          });
      }
    } catch (err) {
      console.error('Error marking event as read:', err);
    }
  }

  // --- Cross-Platform Picker Handlers ---
  const handlePickStartTime = () => {
    const current = startTime ? new Date(startTime) : new Date();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            DateTimePickerAndroid.open({
              value: selectedDate,
              mode: 'time',
              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type === 'set' && selectedTime) {
                  const combined = new Date(selectedDate);
                  combined.setHours(selectedTime.getHours());
                  combined.setMinutes(selectedTime.getMinutes());
                  setStartTime(combined.toISOString());
                }
              },
            });
          }
        },
      });
    } else {
      setShowStartPicker(true);
    }
  };

  const handlePickEndTime = () => {
    const current = endTime ? new Date(endTime) : (startTime ? new Date(startTime) : new Date());

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            DateTimePickerAndroid.open({
              value: selectedDate,
              mode: 'time',
              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type === 'set' && selectedTime) {
                  const combined = new Date(selectedDate);
                  combined.setHours(selectedTime.getHours());
                  combined.setMinutes(selectedTime.getMinutes());
                  setEndTime(combined.toISOString());
                }
              },
            });
          }
        },
      });
    } else {
      setShowEndPicker(true);
    }
  };

  // --- Data Fetching Helpers ---
  async function fetchParticipants() {
    try {
      const { data: participantRows, error: partError } = await supabase
        .from('event_participants')
        .select('id, user_id, status')
        .eq('event_id', id);

      if (partError) throw partError;
      if (!participantRows || participantRows.length === 0) {
        setParticipants([]);
        return;
      }

      const userIds = participantRows.map(p => p.user_id);
      const { data: profileRows, error: profError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
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
            profiles: profileMap.get(p.user_id) || { id: p.user_id, email: 'Unknown' },
          });
        }
      });

      setParticipants(Array.from(uniqueParticipantsMap.values()));
    } catch (error: any) {
      console.error('Error fetching participants:', error.message);
    }
  }

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from('event_messages')
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles:sender_id (email, full_name)
        `)
        .eq('event_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedMessages: Message[] = (data || []).map((item: any) => ({
        id: item.id,
        content: item.content,
        created_at: item.created_at,
        sender_id: item.sender_id,
        profiles: Array.isArray(item.profiles)
          ? (item.profiles[0] || { email: 'Unknown' })
          : (item.profiles || { email: 'Unknown' }),
      }));

      setMessages(formattedMessages);
    } catch (error: any) {
      console.error('Error fetching messages:', error.message);
    }
  }

  // --- Participant Search & Management ---
  async function handleSearch(text: string) {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const existingUserIds = participants.map(p => p.user_id);
      if (currentUserId) existingUserIds.push(currentUserId);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .ilike('email', `%${text.trim()}%`)
        .not('id', 'in', `(${existingUserIds.join(',')})`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err: any) {
      console.error('Error searching profiles:', err.message);
    } finally {
      setIsSearching(false);
    }
  }

  async function addParticipant(profile: Profile) {
    try {
      const { error } = await supabase
        .from('event_participants')
        .insert({
          event_id: id,
          user_id: profile.id,
          status: 'pending',
        });

      if (error) throw error;

      setSearchQuery('');
      setSearchResults([]);
      fetchParticipants();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function removeParticipant(participantId: string) {
    try {
      const { error } = await supabase
        .from('event_participants')
        .delete()
        .eq('id', participantId);

      if (error) throw error;

      fetchParticipants();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  // --- Event Edit Logic ---
  async function handleSaveEdits() {
    if (!title.trim()) {
      Alert.alert('Error', 'Title cannot be empty.');
      return;
    }

    try {
      const { error } = await supabase
        .from('events')
        .update({
          title: title.trim(),
          description: description.trim(),
          start_time: startTime.trim(),
          end_time: endTime.trim() || null,
        })
        .eq('id', id);

      if (error) throw error;

      setOriginalTitle(title);
      setOriginalDescription(description);
      setOriginalStartTime(startTime);
      setOriginalEndTime(endTime);
      setIsEditing(false);
      Alert.alert('Success', 'Event details updated!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  function handleCancelEdit() {
    setTitle(originalTitle);
    setDescription(originalDescription);
    setStartTime(originalStartTime);
    setEndTime(originalEndTime);
    setIsEditing(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  // --- Instant Messaging Logic ---
  async function handleSendMessage() {
    if (!inputText.trim() || !currentUserId) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const { data, error } = await supabase
        .from('event_messages')
        .insert({
          event_id: id,
          sender_id: currentUserId,
          content: textToSend,
        })
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles:sender_id (email, full_name)
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
            ? ((data as any).profiles[0] || { email: 'Unknown' })
            : ((data as any).profiles || { email: 'Unknown' }),
        };

        setMessages((prev) => {
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
      <View style={styles.container}>
        {/* Navigation Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Event Details & Chat</Text>

          {isOrganizer && !isEditing ? (
            <TouchableOpacity style={styles.editToggleButton} onPress={() => setIsEditing(true)}>
              <Text style={styles.editToggleText}>Edit Details</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Main Body */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              {/* Event Info Card */}
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.sectionHeading}>Event Info</Text>
                  {isOrganizer && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>You're the Organizer</Text>
                    </View>
                  )}
                </View>

                {/* Organizer Info */}
                <Text style={styles.label}>Organizer</Text>
                <Text style={styles.valueText}>👤 {creatorName}</Text>

                {/* Title */}
                <Text style={styles.label}>Event Title</Text>
                {isEditing ? (
                  <TextInput 
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                  />
                ) : (
                  <Text style={styles.valueText}>{title}</Text>
                )}

                {/* Description */}
                <Text style={styles.label}>Description</Text>
                {isEditing ? (
                  <TextInput 
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                ) : (
                  <Text style={styles.valueText}>{description || 'No description provided.'}</Text>
                )}

                {/* Start Time Section */}
                <Text style={styles.label}>Start Time</Text>
                {isEditing ? (
                  <View>
                    <TouchableOpacity 
                      style={styles.datePickerButton} 
                      onPress={handlePickStartTime}
                    >
                      <Text style={styles.datePickerButtonText}>
                        🕒 {startTime ? new Date(startTime).toLocaleString() : 'Select Start Time'}
                      </Text>
                    </TouchableOpacity>

                    {/* iOS Inline DateTime Picker */}
                    {Platform.OS === 'ios' && showStartPicker && (
                      <View style={{ marginTop: 8 }}>
                        <DateTimePicker
                          value={startTime ? new Date(startTime) : new Date()}
                          mode="datetime"
                          display="spinner"
                          onChange={(event, selectedDate) => {
                            if (selectedDate) setStartTime(selectedDate.toISOString());
                          }}
                        />
                        <TouchableOpacity 
                          style={styles.donePickerButton} 
                          onPress={() => setShowStartPicker(false)}
                        >
                          <Text style={styles.donePickerButtonText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.valueText}>🕒 {startTime ? new Date(startTime).toLocaleString() : 'Not set'}</Text>
                )}

                {/* End Time Section */}
                <Text style={styles.label}>End Time</Text>
                {isEditing ? (
                  <View>
                    <TouchableOpacity 
                      style={styles.datePickerButton} 
                      onPress={handlePickEndTime}
                    >
                      <Text style={styles.datePickerButtonText}>
                        🏁 {endTime ? new Date(endTime).toLocaleString() : 'Select End Time'}
                      </Text>
                    </TouchableOpacity>

                    {/* iOS Inline DateTime Picker */}
                    {Platform.OS === 'ios' && showEndPicker && (
                      <View style={{ marginTop: 8 }}>
                        <DateTimePicker
                          value={endTime ? new Date(endTime) : (startTime ? new Date(startTime) : new Date())}
                          mode="datetime"
                          display="spinner"
                          onChange={(event, selectedDate) => {
                            if (selectedDate) setEndTime(selectedDate.toISOString());
                          }}
                        />
                        <TouchableOpacity 
                          style={styles.donePickerButton} 
                          onPress={() => setShowEndPicker(false)}
                        >
                          <Text style={styles.donePickerButtonText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.valueText}>🏁 {endTime ? new Date(endTime).toLocaleString() : 'Not set'}</Text>
                )}
              </View>

              {/* Participants Card */}
              <View style={styles.card}>
                <Text style={styles.sectionHeading}>Participants ({participants.length})</Text>

                {/* Participant Chips */}
                <View style={styles.chipsContainer}>
                  {participants.map(p => {
                    const isCreator = p.user_id === creatorId;
                    return (
                      <View key={p.id} style={[styles.chip, isCreator && styles.organizerChip]}>
                        <Text style={styles.chipText} numberOfLines={1}>
                          {p.profiles?.full_name || p.profiles?.email}
                        </Text>

                        {isCreator && (
                          <View style={styles.organizerBadge}>
                            <Text style={styles.organizerBadgeText}>Organizer</Text>
                          </View>
                        )}

                        <View style={[
                          styles.statusDot, 
                          p.status === 'accepted' ? styles.dotAccepted : 
                          p.status === 'declined' ? styles.dotDeclined : styles.dotPending
                        ]} />

                        {isOrganizer && isEditing && !isCreator && (
                          <TouchableOpacity onPress={() => removeParticipant(p.id)} style={styles.chipRemove}>
                            <Ionicons name="close-circle" size={16} color="#888" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Search & Add Participants */}
                {isOrganizer && isEditing && (
                  <View style={styles.addParticipantSection}>
                    <Text style={styles.label}>Invite New Participant</Text>
                    <View style={styles.searchContainer}>
                      <Ionicons name="search-outline" size={16} color="#888" style={styles.searchIcon} />
                      <TextInput 
                        style={styles.searchInput}
                        placeholder="Search by email..."
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                      />
                      {isSearching && <ActivityIndicator size="small" color="#007AFF" />}
                    </View>

                    {searchResults.length > 0 && (
                      <View style={styles.resultsContainer}>
                        {searchResults.map(item => (
                          <TouchableOpacity 
                            key={item.id} 
                            style={styles.resultItem}
                            onPress={() => addParticipant(item)}
                          >
                            <Text style={styles.resultEmail}>{item.email}</Text>
                            <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Save / Cancel Controls */}
                {isEditing && (
                  <View style={styles.editActionRow}>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdits}>
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={[styles.sectionHeading, { marginVertical: 12 }]}>Discussion Thread</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.sender_id === currentUserId;
            return (
              <View style={[styles.bubbleWrapper, isMe ? styles.myMessage : styles.theirMessage]}>
                {!isMe && (
                  <Text style={styles.senderName}>
                    {item.profiles?.full_name || item.profiles?.email}
                  </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 60 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 },
  iconButton: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  editToggleButton: { backgroundColor: '#EBF3FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  editToggleText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  headerSection: { gap: 12 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  badge: { backgroundColor: '#E0F2FE', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  badgeText: { color: '#0369A1', fontSize: 11, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 10 },
  valueText: { fontSize: 15, color: '#111', fontWeight: '500', marginTop: 2 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#DDD', padding: 10, borderRadius: 8, fontSize: 15, color: '#111', marginTop: 4 },
  textArea: { height: 80, textAlignVertical: 'top' },
  datePickerButton: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#DDD', padding: 12, borderRadius: 8, marginTop: 4 },
  datePickerButtonText: { fontSize: 15, color: '#111', fontWeight: '500' },
  donePickerButton: { backgroundColor: '#007AFF', padding: 6, borderRadius: 6, alignItems: 'center', marginTop: 6 },
  donePickerButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  editActionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, backgroundColor: '#F1F3F5', padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButtonText: { color: '#495057', fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: '600' },
  
  // Chips & Participants
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, gap: 6 },
  organizerChip: { backgroundColor: '#EBF3FF', borderWidth: 1, borderColor: '#CCE0FF' },
  organizerBadge: { backgroundColor: '#007AFF', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  organizerBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500', maxWidth: 140 },
  chipRemove: { marginLeft: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotAccepted: { backgroundColor: '#10B981' },
  dotPending: { backgroundColor: '#F59E0B' },
  dotDeclined: { backgroundColor: '#EF4444' },

  addParticipantSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 8, paddingHorizontal: 10, marginTop: 6 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#111' },
  resultsContainer: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 8, marginTop: 4 },
  resultItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  resultEmail: { fontSize: 13, color: '#111' },

  // Chat Bubbles
  bubbleWrapper: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 10 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF' },
  senderName: { fontSize: 11, color: '#666', marginBottom: 2, fontWeight: '600' },
  messageText: { fontSize: 14 },
  myText: { color: '#FFF' },
  theirText: { color: '#111' },

  // Footer Input
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EFEFEF', alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#111' },
  sendButton: { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});