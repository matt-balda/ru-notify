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

export const MEAL_TIMES = {
  lunch: {hour: 11, minute: 20, label: 'Almoço'},
  dinner: {hour: 17, minute: 40, label: 'Janta'},
};

export const WEEKLY_FETCH_TIME = {hour: 10, minute: 0};

export const ADVANCE_NOTICE_HOURS = 12;

export const WEEKDAY_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

export const NOTIFICATION_ID_PREFIX = 'ru-notify';
export const CHANNEL_ID = 'ru-cardapio';
