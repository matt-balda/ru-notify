import {WEEKDAY_ORDER} from '../constants';

// 'dd/mm' - the format the PRAE page (and so the parsed menu) uses for dates.
export function formatDayMonth(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function isWeekend(date) {
  const day = date.getDay(); // 0 = Sunday .. 6 = Saturday
  return day === 0 || day === 6;
}

// Returns the index (into WEEKDAY_ORDER, i.e. which day card) of today's menu
// in a parsed weekly menu ({lunch, dinner}), or null when the loaded week has
// no card for today - a weekend, or a cached menu from another week.
export function findTodayIndex(menu, now = new Date()) {
  const days = (menu?.lunch?.length ? menu.lunch : menu?.dinner) ?? [];
  const cards = days.slice(0, WEEKDAY_ORDER.length);

  const hasDates = cards.some(day => !!day?.date);
  if (hasDates) {
    const today = formatDayMonth(now);
    const index = cards.findIndex(day => day?.date === today);
    return index === -1 ? null : index;
  }

  // No dates to match against (a layout that doesn't print them): fall back to
  // the weekday, assuming the loaded menu is this week's.
  if (isWeekend(now)) {
    return null;
  }
  const index = now.getDay() - 1; // Monday = 0 .. Friday = 4
  return index < cards.length ? index : null;
}
