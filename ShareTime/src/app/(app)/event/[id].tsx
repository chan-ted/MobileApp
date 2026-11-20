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
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

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
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  // Venue Edit States
  const [editVenueQuery, setEditVenueQuery] = useState('');
  const [editVenueResults, setEditVenueResults] = useState<Venue[]>([]);
  const [selectedEditVenue, setSelectedEditVenue] = useState<Venue | null>(null);
  const [isSearchingVenues, setIsSearchingVenues] = useState(false);

  // Picker visibility toggles (mainly for iOS inline display)
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Original states for cancel revert
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');
  const [originalStartTime, setOriginalStartTime] = useState('');
  const [originalEndTime, setOriginalEndTime] = useState('');
  const [originalVenue, setOriginalVenue] = useState<Venue | null>(null);

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

        // 2. Fetch Linked Venue (including image_url) if present
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
        setOriginalVenue(loadedVenue);
        setSelectedEditVenue(loadedVenue);
        setEditVenueQuery(loadedVenue?.name || '');

        // 3. Fetch Creator Profile via 2-step query
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name, avatar_url')
          .eq('id', eventData.created_by)
          .single();

        setCreatorName(creatorProfile?.full_name || creatorProfile?.email || 'Unknown Organizer');

        // 4. Mark event messages as read immediately upon opening
        await markAsRead(id, user.id);

        // 5. Fetch Participants & Messages
        await fetchParticipants(user.id);
        await fetchMessages();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      } finally {
        setLoading(false);
      }
    }

    init();

    // 6. Realtime Chat Subscription
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${id}` },
        async (payload) => {
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
      
      const { data } = await supabase
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

  // --- Change Current User RSVP Status (accepted / pending / declined) ---
  async function handleChangeMyStatus(nextStatus: RsvpStatus) {
    if (!currentUserId || !id || updatingStatus || myStatus === nextStatus) return;

    setUpdatingStatus(true);
    try {
      const { data: updatedRows, error: updateError } = await supabase
        .from('event_participants')
        .update({ status: nextStatus })
        .eq('event_id', id)
        .eq('user_id', currentUserId)
        .select('id');

      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase
          .from('event_participants')
          .insert({
            event_id: id,
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

  // --- Venue Search & Selection While Editing ---
  async function handleEditVenueSearch(text: string) {
    setEditVenueQuery(text);
    setSelectedEditVenue(null);

    if (text.trim().length < 1) {
      setEditVenueResults([]);
      return;
    }

    setIsSearchingVenues(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, description, image_url')
        .ilike('name', `%${text.trim()}%`)
        .order('name', { ascending: true })
        .limit(6);

      if (error) throw error;
      setEditVenueResults(data || []);
    } catch (err: any) {
      console.error('Error searching venues:', err.message);
    } finally {
      setIsSearchingVenues(false);
    }
  }

  function handleSelectEditVenue(item: Venue) {
    setSelectedEditVenue(item);
    setEditVenueQuery(item.name);
    setEditVenueResults([]);
  }

  function handleClearEditVenue() {
    setSelectedEditVenue(null);
    setEditVenueQuery('');
    setEditVenueResults([]);
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
  async function fetchParticipants(activeUserId?: string | null) {
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
            profiles: profileMap.get(p.user_id) || { id: p.user_id, email: 'Unknown', avatar_url: null },
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
          profiles:sender_id (email, full_name, avatar_url)
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
          ? (item.profiles[0] || { email: 'Unknown', avatar_url: null })
          : (item.profiles || { email: 'Unknown', avatar_url: null }),
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
        .select('id, email, full_name, avatar_url')
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

  // --- Event Edit Logic (including Venue) ---
  async function handleSaveEdits() {
    if (!title.trim()) {
      Alert.alert('Error', 'Title cannot be empty.');
      return;
    }

    try {
      let resolvedVenue: Venue | null = selectedEditVenue;
      const trimmedVenueText = editVenueQuery.trim();

      if (!resolvedVenue && trimmedVenueText.length > 0) {
        if (!currentUserId) throw new Error('Not authenticated');

        const { data: createdVenue, error: venueCreateError } = await supabase
          .from('venues')
          .insert({
            name: trimmedVenueText,
            creator_id: currentUserId,
          })
          .select('id, name, description, image_url')
          .single();

        if (venueCreateError) throw venueCreateError;
        resolvedVenue = createdVenue;
      }

      const { error } = await supabase
        .from('events')
        .update({
          title: title.trim(),
          description: description.trim(),
          start_time: startTime.trim(),
          end_time: endTime.trim() || null,
          venue_id: resolvedVenue ? resolvedVenue.id : null,
        })
        .eq('id', id);

      if (error) throw error;

      setVenue(resolvedVenue);
      setOriginalVenue(resolvedVenue);
      setSelectedEditVenue(resolvedVenue);
      setEditVenueQuery(resolvedVenue?.name || '');
      setEditVenueResults([]);

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
    setVenue(originalVenue);
    setSelectedEditVenue(originalVenue);
    setEditVenueQuery(originalVenue?.name || '');
    setEditVenueResults([]);
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

                {/* Organizer Info */}
                <Text style={styles.label}>Organizer</Text>
                <Text style={styles.valueText}>👤 {creatorName}</Text>

                {/* Venue Info & Chip with Picture */}
                <Text style={styles.label}>Venue</Text>
                {isEditing ? (
                  <View>
                    <View style={styles.searchContainer}>
                      <Ionicons name="location-outline" size={16} color="#888" style={styles.searchIcon} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search venue or type a new name..."
                        placeholderTextColor="#999"
                        value={editVenueQuery}
                        onChangeText={handleEditVenueSearch}
                      />
                      {isSearchingVenues && <ActivityIndicator size="small" color="#007AFF" />}
                      {editVenueQuery.length > 0 && !isSearchingVenues && (
                        <TouchableOpacity onPress={handleClearEditVenue}>
                          <Ionicons name="close-circle" size={18} color="#888" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {editVenueResults.length > 0 && (
                      <View style={styles.resultsContainer}>
                        {editVenueResults.map(v => (
                          <TouchableOpacity
                            key={v.id}
                            style={styles.resultItem}
                            onPress={() => handleSelectEditVenue(v)}
                          >
                            <View style={styles.searchResultLeft}>
                              {v.image_url ? (
                                <Image source={{ uri: v.image_url }} style={styles.venueSearchThumb} />
                              ) : (
                                <Ionicons name="location-outline" size={18} color="#007AFF" />
                              )}
                              <Text style={styles.resultEmail}>{v.name}</Text>
                            </View>
                            <Ionicons name="checkmark-circle-outline" size={18} color="#007AFF" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.helperNote}>
                      {selectedEditVenue
                        ? `Selected existing venue: ${selectedEditVenue.name}`
                        : editVenueQuery.trim()
                        ? `Will create new venue "${editVenueQuery.trim()}" on save`
                        : 'No venue selected (will clear venue on save)'}
                    </Text>
                  </View>
                ) : venue ? (
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
                  <View style={styles.unassignedVenueRow}>
                    <Text style={styles.valueText}>No venue assigned</Text>
                    {isOrganizer && (
                      <TouchableOpacity
                        style={styles.assignVenueBtn}
                        onPress={() => setIsEditing(true)}
                      >
                        <Text style={styles.assignVenueBtnText}>+ Add Venue</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

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
                    const displayLabel = p.profiles?.full_name || p.profiles?.email;
                    return (
                      <View key={p.id} style={[styles.chip, isCreator && styles.organizerChip]}>
                        <TouchableOpacity
                          style={styles.chipLinkArea}
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

                          <View style={[
                            styles.statusDot, 
                            p.status === 'accepted' ? styles.dotAccepted : 
                            p.status === 'declined' ? styles.dotDeclined : styles.dotPending
                          ]} />
                        </TouchableOpacity>

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
                            <View style={styles.searchResultLeft}>
                              <SmallAvatar
                                uri={item.avatar_url}
                                name={item.full_name || item.email}
                                size={22}
                              />
                              <Text style={styles.resultEmail}>{item.email}</Text>
                            </View>
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
            const senderLabel = item.profiles?.full_name || item.profiles?.email;
            return (
              <View style={[styles.bubbleWrapper, isMe ? styles.myMessage : styles.theirMessage]}>
                {!isMe && (
                  <View style={styles.senderRow}>
                    <SmallAvatar
                      uri={item.profiles?.avatar_url}
                      name={senderLabel}
                      size={18}
                    />
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
  venueSearchThumb: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  venueLinkText: { fontSize: 14, color: '#007AFF', fontWeight: '600', flexShrink: 1 },
  unassignedVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  assignVenueBtn: {
    backgroundColor: '#EBF3FF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  assignVenueBtnText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },
  helperNote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
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
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 16, gap: 6 },
  chipLinkArea: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  organizerChip: { backgroundColor: '#EBF3FF', borderWidth: 1, borderColor: '#CCE0FF' },
  organizerBadge: { backgroundColor: '#007AFF', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  organizerBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500', maxWidth: 130 },
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
  searchResultLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultEmail: { fontSize: 13, color: '#111' },

  // Chat Bubbles
  bubbleWrapper: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 10 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  senderName: { fontSize: 11, color: '#666', fontWeight: '600' },
  messageText: { fontSize: 14 },
  myText: { color: '#FFF' },
  theirText: { color: '#111' },

  // Footer Input
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EFEFEF', alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#111' },
  sendButton: { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});