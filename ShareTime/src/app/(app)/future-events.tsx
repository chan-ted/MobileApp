import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type EventStatus = 'accepted' | 'pending' | 'declined';

type FutureEventItem = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  created_by: string;
  isOrganizer: boolean;
  status: EventStatus;
};

// Helper function to map WMO Weather Codes to background images
function getWeatherBackgroundImage(weatherCode: number) {
  switch (weatherCode) {
    case 0:
      return { uri: 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1000&auto=format&fit=crop' }; // Sunny
    case 1:
    case 2:
    case 3:
      return { uri: 'https://images.pexels.com/photos/158163/clouds-cloudporn-weather-lookup-158163.jpeg?auto=compress&cs=tinysrgb&w=1080' }; // Cloudy
    case 45:
    case 48:
      return { uri: 'https://images.unsplash.com/photo-1485236715568-ddc5ee6ca227?q=80&w=1000&auto=format&fit=crop' }; // Foggy
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return { uri: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?q=80&w=1000&auto=format&fit=crop' }; // Rainy
    case 71:
    case 73:
    case 75:
    case 85:
    case 86:
      return { uri: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?q=80&w=1000&auto=format&fit=crop' }; // Snowy
    case 95:
    case 96:
    case 99:
      return { uri: 'https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg?auto=compress&cs=tinysrgb&w=1080' }; // Stormy
    default:
      return { uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop' };
  }
}

function getStatusBadgeStyle(isOrganizer: boolean, status: EventStatus) {
  if (isOrganizer) {
    return {
      badge: styles.badgeOrganizer,
      text: styles.badgeOrganizerText,
      label: 'Organizer · Accepted',
    };
  }
  if (status === 'accepted') {
    return {
      badge: styles.badgeAccepted,
      text: styles.badgeAcceptedText,
      label: 'Accepted',
    };
  }
  if (status === 'declined') {
    return {
      badge: styles.badgeDeclined,
      text: styles.badgeDeclinedText,
      label: 'Declined',
    };
  }
  return {
    badge: styles.badgePending,
    text: styles.badgePendingText,
    label: 'Pending',
  };
}

export default function FutureEventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<FutureEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Weather States for Tomorrow
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([fetchFutureEvents(), fetchTomorrowWeather()]);
  }

  async function fetchFutureEvents() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const nowIso = new Date().toISOString();

      // 1. Fetch future events created by the user
      const { data: createdEvents, error: createdError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', user.id)
        .gt('start_time', nowIso);

      if (createdError) throw createdError;

      // 2. Fetch future events where the user is a participant (including status)
      const { data: participantRows, error: partError } = await supabase
        .from('event_participants')
        .select('event_id, status, events(*)')
        .eq('user_id', user.id);

      if (partError) throw partError;

      const statusByEventId = new Map<string, EventStatus>();
      (participantRows || []).forEach((p: any) => {
        if (p.event_id && p.status) {
          statusByEventId.set(p.event_id, p.status as EventStatus);
        }
      });

      const eventMap = new Map<string, FutureEventItem>();

      // Add organizer events first
      (createdEvents || []).forEach((ev: any) => {
        if (ev) {
          eventMap.set(ev.id, {
            ...ev,
            isOrganizer: true,
            status: statusByEventId.get(ev.id) || 'accepted',
          });
        }
      });

      // Add invited participant events
      (participantRows || []).forEach((p: any) => {
        const ev = p.events;
        if (ev && ev.start_time > nowIso && !eventMap.has(ev.id)) {
          eventMap.set(ev.id, {
            ...ev,
            isOrganizer: ev.created_by === user.id,
            status: (p.status as EventStatus) || 'pending',
          });
        }
      });

      const uniqueFutureEvents = Array.from(eventMap.values()).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      setEvents(uniqueFutureEvents);
    } catch (error: any) {
      console.error('Error fetching future events:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchTomorrowWeather() {
    try {
      let lat = '56.4620';
      let lon = '-2.9707';

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        lat = currentLocation.coords.latitude.toString();
        lon = currentLocation.coords.longitude.toString();
      }

      // Calculate tomorrow's date string (YYYY-MM-DD)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max&timezone=auto`;
      const response = await fetch(endpoint);
      const data = await response.json();

      if (data && data.daily && data.daily.time) {
        const tomorrowIndex = data.daily.time.indexOf(tomorrowStr);
        if (tomorrowIndex !== -1) {
          setWeatherCode(data.daily.weather_code[tomorrowIndex]);
          setTemperature(data.daily.temperature_2m_max[tomorrowIndex]);
        }
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const backgroundImage = weatherCode !== null 
    ? getWeatherBackgroundImage(weatherCode) 
    : { uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop' };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ImageBackground source={backgroundImage} style={styles.background} resizeMode="cover">
      <View style={styles.overlay}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Future Events</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tomorrow Weather Widget Banner */}
        <View style={styles.weatherBanner}>
          <View>
            <Text style={styles.bannerSubtitle}>Tomorrow's Forecast</Text>
            <Text style={styles.bannerTitle}>
              {temperature !== null ? `${temperature}°C` : 'Loading temp...'}
            </Text>
          </View>
          <Ionicons name="partly-sunny-outline" size={32} color="#FFF" />
        </View>

        {/* Events List */}
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.7)" />
              <Text style={styles.emptyText}>No future events found.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusMeta = getStatusBadgeStyle(item.isOrganizer, item.status);

            return (
              <TouchableOpacity 
                style={styles.eventCard}
                onPress={() => router.push(`/event/${item.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.statusBadge, statusMeta.badge]}>
                    <Text style={[styles.statusBadgeText, statusMeta.text]}>{statusMeta.label}</Text>
                  </View>
                </View>

                <Text style={styles.eventDescription} numberOfLines={2}>
                  {item.description || 'No description provided.'}
                </Text>

                <View style={styles.cardFooter}>
                  <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={14} color="#007AFF" />
                    <Text style={styles.timeText}>
                      {new Date(item.start_time).toLocaleDateString()} at {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#888" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', paddingTop: 60 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  backButton: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  
  weatherBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)' },
  bannerSubtitle: { fontSize: 12, color: '#E0E0E0', textTransform: 'uppercase', fontWeight: '600' },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 2 },

  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  eventCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1 },

  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  badgeOrganizer: { backgroundColor: '#E0F2FE' },
  badgeOrganizerText: { color: '#0369A1' },
  badgeAccepted: { backgroundColor: '#DCFCE7' },
  badgeAcceptedText: { color: '#15803D' },
  badgeDeclined: { backgroundColor: '#FEE2E2' },
  badgeDeclinedText: { color: '#B91C1C' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgePendingText: { color: '#B45309' },

  eventDescription: { fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: '#FFF', fontWeight: '500' },
});