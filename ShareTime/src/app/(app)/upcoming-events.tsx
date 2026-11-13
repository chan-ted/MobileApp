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
  Alert 
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type EventItem = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  created_by: string;
};

// Helper function to map WMO Weather Codes to background images
function getWeatherBackgroundImage(weatherCode: number) {
  switch (weatherCode) {
    case 0:
      return { uri: 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1000&auto=format&fit=crop' }; // Sunny
    case 1:
    case 2:
    case 3:
      return { uri: 'https://images.unsplash.com/photo-1534088568595-a066fa41088a?q=80&w=1000&auto=format&fit=crop' }; // Cloudy
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
      return { uri: 'https://images.unsplash.com/photo-1605727216801-e27ce180cc28?q=80&w=1000&auto=format&fit=crop' }; // Stormy
    default:
      return { uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop' };
  }
}

export default function UpcomingEventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Weather States for Tomorrow
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([fetchUpcomingEvents(), fetchTomorrowWeather()]);
  }

  async function fetchUpcomingEvents() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const nowIso = new Date().toISOString();

      // 1. Fetch upcoming events created by the user
      const { data: createdEvents, error: createdError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', user.id)
        .gt('start_time', nowIso);

      if (createdError) throw createdError;

      // 2. Fetch upcoming events where the user is a participant
      const { data: participantRows, error: partError } = await supabase
        .from('event_participants')
        .select('event_id, events(*)')
        .eq('user_id', user.id);

      if (partError) throw partError;

      const participatingEvents = (participantRows || [])
        .map((p: any) => p.events)
        .filter((e: any) => e && e.start_time > nowIso);

      // 3. Combine and deduplicate events
      const eventMap = new Map<string, EventItem>();
      [...(createdEvents || []), ...participatingEvents].forEach((ev) => {
        if (ev && !eventMap.has(ev.id)) {
          eventMap.set(ev.id, ev);
        }
      });

      const uniqueUpcomingEvents = Array.from(eventMap.values()).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      setEvents(uniqueUpcomingEvents);
    } catch (error: any) {
      console.error('Error fetching upcoming events:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchTomorrowWeather() {
    try {
      let lat = '40.7128';
      let lon = '-74.0060';

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
          <Text style={styles.headerTitle}>Upcoming & Weather</Text>
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
              <Text style={styles.emptyText}>No upcoming events found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.eventCard}
              onPress={() => router.push(`/event/${item.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={18} color="#666" />
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
              </View>
            </TouchableOpacity>
          )}
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  eventDescription: { fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 18 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: '#FFF', fontWeight: '500' },
});