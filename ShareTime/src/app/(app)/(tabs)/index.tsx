import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  Switch,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type EventStatus = 'accepted' | 'pending' | 'declined';

type Next24hEventItem = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  created_by: string;
  isOrganizer: boolean;
  status: EventStatus;
};

function getWeatherBackgroundImage(weatherCode: number) {
  switch (weatherCode) {
    case 0:
      return { uri: 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1000&auto=format&fit=crop' };
    case 1:
    case 2:
    case 3:
      return { uri: 'https://images.pexels.com/photos/158163/clouds-cloudporn-weather-lookup-158163.jpeg?auto=compress&cs=tinysrgb&w=1080' };
    case 45:
    case 48:
      return { uri: 'https://images.unsplash.com/photo-1485236715568-ddc5ee6ca227?q=80&w=1000&auto=format&fit=crop' };
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return { uri: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?q=80&w=1000&auto=format&fit=crop' };
    case 71:
    case 73:
    case 75:
    case 85:
    case 86:
      return { uri: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?q=80&w=1000&auto=format&fit=crop' };
    case 95:
    case 96:
    case 99:
      return { uri: 'https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg?auto=compress&cs=tinysrgb&w=1080' };
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

export default function EventsHomeScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Next24hEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeclined, setShowDeclined] = useState(true);

  // Weather States for Today
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    await Promise.all([fetchNext24hEvents(), fetchTodayWeather()]);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      fetchNext24hEvents();
    }, [])
  );

  async function fetchNext24hEvents() {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const nowIso = now.toISOString();
      const next24HoursIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const { data: createdEvents, error: createdError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', user.id)
        .gte('start_time', nowIso)
        .lte('start_time', next24HoursIso);

      if (createdError) throw createdError;

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

      const eventMap = new Map<string, Next24hEventItem>();

      (createdEvents || []).forEach((ev: any) => {
        if (ev) {
          eventMap.set(ev.id, {
            ...ev,
            isOrganizer: true,
            status: statusByEventId.get(ev.id) || 'accepted',
          });
        }
      });

      (participantRows || []).forEach((p: any) => {
        const ev = p.events;
        if (
          ev &&
          ev.start_time >= nowIso &&
          ev.start_time <= next24HoursIso &&
          !eventMap.has(ev.id)
        ) {
          eventMap.set(ev.id, {
            ...ev,
            isOrganizer: ev.created_by === user.id,
            status: (p.status as EventStatus) || 'pending',
          });
        }
      });

      const uniqueEvents = Array.from(eventMap.values()).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      setEvents(uniqueEvents);
    } catch (error: any) {
      console.error('Error fetching 24h events:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchTodayWeather() {
  try {
    let lat = '56.4620';
    let lon = '-2.9707';

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = currentLocation.coords.latitude.toFixed(4);
        lon = currentLocation.coords.longitude.toFixed(4);
      }
    } catch {
      // Keep Dundee fallback coordinates if location lookup fails/times out
    }

    const endpoint =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&models=ukmo_seamless` +
      `&timezone=auto`;

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data?.current) {
      setWeatherCode(data.current.weather_code);
      setTemperature(Math.round(data.current.temperature_2m));
    }
  } catch (error) {
    console.error('Error fetching today weather:', error);
  }
}

  function getWeatherDetails(weatherCode: number | null | undefined) {
  const code = Number(weatherCode);

  if (Number.isNaN(code)) {
    return { label: 'Weather', icon: 'partly-sunny-outline' as const };
  }
  if (code === 0) {
    return { label: 'Clear Sky', icon: 'sunny-outline' as const };
  }
  if (code === 1 || code === 2 || code === 3) {
    return {
      label: code === 3 ? 'Overcast' : 'Partly Cloudy',
      icon: code === 3 ? ('cloud-outline' as const) : ('partly-sunny-outline' as const),
    };
  }
  if (code === 45 || code === 48) {
    return { label: 'Fog', icon: 'cloudy-outline' as const };
  }
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return { label: 'Rain', icon: 'rainy-outline' as const };
  }
  if ([71, 73, 75, 85, 86].includes(code)) {
    return { label: 'Snow', icon: 'snow-outline' as const };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: 'Thunderstorm', icon: 'thunderstorm-outline' as const };
  }

  return { label: 'Clear', icon: 'sunny-outline' as const };
}

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const visibleEvents = showDeclined
    ? events
    : events.filter(ev => ev.status !== 'declined');

  const backgroundImage =
    weatherCode !== null
      ? getWeatherBackgroundImage(weatherCode)
      : { uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop' };


const weatherDetails = getWeatherDetails(weatherCode);


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
          <Text style={styles.headerTitle}>Next 24 Hours</Text>
        </View>

{/* Today's Weather Widget Banner */}
<View style={styles.weatherBanner}>
  <View>
    <Text style={styles.bannerSubtitle}>
      Today's Weather · {weatherDetails.label}
    </Text>
    <Text style={styles.bannerTitle}>
      {temperature !== null ? `${temperature}°C` : 'Loading temp...'}
    </Text>
  </View>
  <Ionicons name={weatherDetails.icon} size={32} color="#FFF" />
</View>

        {/* Navigation Links to Past Events & Future Events */}
        <View style={styles.navLinksRow}>
          <TouchableOpacity
            style={styles.navPill}
            onPress={() => router.push('/past-events' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={16} color="#FFF" />
            <Text style={styles.navPillText}>Past Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            onPress={() => router.push('/future-events' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={16} color="#FFF" />
            <Text style={styles.navPillText}>Future Events</Text>
          </TouchableOpacity>
        </View>

        {/* Show Declined Switch Bar */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show Declined Events</Text>
          <Switch
            value={showDeclined}
            onValueChange={setShowDeclined}
            trackColor={{ false: 'rgba(255,255,255,0.3)', true: '#007AFF' }}
            thumbColor="#FFF"
          />
        </View>

        {/* Events List */}
        <FlatList
          data={visibleEvents}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.7)" />
              <Text style={styles.emptyText}>
                {showDeclined
                  ? 'No events in the next 24 hours.'
                  : 'No non-declined events in the next 24 hours.'}
              </Text>
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
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={[styles.statusBadge, statusMeta.badge]}>
                    <Text style={[styles.statusBadgeText, statusMeta.text]}>
                      {statusMeta.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.eventDescription} numberOfLines={2}>
                  {item.description || 'No description provided.'}
                </Text>

                <View style={styles.cardFooter}>
                  <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={14} color="#007AFF" />
                    <Text style={styles.timeText}>
                      {new Date(item.start_time).toLocaleDateString()} at{' '}
                      {new Date(item.start_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#888" />
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Floating Create Event Button at Bottom Right */}
        <TouchableOpacity
          style={styles.floatingCreateButton}
          onPress={() => router.push('/create-event' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#FFF" />
          <Text style={styles.floatingCreateText}>Create Event</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', paddingTop: 60 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },

  weatherBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  bannerSubtitle: {
    fontSize: 11,
    color: '#E0E0E0',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 2 },

  navLinksRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  navPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  navPillText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  switchLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 10,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#FFF', fontWeight: '500', textAlign: 'center' },

  floatingCreateButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  floatingCreateText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});