import AsyncStorage from '@react-native-async-storage/async-storage';
import {__resetAll, __setOpenError} from '@op-engineering/op-sqlite';
import {fetchRU06Menu} from '../src/api/menuFetcher';
import {
  cancelAllScheduledMenuNotifications,
  displayImmediateNotification,
  ensureNotificationSetup,
  scheduleTriggerNotification,
} from '../src/services/notifications';
import {__resetForTests, listProteins} from '../src/db/proteinsDb';
import {getPreferences, savePreferences} from '../src/services/preferences';
import {
  applyPreferences,
  checkAndRunWeeklyJob,
  getCachedWeekMenu,
  runWeeklyMenuJob,
  shouldRunWeeklyJob,
  subscribeToWeekUpdates,
} from '../src/services/scheduler';
import week from './fixtures/week-2026-09-21.json';

jest.mock('../src/api/menuFetcher', () => ({fetchRU06Menu: jest.fn()}));
jest.mock('../src/services/notifications', () => ({
  ensureNotificationSetup: jest.fn(async () => {}),
  cancelAllScheduledMenuNotifications: jest.fn(async () => []),
  scheduleTriggerNotification: jest.fn(async () => true),
  displayImmediateNotification: jest.fn(async () => {}),
}));

// Week of Mon 21/09/2026; months are 0-based (8 = September).
const at = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute);

async function protein(name) {
  return (await listProteins()).find(p => p.name === name);
}

// Saves preferences with `dish` (a seed protein) as the worst one.
async function setUp(overrides = {}, dish = 'Filé de peixe empanado') {
  const worst = await protein(dish);
  return savePreferences({
    lunchTime: {hour: 12, minute: 0},
    dinnerTime: {hour: 18, minute: 30},
    advanceNoticeHours: 12,
    worstProteinId: worst.id,
    worstProteinName: worst.name,
    worstProteinKey: worst.normalizedName,
    ...overrides,
  });
}

const scheduled = () => scheduleTriggerNotification.mock.calls.map(([n]) => n);
const scheduledIds = () => scheduled().map(n => n.id);
const displayed = () => displayImmediateNotification.mock.calls.map(([n]) => n);
const summaries = () => displayed().filter(n => n.id.endsWith('worst-summary'));

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.__reset();
  __resetAll();
  __resetForTests();
  fetchRU06Menu.mockResolvedValue(week);
});

describe('runWeeklyMenuJob', () => {
  test('before the first-launch setup it only fetches, caches and syncs', async () => {
    const result = await runWeeklyMenuJob(at(21, 10));
    expect(result.weekKey).toBe('2026-09-21');
    expect(scheduleTriggerNotification).not.toHaveBeenCalled();
    expect(displayImmediateNotification).not.toHaveBeenCalled();
    expect((await getCachedWeekMenu()).menu).toEqual(week);
    expect(await shouldRunWeeklyJob(at(22, 11))).toBe(false);
  });

  test('schedules each meal at the times the user picked', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));

    const daily = scheduled().filter(n => !n.id.includes('worst'));
    expect(daily).toHaveLength(10);
    const mondayLunch = daily.find(n => n.id === 'ru-notify-2026-09-21-lunch-0');
    expect(mondayLunch.date).toEqual(at(21, 12, 0));
    expect(mondayLunch.title).toBe('Cardápio RU06 · Almoço de Segunda');
    const fridayDinner = daily.find(n => n.id === 'ru-notify-2026-09-21-dinner-4');
    expect(fridayDinner.date).toEqual(at(25, 18, 30));
    expect(cancelAllScheduledMenuNotifications).toHaveBeenCalledTimes(1);
  });

  test('skips meals whose time already passed', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 13)); // after Monday's 12:00 lunch notice
    expect(scheduledIds()).not.toContain('ru-notify-2026-09-21-lunch-0');
    expect(scheduledIds()).toContain('ru-notify-2026-09-21-dinner-0');
    // A manual refresh doesn't re-send a notice that may already have fired.
    expect(displayed().map(n => n.id)).not.toContain('ru-notify-2026-09-21-lunch-0');
  });

  test('the automatic run delivers a notice missed while the meal is served', async () => {
    await setUp({lunchTime: {hour: 9, minute: 30}});
    await checkAndRunWeeklyJob(at(21, 10)); // notice at 09:30, menu only at 10:00
    const lunch = displayed().find(n => n.id === 'ru-notify-2026-09-21-lunch-0');
    expect(lunch.title).toBe('Cardápio RU06 · Almoço de Segunda');
    expect(lunch.body).toMatch(/^Arroz Branco\/ Integral • Feijão Preto • Bife de Frango/);
  });

  test('announces the worst dish and alerts the chosen hours before it', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));

    expect(displayImmediateNotification).toHaveBeenCalledWith({
      id: 'ru-notify-2026-09-21-worst-summary',
      title: '⚠️ Filé de peixe empanado essa semana!',
      body: 'No RU06 vai ter: Terça (Janta).',
    });
    const alert = scheduled().find(n => n.id === 'ru-notify-2026-09-21-worst-1-dinner');
    // Tuesday's dinner notice is at 18:30, so 12h before is 06:30.
    expect(alert.date).toEqual(at(22, 6, 30));
    expect(alert.title).toBe('⏰ Filé de peixe empanado se aproximando!');
    expect(alert.body).toBe(
      'Faltam 12h para a janta de Terça com Filé de peixe empanado no RU06.',
    );
  });

  test('sends the summary once per week, not on every refresh', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));
    await runWeeklyMenuJob(at(21, 11));
    await runWeeklyMenuJob(at(21, 15));
    expect(summaries()).toHaveLength(1);
    // The alerts are still rescheduled every time.
    expect(scheduledIds().filter(id => id.includes('worst-1-dinner'))).toHaveLength(3);
  });

  test('uses the advance notice the user picked', async () => {
    await setUp({advanceNoticeHours: 1});
    await runWeeklyMenuJob(at(21, 10));
    const alert = scheduled().find(n => n.id.includes('worst-1-dinner'));
    expect(alert.date).toEqual(at(22, 17, 30));
    expect(alert.body).toMatch(/^Falta 1h para a janta/);
  });

  test('leaves the alert to the summary when its time already passed', async () => {
    await setUp();
    await runWeeklyMenuJob(at(22, 10)); // Tuesday 10:00, past the 06:30 mark
    expect(scheduledIds().some(id => id.includes('worst-1'))).toBe(false);
    expect(summaries()).toHaveLength(1);
  });

  test('says nothing about a worst dish already served this week', async () => {
    await setUp();
    await runWeeklyMenuJob(at(23, 10)); // Wednesday: Tuesday's fish is past
    expect(displayImmediateNotification).not.toHaveBeenCalled();
    expect(scheduledIds().some(id => id.includes('worst'))).toBe(false);
  });

  test('a meal still being served counts, even after its notice time', async () => {
    await setUp({}, 'Bife de frango grelhado');
    await runWeeklyMenuJob(at(21, 12, 30)); // lunch notice 12:00, served until 14:00
    expect(summaries()[0].body).toBe('No RU06 vai ter: Segunda (Almoço), Segunda (Janta).');
  });

  test('any chosen dish works, matched across spellings', async () => {
    await setUp({}, 'Bife de frango grelhado');
    await runWeeklyMenuJob(at(21, 10));
    expect(summaries()[0].body).toBe('No RU06 vai ter: Segunda (Almoço), Segunda (Janta).');
    // Monday lunch at 12:00 minus 12h is already past; dinner's 06:30 too.
    expect(scheduledIds().some(id => id.includes('worst'))).toBe(false);
  });

  test('matches the worst dish when the page re-types it', async () => {
    const retyped = {
      ...week,
      dinner: week.dinner.map((day, i) =>
        i === 1
          ? {...day, dishes: day.dishes.map((d, j) => (j === 2 ? 'Peixe empanado' : d))}
          : day,
      ),
    };
    fetchRU06Menu.mockResolvedValue(retyped);
    await setUp();
    const result = await runWeeklyMenuJob(at(21, 10));
    expect(result.worstOccurrences.map(o => o.dish)).toEqual(['Peixe empanado']);
    expect(scheduledIds()).toContain('ru-notify-2026-09-21-worst-1-dinner');
    // The re-typed name also joins the list, as a dish of its own.
    expect(result.newProteins.map(p => p.name)).toEqual(['Peixe empanado']);
  });

  test("adds the week's new main dishes to the database", async () => {
    const withNewDish = {
      ...week,
      lunch: week.lunch.map((day, i) =>
        i === 0 ? {...day, dishes: day.dishes.map((d, j) => (j === 2 ? 'Galinhada' : d))} : day,
      ),
    };
    fetchRU06Menu.mockResolvedValue(withNewDish);
    const result = await runWeeklyMenuJob(at(21, 10));
    expect(result.newProteins.map(p => p.name)).toEqual(['Galinhada']);
    expect((await protein('Galinhada')).firstSeenWeek).toBe('2026-09-21');
  });

  test('a database failure costs neither the meal nor the worst-dish alerts', async () => {
    await setUp();
    __resetForTests();
    __resetAll();
    __setOpenError(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runWeeklyMenuJob(at(21, 10));
    warn.mockRestore();
    expect(result.newProteins).toEqual([]);
    expect(scheduled().filter(n => !n.id.includes('worst'))).toHaveLength(10);
    // The copy of the dish saved with the preferences stands in.
    expect(scheduledIds()).toContain('ru-notify-2026-09-21-worst-1-dinner');
    expect(summaries()).toHaveLength(1);
  });

  test('one failing notification does not drop the rest of the week', async () => {
    await setUp();
    scheduleTriggerNotification.mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runWeeklyMenuJob(at(21, 10))).rejects.toThrow('boom');
    warn.mockRestore();
    // Every slot was still attempted...
    expect(scheduleTriggerNotification).toHaveBeenCalledTimes(11);
    // ...and the week is left to be retried.
    expect(await shouldRunWeeklyJob(at(21, 11))).toBe(true);
  });

  test('a scheduling failure keeps the menu cached but retries the job', async () => {
    await setUp();
    ensureNotificationSetup.mockRejectedValueOnce(new Error('no permission'));
    await expect(runWeeklyMenuJob(at(21, 10))).rejects.toThrow('no permission');
    expect((await getCachedWeekMenu()).weekKey).toBe('2026-09-21');
    expect(await shouldRunWeeklyJob(at(21, 11))).toBe(true);
  });

  test('concurrent calls share one run', async () => {
    await setUp();
    const [a, b] = await Promise.all([
      runWeeklyMenuJob(at(21, 10)),
      runWeeklyMenuJob(at(21, 10)),
    ]);
    expect(a).toBe(b);
    expect(fetchRU06Menu).toHaveBeenCalledTimes(1);
  });

  test('tells subscribers about each finished run', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToWeekUpdates(listener);
    await runWeeklyMenuJob(at(21, 10));
    unsubscribe();
    await runWeeklyMenuJob(at(21, 11));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].weekKey).toBe('2026-09-21');
  });
});

describe('applyPreferences', () => {
  test('saves and reschedules the cached week with the new times', async () => {
    await runWeeklyMenuJob(at(21, 10)); // cached, nothing scheduled yet
    jest.clearAllMocks();
    const fish = await protein('Filé de peixe empanado');

    const saved = await applyPreferences(
      {
        lunchTime: {hour: 11, minute: 45},
        dinnerTime: {hour: 19, minute: 0},
        advanceNoticeHours: 3,
        worstProteinId: fish.id,
        worstProteinName: fish.name,
        worstProteinKey: fish.normalizedName,
      },
      {now: at(21, 15)},
    );

    expect(await getPreferences()).toEqual(saved);
    expect(cancelAllScheduledMenuNotifications).toHaveBeenCalledTimes(1);
    expect(scheduledIds()).not.toContain('ru-notify-2026-09-21-lunch-0');
    expect(scheduled().find(n => n.id === 'ru-notify-2026-09-21-dinner-0').date).toEqual(
      at(21, 19, 0),
    );
    expect(scheduled().find(n => n.id.includes('worst-1-dinner')).date).toEqual(at(22, 16, 0));
    // First setup: the summary goes out.
    expect(summaries()).toHaveLength(1);
  });

  test('an edit keeping the same dish does not repeat the summary', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));
    jest.clearAllMocks();
    await applyPreferences(
      {...(await getPreferences()), lunchTime: {hour: 11, minute: 0}},
      {now: at(21, 15)},
    );
    expect(summaries()).toHaveLength(0);
    expect(scheduledIds()).toContain('ru-notify-2026-09-21-worst-1-dinner');
  });

  test('picking a different dish announces it', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));
    jest.clearAllMocks();
    const lombo = await protein('Lombo suíno a california');
    await applyPreferences(
      {
        ...(await getPreferences()),
        worstProteinId: lombo.id,
        worstProteinName: lombo.name,
        worstProteinKey: lombo.normalizedName,
      },
      {now: at(21, 15)},
    );
    expect(summaries()[0].title).toBe('⚠️ Lombo suíno a california essa semana!');
    expect(summaries()[0].body).toBe('No RU06 vai ter: Quarta (Almoço).');
  });

  test('a longer notice sends a still-pending alert now instead of dropping it', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10)); // alert pending for Tue 06:30
    jest.clearAllMocks();
    cancelAllScheduledMenuNotifications.mockResolvedValueOnce([
      'ru-notify-2026-09-21-worst-1-dinner',
    ]);
    await applyPreferences({...(await getPreferences()), advanceNoticeHours: 24}, {now: at(21, 20)});
    // 24h before Tuesday's 18:30 is already past at Monday 20:00.
    expect(scheduledIds()).not.toContain('ru-notify-2026-09-21-worst-1-dinner');
    const alert = displayed().find(n => n.id === 'ru-notify-2026-09-21-worst-1-dinner');
    expect(alert.body).toBe('Faltam 22h para a janta de Terça com Filé de peixe empanado no RU06.');
  });

  test('an alert that already fired is not sent again', async () => {
    await setUp();
    await runWeeklyMenuJob(at(21, 10));
    jest.clearAllMocks();
    // Tuesday 07:00: the 06:30 alert fired, so it's no longer pending.
    await applyPreferences({...(await getPreferences()), advanceNoticeHours: 13}, {now: at(22, 7)});
    expect(displayed().some(n => n.id.includes('worst-1-dinner'))).toBe(false);
    expect(scheduledIds()).not.toContain('ru-notify-2026-09-21-worst-1-dinner');
  });

  test("schedules against the cached menu's week, not today's", async () => {
    await runWeeklyMenuJob(at(21, 10));
    jest.clearAllMocks();
    // A week later, with last week's menu still cached: every slot is past.
    await applyPreferences(await setUp(), {now: at(28, 9)});
    expect(scheduleTriggerNotification).not.toHaveBeenCalled();
    expect(displayImmediateNotification).not.toHaveBeenCalled();
  });

  test('with no menu fetched yet it only saves', async () => {
    const saved = await applyPreferences({worstProteinId: 1}, {now: at(21, 10)});
    expect(await getPreferences()).toEqual(saved);
    expect(cancelAllScheduledMenuNotifications).not.toHaveBeenCalled();
    expect(scheduleTriggerNotification).not.toHaveBeenCalled();
  });
});

describe('checkAndRunWeeklyJob', () => {
  test("adds the cached week's dishes when no fetch is due", async () => {
    // e.g. the sync failed during the fetch, or the app was updated mid-week.
    const cachedWeek = {
      ...week,
      lunch: week.lunch.map((day, i) =>
        i === 0 ? {...day, dishes: day.dishes.map((d, j) => (j === 2 ? 'Galinhada' : d))} : day,
      ),
    };
    await AsyncStorage.setItem(
      '@ru_notify/week_menu',
      JSON.stringify({weekKey: '2026-09-21', menu: cachedWeek}),
    );
    await AsyncStorage.setItem('@ru_notify/last_week_key', '2026-09-21');

    expect(await checkAndRunWeeklyJob(at(23, 12))).toBeNull();
    expect(fetchRU06Menu).not.toHaveBeenCalled();
    expect((await protein('Galinhada')).firstSeenWeek).toBe('2026-09-21');
  });
});

describe('shouldRunWeeklyJob', () => {
  test('runs right away the first time', async () => {
    expect(await shouldRunWeeklyJob(at(23, 3))).toBe(true);
  });

  test("waits for Monday's fetch time in a new week", async () => {
    await AsyncStorage.setItem('@ru_notify/last_week_key', '2026-09-14');
    expect(await shouldRunWeeklyJob(at(21, 9, 59))).toBe(false);
    expect(await shouldRunWeeklyJob(at(21, 10, 0))).toBe(true);
  });

  test('catches up later in the week when Monday was missed, from 10h on', async () => {
    await AsyncStorage.setItem('@ru_notify/last_week_key', '2026-09-14');
    expect(await shouldRunWeeklyJob(at(22, 3))).toBe(false); // not in the middle of the night
    expect(await shouldRunWeeklyJob(at(22, 10))).toBe(true);
    expect(await shouldRunWeeklyJob(at(25, 20))).toBe(true);
  });

  test("does not run again once this week's menu is in", async () => {
    await AsyncStorage.setItem('@ru_notify/last_week_key', '2026-09-21');
    expect(await shouldRunWeeklyJob(at(21, 11))).toBe(false);
    expect(await shouldRunWeeklyJob(at(27, 23))).toBe(false); // Sunday
  });
});
