import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ADVANCE_NOTICE_HOURS,
  ADVANCE_NOTICE_MAX_HOURS,
  ADVANCE_NOTICE_MIN_HOURS,
  MEAL_TIMES,
} from '../constants';

const STORAGE_KEY_PREFERENCES = '@ru_notify/preferences';

// What the setup screen starts with on first launch. The worst dish is its
// id in the proteins database, plus a copy of its name and normalized name so
// the alerts and the menu highlight keep working if the database can't be read.
export const DEFAULT_PREFERENCES = {
  lunchTime: {hour: MEAL_TIMES.lunch.hour, minute: MEAL_TIMES.lunch.minute},
  dinnerTime: {hour: MEAL_TIMES.dinner.hour, minute: MEAL_TIMES.dinner.minute},
  advanceNoticeHours: ADVANCE_NOTICE_HOURS,
  worstProteinId: null,
  worstProteinName: null,
  worstProteinKey: null,
};

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function toText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeTime(time, fallback) {
  return {
    hour: clamp(toInt(time?.hour, fallback.hour), 0, 23),
    minute: clamp(toInt(time?.minute, fallback.minute), 0, 59),
  };
}

// Fills in anything missing or out of range with the defaults, so a partial
// or older saved object can't break scheduling.
export function sanitizePreferences(prefs) {
  let worstProteinId = toInt(prefs?.worstProteinId, null);
  if (worstProteinId !== null && worstProteinId < 1) {
    worstProteinId = null;
  }
  return {
    lunchTime: sanitizeTime(prefs?.lunchTime, DEFAULT_PREFERENCES.lunchTime),
    dinnerTime: sanitizeTime(prefs?.dinnerTime, DEFAULT_PREFERENCES.dinnerTime),
    advanceNoticeHours: clamp(
      toInt(prefs?.advanceNoticeHours, ADVANCE_NOTICE_HOURS),
      ADVANCE_NOTICE_MIN_HOURS,
      ADVANCE_NOTICE_MAX_HOURS,
    ),
    worstProteinId,
    worstProteinName: worstProteinId === null ? null : toText(prefs?.worstProteinName),
    worstProteinKey: worstProteinId === null ? null : toText(prefs?.worstProteinKey),
  };
}

// The saved preferences, or null until the user has gone through the
// first-launch setup.
export async function getPreferences() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_PREFERENCES);
  if (!raw) {
    return null;
  }
  try {
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function savePreferences(prefs) {
  const clean = sanitizePreferences(prefs);
  await AsyncStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(clean));
  return clean;
}

// The saved copy of the worst dish, shaped like a proteinsDb row, or null.
export function savedWorstProtein(prefs) {
  if (!prefs?.worstProteinId || !prefs.worstProteinKey) {
    return null;
  }
  return {
    id: prefs.worstProteinId,
    name: prefs.worstProteinName ?? prefs.worstProteinKey,
    normalizedName: prefs.worstProteinKey,
    firstSeenWeek: null,
  };
}

// The notification time of `meal` ('lunch' | 'dinner') in `prefs`.
export function mealTimeFor(prefs, meal) {
  return meal === 'dinner' ? prefs.dinnerTime : prefs.lunchTime;
}

export function formatTime({hour, minute}) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
