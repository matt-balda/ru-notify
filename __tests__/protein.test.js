import {
  extractMainProteins,
  findWorstDishIndex,
  findWorstDishOccurrences,
  getProteinKind,
  isSimilarDish,
  normalizeDishName,
} from '../src/utils/protein';
import week from './fixtures/week-2026-09-21.json';

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

describe('normalizeDishName', () => {
  test('ignores case, accents, punctuation and extra spaces', () => {
    expect(normalizeDishName('Bife de Frango grelhado')).toBe('bife de frango grelhado');
    expect(normalizeDishName('Filé de frango à milanesa')).toBe(
      normalizeDishName('File de frango a  milanesa.'),
    );
    expect(normalizeDishName('  Fricassê ')).toBe('fricasse');
  });

  test('handles missing names', () => {
    expect(normalizeDishName(undefined)).toBe('');
    expect(normalizeDishName(null)).toBe('');
  });
});

describe('extractMainProteins', () => {
  test("lists the week's main dishes once each, in menu order", () => {
    const names = extractMainProteins(week).map(p => p.name);
    // Monday's lunch and dinner spell the same dish differently.
    expect(names).toEqual([
      'Bife de Frango grelhado',
      'Strogonoff de frango',
      'Lombo suíno a california',
      'Sobrecoxa de frango assada',
      'Bife bovino à milanesa',
      'Filé de peixe empanado',
      'Filé de frango a milanesa',
      'Carne bovina assada',
      'Fricassê',
    ]);
  });

  test('leaves out the vegetarian option and every other category', () => {
    const keys = extractMainProteins(week).map(p => p.normalizedName);
    expect(keys).not.toContain(normalizeDishName('Falafel'));
    expect(keys).not.toContain(normalizeDishName('Feijão Preto'));
  });

  test('skips meals whose template shifted', () => {
    const shifted = {lunch: [{weekday: 'Segunda', dishes: dishes.slice(1)}], dinner: []};
    expect(extractMainProteins(shifted)).toEqual([]);
  });

  test('handles a missing menu', () => {
    expect(extractMainProteins(undefined)).toEqual([]);
    expect(extractMainProteins({})).toEqual([]);
  });
});

describe('findWorstDishOccurrences', () => {
  const fish = normalizeDishName('Filé de peixe empanado');

  test('finds every meal serving the chosen dish', () => {
    expect(findWorstDishOccurrences(week, fish)).toEqual([
      {
        meal: 'dinner',
        dayIndex: 1,
        weekday: 'Terça',
        date: '22/09',
        dish: 'Filé de peixe empanado',
      },
    ]);
  });

  test('matches however the page spells it', () => {
    const chicken = normalizeDishName('bife de frango grelhado');
    const found = findWorstDishOccurrences(week, chicken);
    expect(found.map(o => [o.meal, o.dayIndex])).toEqual([
      ['lunch', 0],
      ['dinner', 0],
    ]);
  });

  test('finds a re-typed main dish, but never a side or the veggie option', () => {
    const retyped = {
      lunch: [],
      dinner: [
        {
          weekday: 'Segunda',
          date: '28/09',
          dishes: ['Arroz', 'Feijão', 'Peixe empanado', 'Falafel', 'Polenta'],
        },
        {
          weekday: 'Terça',
          date: '29/09',
          // "empanado" alone in the vegetarian slot is not the fish.
          dishes: ['Arroz', 'Feijão', 'Frango assado', 'Tofu empanado', 'Arroz'],
        },
      ],
    };
    expect(findWorstDishOccurrences(retyped, fish).map(o => [o.dayIndex, o.dish])).toEqual([
      [0, 'Peixe empanado'],
    ]);
  });

  test('finds nothing without a chosen dish', () => {
    expect(findWorstDishOccurrences(week, null)).toEqual([]);
    expect(findWorstDishOccurrences(week, '')).toEqual([]);
  });
});

describe('isSimilarDish', () => {
  const fish = normalizeDishName('Filé de peixe empanado');

  test('matches the ways the page re-types a dish', () => {
    [
      'Filé de peixe empanado',
      'FILÉ DE PEIXE EMPANADO',
      'File de peixe empanado.',
      'Filé peixe empanado',
      'Peixe empanado',
      'Filés de peixe empanados',
      'Filé de peixe empanado c/ molho tártaro',
      'Filé de peixe empando',
    ].forEach(dish => expect([dish, isSimilarDish(dish, fish)]).toEqual([dish, true]));
  });

  test('does not match other dishes', () => {
    [
      'Filé de frango a milanesa',
      'Frango empanado',
      'Peixe ao molho',
      'Filé',
      'Empanado',
      'Bife bovino à milanesa',
    ].forEach(dish => expect([dish, isSimilarDish(dish, fish)]).toEqual([dish, false]));
  });

  test('a one-word pick matches dishes built on it, not the other way round', () => {
    const fricasse = normalizeDishName('Fricassê');
    expect(isSimilarDish('Fricassê de frango', fricasse)).toBe(true);
    expect(isSimilarDish('Fricassê', normalizeDishName('Fricassê de peixe'))).toBe(false);
  });

  test('needs a chosen dish and a dish name', () => {
    expect(isSimilarDish('Filé de peixe empanado', undefined)).toBe(false);
    expect(isSimilarDish('', fish)).toBe(false);
  });
});

describe('findWorstDishIndex', () => {
  const fish = normalizeDishName('Filé de peixe empanado');

  test('an exact name counts in any slot', () => {
    expect(findWorstDishIndex(['Arroz', 'Feijão', 'Frango', 'Filé de peixe empanado'], fish)).toBe(
      3,
    );
  });

  test('a similar name counts only in the main-dish slot', () => {
    expect(findWorstDishIndex(['Arroz', 'Feijão', 'Peixe empanado', 'Falafel'], fish)).toBe(2);
    expect(findWorstDishIndex(['Arroz', 'Feijão', 'Frango', 'Peixe empanado'], fish)).toBe(-1);
  });

  test('any slot when the template shifted', () => {
    expect(findWorstDishIndex(['Feijão', 'Peixe empanado', 'Falafel'], fish)).toBe(1);
  });

  test('-1 without a match or a chosen dish', () => {
    expect(findWorstDishIndex(dishes, fish)).toBe(-1);
    expect(findWorstDishIndex(dishes, null)).toBe(-1);
    expect(findWorstDishIndex(undefined, fish)).toBe(-1);
  });
});
