import AsyncStorage from '@react-native-async-storage/async-storage';
import {fetchRU06Menu} from '../api/menuFetcher';
import {getProteinById, syncWeekProteins} from '../db/proteinsDb';
import {findWorstDishOccurrences} from '../utils/protein';
import {
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
import {
  getPreferences,
  mealTimeFor,
  savePreferences,
  savedWorstProtein,
} from './preferences';

const STORAGE_KEY_WEEK_DATA = '@ru_notify/week_menu';
const STORAGE_KEY_LAST_WEEK_KEY = '@ru_notify/last_week_key';
// `${weekKey}:${proteinId}` of the last "pior cardápio" summary sent, so it
// goes out once per week and dish instead of on every refresh or edit.
const STORAGE_KEY_ANNOUNCED_WORST = '@ru_notify/announced_worst';

const HOUR_MS = 60 * 60 * 1000;
const MEAL_WITH_ARTICLE = {lunch: 'o almoço', dinner: 'a janta'};

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

// Inverse of weekKeyFor: the local-midnight Monday a 'YYYY-MM-DD' key names.
function mondayFromWeekKey(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function dateAt(mondayDate, dayOffset, hour, minute) {
  const d = new Date(mondayDate);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// When the user wants to hear about `meal` on that day.
function mealDateFor(monday, dayIndex, meal, prefs) {
  const {hour, minute} = mealTimeFor(prefs, meal);
  return dateAt(monday, dayIndex, hour, minute);
}

// When the RU06 stops serving `meal` on that day.
function servedUntilFor(monday, dayIndex, meal) {
  const {hour, minute} = MEAL_TIMES[meal].servedUntil;
  return dateAt(monday, dayIndex, hour, minute);
}

function timeLeftText(ms) {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) {
    return 'Falta menos de 1h';
  }
  return `${hours === 1 ? 'Falta' : 'Faltam'} ${hours}h`;
}

// Runs every notification call even when some fail, so one bad slot can't
// cost the rest of the week; finish() then rethrows the first failure so the
// weekly job is retried.
function createNotifier() {
  const errors = [];
  return {
    attempt: async fn => {
      try {
        await fn();
      } catch (error) {
        console.warn('[RUNotify] Falha ao agendar notificação:', error);
        errors.push(error);
      }
    },
    finish: () => {
      if (errors.length) {
        throw errors[0];
      }
    },
  };
}

async function scheduleDailyMenuNotifications(menu, monday, weekKey, now, prefs, catchUp, attempt) {
  for (const mealType of Object.keys(MEAL_TIMES)) {
    const {label} = MEAL_TIMES[mealType];
    const days = (menu[mealType] ?? []).slice(0, WEEKDAY_ORDER.length);
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (!day.dishes.length) {
        continue;
      }
      const notification = {
        id: `${NOTIFICATION_ID_PREFIX}-${weekKey}-${mealType}-${i}`,
        title: `Cardápio RU06 · ${label} de ${WEEKDAY_ORDER[i]}`,
        body: day.dishes.join(' • '),
      };
      const fireDate = mealDateFor(monday, i, mealType, prefs);
      if (fireDate.getTime() > now.getTime()) {
        await attempt(() => scheduleTriggerNotification({...notification, date: fireDate}));
      } else if (catchUp && servedUntilFor(monday, i, mealType).getTime() > now.getTime()) {
        // Its time passed before the menu came in (a notice set before
        // Monday's 10h fetch, or a late background run), but the meal is
        // still being served: deliver it now.
        await attempt(() => displayImmediateNotification(notification));
      }
    }
  }
}

// Alerts for the user's "pior cardápio": a summary of the meals with it that
// aren't over yet (once per week and dish), plus one alert
// `advanceNoticeHours` before each of them. `pendingIds` are the alerts that
// hadn't fired yet before this reschedule.
async function scheduleWorstDishNotifications(
  menu,
  monday,
  weekKey,
  now,
  prefs,
  protein,
  pendingIds,
  attempt,
) {
  if (!protein) {
    return [];
  }
  const upcoming = findWorstDishOccurrences(menu, protein.normalizedName).filter(
    occ =>
      occ.dayIndex < WEEKDAY_ORDER.length &&
      servedUntilFor(monday, occ.dayIndex, occ.meal).getTime() > now.getTime(),
  );
  if (!upcoming.length) {
    return upcoming;
  }

  const announcedKey = `${weekKey}:${protein.id}`;
  if ((await AsyncStorage.getItem(STORAGE_KEY_ANNOUNCED_WORST)) !== announcedKey) {
    const summary = upcoming
      .map(o => `${WEEKDAY_ORDER[o.dayIndex]} (${MEAL_TIMES[o.meal].label})`)
      .join(', ');
    await attempt(async () => {
      await displayImmediateNotification({
        id: `${NOTIFICATION_ID_PREFIX}-${weekKey}-worst-summary`,
        title: `⚠️ ${protein.name} essa semana!`,
        body: `No RU06 vai ter: ${summary}.`,
      });
      await AsyncStorage.setItem(STORAGE_KEY_ANNOUNCED_WORST, announcedKey);
    });
  }

  const hours = prefs.advanceNoticeHours;
  for (const occ of upcoming) {
    const mealDate = mealDateFor(monday, occ.dayIndex, occ.meal, prefs);
    const advanceDate = new Date(mealDate.getTime() - hours * HOUR_MS);
    const id = `${NOTIFICATION_ID_PREFIX}-${weekKey}-worst-${occ.dayIndex}-${occ.meal}`;
    const alert = left => ({
      id,
      title: `⏰ ${protein.name} se aproximando!`,
      body: `${timeLeftText(left)} para ${MEAL_WITH_ARTICLE[occ.meal]} de ${
        WEEKDAY_ORDER[occ.dayIndex]
      } com ${protein.name} no RU06.`,
    });
    if (advanceDate.getTime() > now.getTime()) {
      await attempt(() =>
        scheduleTriggerNotification({...alert(hours * HOUR_MS), date: advanceDate}),
      );
    } else if (pendingIds.has(id) && mealDate.getTime() > now.getTime()) {
      // The alert hadn't fired yet, but the new settings (a longer notice, an
      // earlier meal time) put its time in the past: send it now.
      await attempt(() =>
        displayImmediateNotification(alert(mealDate.getTime() - now.getTime())),
      );
    }
    // Otherwise it already fired, or the summary covers it (e.g. the meal is
    // today and the menu only came in this morning).
  }

  return upcoming;
}

// The user's "pior cardápio" as a proteinsDb row; the copy saved with the
// preferences stands in when the database can't be read.
async function loadWorstProtein(prefs) {
  try {
    const protein = await getProteinById(prefs.worstProteinId);
    if (protein) {
      return protein;
    }
  } catch (error) {
    console.warn('[RUNotify] Falha ao ler o pior cardápio do banco:', error);
  }
  return savedWorstProtein(prefs);
}

// Replaces every scheduled notification with the ones for `weekData`'s week
// under `prefs`. Returns the "pior cardápio" meals not over yet that week.
async function scheduleWeek(weekData, now, prefs, {catchUp = false} = {}) {
  const monday = mondayFromWeekKey(weekData.weekKey);
  const {weekKey, menu} = weekData;
  await ensureNotificationSetup();
  const pendingIds = new Set(await cancelAllScheduledMenuNotifications());
  const {attempt, finish} = createNotifier();
  await scheduleDailyMenuNotifications(menu, monday, weekKey, now, prefs, catchUp, attempt);
  const protein = await loadWorstProtein(prefs);
  const occurrences = await scheduleWorstDishNotifications(
    menu,
    monday,
    weekKey,
    now,
    prefs,
    protein,
    pendingIds,
    attempt,
  );
  finish();
  return occurrences;
}

async function doRunWeeklyMenuJob(now, catchUp) {
  const menu = await fetchRU06Menu();
  const monday = getMondayOfWeek(now);
  const weekKey = weekKeyFor(monday);

  // New main dishes join the "pior cardápio" list. A database failure must
  // not cost the user this week's notifications, so it's only logged.
  let newProteins = [];
  try {
    newProteins = await syncWeekProteins(menu, weekKey);
  } catch (error) {
    console.warn('[RUNotify] Falha ao atualizar o banco de proteínas:', error);
  }

  const weekData = {weekKey, menu, newProteins, fetchedAt: now.toISOString()};
  // Cached before the preferences are read: if the first-launch setup is
  // saved meanwhile, either this job sees its preferences or applyPreferences
  // sees this menu, so the week always gets scheduled.
  await AsyncStorage.setItem(STORAGE_KEY_WEEK_DATA, JSON.stringify(weekData));

  // Before the first-launch setup there are no preferences to schedule with;
  // finishing the setup schedules the cached week instead.
  const prefs = await getPreferences();
  const worstOccurrences = prefs ? await scheduleWeek(weekData, now, prefs, {catchUp}) : [];

  // Only marked done once scheduled, so a failure is retried on the next run.
  await AsyncStorage.setItem(STORAGE_KEY_LAST_WEEK_KEY, weekKey);

  const result = {...weekData, worstOccurrences};
  weekListeners.forEach(listener => listener(result));
  return result;
}

const weekListeners = new Set();

// Calls `listener(weekData)` whenever a weekly job finishes, whoever started
// it (e.g. the background fetch while the app is open). Returns unsubscribe.
export function subscribeToWeekUpdates(listener) {
  weekListeners.add(listener);
  return () => {
    weekListeners.delete(listener);
  };
}

let runningJob = null;

// Fetches this week's menu, adds its new main dishes to the database and
// reschedules every notification. `catchUp` (the automatic weekly run) also
// delivers the meal notices whose time passed before the menu came in.
// Concurrent calls (background fetch, app start, a manual refresh) share the
// run already in progress.
export function runWeeklyMenuJob(now = new Date(), {catchUp = false} = {}) {
  if (!runningJob) {
    runningJob = doRunWeeklyMenuJob(now, catchUp).finally(() => {
      runningJob = null;
    });
  }
  return runningJob;
}

// Saves the user's preferences and reschedules the loaded week's
// notifications with them.
export async function applyPreferences(prefs, {now = new Date()} = {}) {
  const saved = await savePreferences(prefs);
  const cached = await getCachedWeekMenu();
  if (cached?.menu && cached?.weekKey) {
    await scheduleWeek(cached, now, saved);
  }
  return saved;
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
  // A new week: fetch from the fetch time on - on Monday, or any later day
  // when Monday's run was missed (phone off, no network), so the week still
  // gets its notifications. Never earlier in the day, so a catch-up doesn't
  // send the "pior cardápio" summary in the middle of the night.
  const totalMinutesNow = now.getHours() * 60 + now.getMinutes();
  const fetchMinutes = WEEKLY_FETCH_TIME.hour * 60 + WEEKLY_FETCH_TIME.minute;
  return totalMinutesNow >= fetchMinutes;
}

// Adds the cached week's main dishes to the database. Idempotent; covers a
// sync that failed during the fetch and an install upgraded mid-week.
async function syncCachedWeekProteins() {
  try {
    const cached = await getCachedWeekMenu();
    if (cached?.menu && cached?.weekKey) {
      await syncWeekProteins(cached.menu, cached.weekKey);
    }
  } catch (error) {
    console.warn('[RUNotify] Falha ao atualizar o banco de proteínas:', error);
  }
}

export async function checkAndRunWeeklyJob(now = new Date()) {
  if (await shouldRunWeeklyJob(now)) {
    return runWeeklyMenuJob(now, {catchUp: true});
  }
  await syncCachedWeekProteins();
  return null;
}

export async function getCachedWeekMenu() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_WEEK_DATA);
  return raw ? JSON.parse(raw) : null;
}

export const __private__ = {getMondayOfWeek, weekKeyFor, mondayFromWeekKey, dateAt};
