import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications behave when the app is open in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('event-reminders', {
      name: 'Event Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleOneHourEventReminder(params: {
  eventId: string;
  title: string;
  startTimeIso: string;
  venueName?: string | null;
}) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const identifier = `event-reminder-${params.eventId}`;

  // Cancel any existing reminder for this event before scheduling a new one
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const startMs = new Date(params.startTimeIso).getTime();
  const triggerDate = new Date(startMs - 60 * 60 * 1000); // 1 hour before

  // Skip if the 1-hour-before mark has already passed
  if (triggerDate.getTime() <= Date.now()) {
    return;
  }

  const locationSuffix = params.venueName ? ` at ${params.venueName}` : '';

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Upcoming Event in 1 Hour',
      body: `"${params.title}" starts in 1 hour${locationSuffix}.`,
      data: { eventId: params.eventId },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: 'event-reminders',
    },
  });
}

export async function cancelEventReminder(eventId: string) {
  const identifier = `event-reminder-${eventId}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}