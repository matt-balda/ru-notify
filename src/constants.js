export const MENU_URL =
  'https://www.ufrgs.br/prae/cardapio-restaurante-universitario/';

// The PRAE page is a heavy Wordpress page; on higher-latency connections
// (mobile data, home wifi) it can take noticeably longer to fetch than on a
// fast, low-latency network like the institute's, so give it real headroom
// before giving up, and retry transient failures instead of failing once.
export const MENU_FETCH_TIMEOUT_MS = 20000;
export const MENU_FETCH_MAX_ATTEMPTS = 3;
export const MENU_FETCH_RETRY_DELAY_MS = 2000;

// Ids used by the PRAE page markup for the RU06 - RU VALE / Informática section.
export const RU_SECTION_ID = 'ref_ru-vale-informatica';

// Default notification time of each meal (the user picks their own on first
// launch, see services/preferences) and when the RU06 stops serving it.
export const MEAL_TIMES = {
  lunch: {hour: 11, minute: 20, label: 'Almoço', servedUntil: {hour: 14, minute: 0}},
  dinner: {hour: 17, minute: 40, label: 'Janta', servedUntil: {hour: 19, minute: 0}},
};

export const WEEKLY_FETCH_TIME = {hour: 10, minute: 0};

// Default for how long before the meal the "pior cardápio" alert fires, and
// the range the user can pick from.
export const ADVANCE_NOTICE_HOURS = 12;
export const ADVANCE_NOTICE_MIN_HOURS = 1;
export const ADVANCE_NOTICE_MAX_HOURS = 48;

// Local SQLite database holding every main dish ("prato principal") seen on
// the menu, which is the list the user picks their "pior cardápio" from.
export const PROTEINS_DB_NAME = 'runotify.sqlite';

// Main dishes as spelled on the PRAE page (week of 21/09/2026), so the
// "pior cardápio" list isn't empty before the first menu fetch succeeds.
export const SEED_PROTEINS = [
  'Filé de peixe empanado',
  'Bife de frango grelhado',
  'Strogonoff de frango',
  'Lombo suíno a california',
  'Sobrecoxa de frango assada',
  'Bife bovino à milanesa',
  'Filé de frango a milanesa',
  'Carne bovina assada',
  'Fricassê',
];

export const WEEKDAY_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

export const NOTIFICATION_ID_PREFIX = 'ru-notify';
export const CHANNEL_ID = 'ru-cardapio';
