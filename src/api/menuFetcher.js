import {
  MENU_URL,
  MENU_FETCH_MAX_ATTEMPTS,
  MENU_FETCH_RETRY_DELAY_MS,
  MENU_FETCH_TIMEOUT_MS,
} from '../constants';
import {parseRU06Menu} from './menuParser';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMenuHtml() {
  let lastError;
  for (let attempt = 1; attempt <= MENU_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(
        MENU_URL,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) RUNotify',
          },
        },
        MENU_FETCH_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`Falha ao acessar o site do RU (status ${response.status}).`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MENU_FETCH_MAX_ATTEMPTS) {
        await sleep(MENU_FETCH_RETRY_DELAY_MS * attempt);
      }
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error(
      'Tempo esgotado ao acessar o site do RU. Verifique sua conexão com a internet.',
    );
  }
  if (lastError instanceof TypeError) {
    // React Native's fetch throws a bare TypeError("Network request failed")
    // for DNS/connection-level failures, with no further detail.
    throw new Error(
      'Não foi possível conectar ao site do RU. Verifique sua conexão com a internet.',
    );
  }
  throw lastError;
}

export async function fetchRU06Menu() {
  const html = await fetchMenuHtml();
  return parseRU06Menu(html);
}
