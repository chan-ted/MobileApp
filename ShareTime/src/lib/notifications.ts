import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let channelReady = false;

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (error) {
  console.warn('Notification handler setup skipped:', error);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      // Delete old channel if needed or recreate without custom sound string
      await Notifications.setNotificationChannelAsync('event-reminders', {
        name: 'Event Reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
      channelReady = true;
    } catch (channelError) {
      channelReady = false;
      console.warn('Notification channel setup skipped:', channelError);
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (permError) {
    console.warn('Notification permission request failed:', permError);
    return false;
  }
}

export async function scheduleOneHourEventReminder(params: {
  eventId: string;
  title: string;
  startTimeIso: string;
  venueName?: string | null;
}) {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    const identifier = `event-reminder-${params.eventId}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

    const startMs = new Date(params.startTimeIso).getTime();
    if (Number.isNaN(startMs)) return;

    const triggerDate = new Date(startMs - 60 * 60 * 1000);
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
        sound: true,
      },
      trigger:
        Platform.OS === 'android' && channelReady
          ? {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
              channelId: 'event-reminders',
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            },
    });
  } catch (error) {
    console.warn('Failed to schedule 1-hour event reminder:', error);
  }
}

export async function cancelEventReminder(eventId: string) {
  const identifier = `event-reminder-${eventId}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}