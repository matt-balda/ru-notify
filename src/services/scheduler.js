import AsyncStorage from '@react-native-async-storage/async-storage';
import {fetchRU06Menu} from '../api/menuFetcher';
import {findFishOccurrences} from '../utils/fishDetector';
import {
  ADVANCE_NOTICE_HOURS,
  MEAL_TIMES,
  NOTIFICATION_ID_PREFIX,
  WEEKDAY_ORDER,
  WEEKLY_FETCH_TIME,
} from '../constants';
import {
  cancelAllScheduledMenuNotifications,
  displayImmediateNotification,
  ensureNotificationSetup,
  scheduleTriggerNotification,
} from './notifications';

const STORAGE_KEY_WEEK_DATA = '@ru_notify/week_menu';
const STORAGE_KEY_LAST_WEEK_KEY = '@ru_notify/last_week_key';

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKeyFor(mondayDate) {
  const y = mondayDate.getFullYear();
  const m = String(mondayDate.getMonth() + 1).padStart(2, '0');
  const day = String(mondayDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateAt(mondayDate, dayOffset, hour, minute) {
  const d = new Date(mondayDate);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function scheduleDailyMenuNotifications(menu, monday, weekKey, now) {
  for (const mealType of Object.keys(MEAL_TIMES)) {
    const {hour, minute, label} = MEAL_TIMES[mealType];
    const days = menu[mealType].slice(0, WEEKDAY_ORDER.length);
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (!day.dishes.length) {
        continue;
      }
      const fireDate = dateAt(monday, i, hour, minute);
      if (fireDate.getTime() <= now.getTime()) {
        continue; // that slot already happened this week, skip it
      }
      await scheduleTriggerNotification({
        id: `${NOTIFICATION_ID_PREFIX}-${weekKey}-${mealType}-${i}`,
        title: `Cardápio RU06 · ${label} de ${WEEKDAY_ORDER[i]}`,
        body: day.dishes.join(' • '),
        date: fireDate,
      });
    }
  }
}

async function scheduleFishNotifications(menu, monday, weekKey, now) {
  const occurrences = findFishOccurrences(menu);
  if (!occurrences.length) {
    return occurrences;
  }

  const summary = occurrences
    .map(o => `${o.weekday} (${MEAL_TIMES[o.meal].label})`)
    .join(', ');
  await displayImmediateNotification({
    id: `${NOTIFICATION_ID_PREFIX}-${weekKey}-fish-summary`,
    title: '🐟 Filé de Peixe Empanado essa semana!',
    body: `No RU06 vai ter: ${summary}.`,
  });

  for (const occ of occurrences) {
    const {hour, minute, label} = MEAL_TIMES[occ.meal];
    const mealDate = dateAt(monday, occ.dayIndex, hour, minute);
    const advanceDate = new Date(
      mealDate.getTime() - ADVANCE_NOTICE_HOURS * 60 * 60 * 1000,
    );
    // For the meal itself falling on Monday the 12h-advance mark is already in
    // the past by the time this job runs (10h), so it's covered by the
    // immediate summary notification above instead of a separate alert.
    if (advanceDate.getTime() <= now.getTime()) {
      continue;
    }
    await scheduleTriggerNotification({
      id: `${NOTIFICATION_ID_PREFIX}-${weekKey}-fish-${occ.dayIndex}-${occ.meal}`,
      title: '🐟 Filé de Peixe Empanado se aproximando!',
      body: `Faltam ${ADVANCE_NOTICE_HOURS}h para o(a) ${label.toLowerCase()} de ${
        occ.weekday
      } com Filé de Peixe Empanado no RU06.`,
      date: advanceDate,
    });
  }

  return occurrences;
}

export async function runWeeklyMenuJob(now = new Date()) {
  const menu = await fetchRU06Menu();
  const monday = getMondayOfWeek(now);
  const weekKey = weekKeyFor(monday);

  await ensureNotificationSetup();
  await cancelAllScheduledMenuNotifications();
  await scheduleDailyMenuNotifications(menu, monday, weekKey, now);
  const fishOccurrences = await scheduleFishNotifications(menu, monday, weekKey, now);

  const result = {weekKey, menu, fishOccurrences, fetchedAt: now.toISOString()};
  await AsyncStorage.setItem(STORAGE_KEY_WEEK_DATA, JSON.stringify(result));
  await AsyncStorage.setItem(STORAGE_KEY_LAST_WEEK_KEY, weekKey);

  return result;
}

export async function shouldRunWeeklyJob(now = new Date()) {
  const lastWeekKey = await AsyncStorage.getItem(STORAGE_KEY_LAST_WEEK_KEY);
  if (!lastWeekKey) {
    return true; // never fetched before: bootstrap immediately regardless of day/time
  }
  const currentWeekKey = weekKeyFor(getMondayOfWeek(now));
  if (lastWeekKey === currentWeekKey) {
    return false; // already have this week's data
  }
  const isMonday = now.getDay() === 1;
  const totalMinutesNow = now.getHours() * 60 + now.getMinutes();
  const fetchMinutes = WEEKLY_FETCH_TIME.hour * 60 + WEEKLY_FETCH_TIME.minute;
  return isMonday && totalMinutesNow >= fetchMinutes;
}

export async function checkAndRunWeeklyJob(now = new Date()) {
  if (await shouldRunWeeklyJob(now)) {
    return runWeeklyMenuJob(now);
  }
  return null;
}

export async function getCachedWeekMenu() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_WEEK_DATA);
  return raw ? JSON.parse(raw) : null;
}

export const __private__ = {getMondayOfWeek, weekKeyFor, dateAt};
