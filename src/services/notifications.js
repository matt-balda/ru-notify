import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidVisibility,
  AndroidNotificationSetting,
  TriggerType,
} from '@notifee/react-native';
import {CHANNEL_ID, NOTIFICATION_ID_PREFIX} from '../constants';

export async function ensureNotificationSetup() {
  await notifee.requestPermission();
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Cardápio RU06',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });
  return notifee.getNotificationSettings();
}

// Trigger notifications scheduled with the AlarmManager need the "Alarms &
// reminders" permission on Android 12+. Without it the OS silently downgrades
// them to an inexact (and unreliable) delivery window.
export async function hasExactAlarmPermission() {
  const settings = await notifee.getNotificationSettings();
  return settings.android.alarm === AndroidNotificationSetting.ENABLED;
}

// Notifee rejects a trigger that isn't in the future, and callers decide
// what's still ahead from a `now` taken before a fetch that can take seconds;
// a slot that passed meanwhile is skipped instead (returns false).
const MIN_TRIGGER_LEAD_MS = 1000;

export async function scheduleTriggerNotification({id, title, body, date}) {
  if (date.getTime() <= Date.now() + MIN_TRIGGER_LEAD_MS) {
    return false;
  }
  // Notifee silently drops a trigger notification instead of scheduling it if
  // an *exact* AlarmType is requested but the "Alarms & reminders" permission
  // hasn't been granted. Falling back to the non-exact (but still
  // idle-tolerant) alarm type keeps every notification working out of the
  // box; exact timing only kicks in once/if the user grants that permission.
  const exact = await hasExactAlarmPermission();
  await notifee.createTriggerNotification(
    {
      id,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        pressAction: {id: 'default'},
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: date.getTime(),
      alarmManager: {
        type: exact
          ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE
          : AlarmType.SET_AND_ALLOW_WHILE_IDLE,
      },
    },
  );
  return true;
}

export async function displayImmediateNotification({id, title, body}) {
  await notifee.displayNotification({
    id,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      pressAction: {id: 'default'},
      // Re-posting the same id (e.g. a retried job) updates it silently.
      onlyAlertOnce: true,
    },
  });
}

// Cancels every pending menu notification and returns the ids that were
// still pending, i.e. hadn't fired yet.
export async function cancelAllScheduledMenuNotifications() {
  const triggerIds = await notifee.getTriggerNotificationIds();
  const toCancel = triggerIds.filter(id => id.startsWith(NOTIFICATION_ID_PREFIX));
  if (toCancel.length) {
    await notifee.cancelTriggerNotifications(toCancel);
  }
  return toCancel;
}
