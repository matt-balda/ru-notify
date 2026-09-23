import {findTodayIndex, formatDayMonth, isWeekend} from '../src/utils/today';

// Week of Mon 21/09/2026 .. Fri 25/09/2026.
const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const withDates = weekdays.map((weekday, i) => ({
  weekday,
  date: `${21 + i}/09`,
  dishes: ['Arroz'],
}));
const menu = {lunch: withDates, dinner: withDates};

// Months are 0-based in the Date constructor: 8 = September.
const at = (day, month = 8) => new Date(2026, month, day, 12, 0);

test('formatDayMonth zero-pads day and month', () => {
  expect(formatDayMonth(new Date(2026, 0, 5))).toBe('05/01');
  expect(formatDayMonth(at(23))).toBe('23/09');
});

test('isWeekend is true only on Saturday and Sunday', () => {
  expect(isWeekend(at(26))).toBe(true); // Saturday
  expect(isWeekend(at(27))).toBe(true); // Sunday
  expect(isWeekend(at(21))).toBe(false); // Monday
  expect(isWeekend(at(25))).toBe(false); // Friday
});

test('finds each weekday card by its date', () => {
  expect(findTodayIndex(menu, at(21))).toBe(0);
  expect(findTodayIndex(menu, at(23))).toBe(2);
  expect(findTodayIndex(menu, at(25))).toBe(4);
});

test('returns null on the weekend', () => {
  expect(findTodayIndex(menu, at(26))).toBeNull();
  expect(findTodayIndex(menu, at(27))).toBeNull();
});

test('returns null when the loaded menu is from another week', () => {
  // Wednesday of the following week, with last week's menu still cached.
  expect(findTodayIndex(menu, at(30))).toBeNull();
});

test('does not match the same day of another month', () => {
  expect(findTodayIndex(menu, at(23, 9))).toBeNull(); // 23/10
});

test('falls back to the weekday when the menu has no dates', () => {
  const undated = {
    lunch: weekdays.map(weekday => ({weekday, date: null, dishes: ['Arroz']})),
  };
  expect(findTodayIndex(undated, at(21))).toBe(0);
  expect(findTodayIndex(undated, at(24))).toBe(3);
  expect(findTodayIndex(undated, at(26))).toBeNull();
});

test('uses dinner dates when lunch is empty', () => {
  expect(findTodayIndex({lunch: [], dinner: withDates}, at(22))).toBe(1);
});

test('handles a missing menu', () => {
  expect(findTodayIndex(undefined, at(23))).toBeNull();
  expect(findTodayIndex(null, at(23))).toBeNull();
  expect(findTodayIndex({}, at(23))).toBeNull();
});
