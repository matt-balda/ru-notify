import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_PREFERENCES,
  formatTime,
  getPreferences,
  mealTimeFor,
  sanitizePreferences,
  savePreferences,
  savedWorstProtein,
} from '../src/services/preferences';

beforeEach(() => AsyncStorage.__reset());

test('there are no preferences before the first-launch setup', async () => {
  expect(await getPreferences()).toBeNull();
});

test('defaults match the original fixed times and 12h notice', () => {
  expect(DEFAULT_PREFERENCES).toEqual({
    lunchTime: {hour: 11, minute: 20},
    dinnerTime: {hour: 17, minute: 40},
    advanceNoticeHours: 12,
    worstProteinId: null,
    worstProteinName: null,
    worstProteinKey: null,
  });
});

test('saved preferences round-trip', async () => {
  const prefs = {
    lunchTime: {hour: 12, minute: 5},
    dinnerTime: {hour: 18, minute: 0},
    advanceNoticeHours: 6,
    worstProteinId: 3,
    worstProteinName: 'Fricassê',
    worstProteinKey: 'fricasse',
  };
  expect(await savePreferences(prefs)).toEqual(prefs);
  expect(await getPreferences()).toEqual(prefs);
});

test('out-of-range or missing values fall back to valid ones', () => {
  expect(
    sanitizePreferences({
      lunchTime: {hour: 25, minute: -3},
      dinnerTime: {hour: 'x'},
      advanceNoticeHours: 500,
      worstProteinId: 0,
      worstProteinName: 'Fricassê',
      worstProteinKey: 'fricasse',
    }),
  ).toEqual({
    lunchTime: {hour: 23, minute: 0},
    dinnerTime: {hour: 17, minute: 40},
    advanceNoticeHours: 48,
    worstProteinId: null,
    worstProteinName: null,
    worstProteinKey: null,
  });
  expect(sanitizePreferences({advanceNoticeHours: 0}).advanceNoticeHours).toBe(1);
  expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
});

test('preferences saved before the copy of the name existed still load', async () => {
  await AsyncStorage.setItem('@ru_notify/preferences', JSON.stringify({worstProteinId: 2}));
  expect(await getPreferences()).toMatchObject({
    worstProteinId: 2,
    worstProteinName: null,
    worstProteinKey: null,
  });
});

test('savedWorstProtein rebuilds the chosen protein from the copy', () => {
  expect(
    savedWorstProtein({worstProteinId: 3, worstProteinName: 'Fricassê', worstProteinKey: 'fricasse'}),
  ).toEqual({id: 3, name: 'Fricassê', normalizedName: 'fricasse', firstSeenWeek: null});
  expect(savedWorstProtein({worstProteinId: 3, worstProteinKey: null})).toBeNull();
  expect(savedWorstProtein(DEFAULT_PREFERENCES)).toBeNull();
  expect(savedWorstProtein(null)).toBeNull();
});

test('corrupt saved data counts as not set up', async () => {
  await AsyncStorage.setItem('@ru_notify/preferences', '{oops');
  expect(await getPreferences()).toBeNull();
});

test('mealTimeFor and formatTime', () => {
  const prefs = {...DEFAULT_PREFERENCES, dinnerTime: {hour: 7, minute: 5}};
  expect(mealTimeFor(prefs, 'lunch')).toEqual({hour: 11, minute: 20});
  expect(formatTime(mealTimeFor(prefs, 'dinner'))).toBe('07:05');
});
