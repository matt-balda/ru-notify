import {MENU_URL} from '../constants';
import {parseRU06Menu} from './menuParser';

export async function fetchRU06Menu() {
  const response = await fetch(MENU_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) RUNotify',
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao acessar o site do RU (status ${response.status}).`);
  }
  const html = await response.text();
  return parseRU06Menu(html);
}
