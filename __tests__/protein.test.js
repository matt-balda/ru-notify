import {getProteinKind} from '../src/utils/protein';

// Friday 25/09/2026 lunch, as parsed from the PRAE page.
const dishes = [
  'Arroz Branco/ Integral',
  'Feijão Preto',
  'Bife bovino à milanesa',
  'Falafel',
  'Macarrão ao alho e óleo',
  'Salada Verde',
  'Repolho roxo',
  'Molho Vinagrete',
  'Fruta',
];

test('marks the main dish and the vegetarian option', () => {
  expect(getProteinKind(dishes, 2)).toBe('main');
  expect(getProteinKind(dishes, 3)).toBe('veggie');
});

test('does not mark the other categories', () => {
  [0, 1, 4, 5, 6, 7, 8].forEach(i => {
    expect(getProteinKind(dishes, i)).toBeNull();
  });
});

test('accepts the rice however the page spells it', () => {
  const typo = ['Arroz branco/ Interal', 'Feijão Preto', 'Fricassê', 'Mix'];
  expect(getProteinKind(typo, 2)).toBe('main');
});

test('marks nothing when the list does not start with the rice', () => {
  // e.g. an empty rice cell dropped by the parser shifts every dish up.
  const shifted = dishes.slice(1);
  expect(getProteinKind(shifted, 2)).toBeNull();
  expect(getProteinKind(shifted, 3)).toBeNull();
});

test('handles short or missing lists', () => {
  expect(getProteinKind(['Arroz', 'Feijão', 'Frango'], 3)).toBeNull();
  expect(getProteinKind([], 2)).toBeNull();
  expect(getProteinKind(undefined, 2)).toBeNull();
});
