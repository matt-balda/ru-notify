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

export async function scheduleTriggerNotification({id, title, body, date}) {
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
}

export async function displayImmediateNotification({id, title, body}) {
  await notifee.displayNotification({
    id,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      pressAction: {id: 'default'},
    },
  });
}

export async function cancelAllScheduledMenuNotifications() {
  const triggerIds = await notifee.getTriggerNotificationIds();
  const toCancel = triggerIds.filter(id => id.startsWith(NOTIFICATION_ID_PREFIX));
  if (toCancel.length) {
    await notifee.cancelTriggerNotifications(toCancel);
  }
}
