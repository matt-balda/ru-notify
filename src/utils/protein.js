// The RU's menu follows a fixed template, one dish per category in this order:
// arroz, feijão, prato principal, opção vegetariana, guarnição, saladas, molho,
// sobremesa. The page's markup has no category labels and the protein dishes
// share no keyword ("Falafel", "Ervilha com legumes", "Fricassê"), so they're
// recognised by position - but only while the list still starts with the rice,
// i.e. the template hasn't shifted (the parser drops empty cells).
const PROTEIN_KIND_BY_INDEX = {2: 'main', 3: 'veggie'};

// Returns 'main' (prato principal), 'veggie' (opção vegetariana) or null for
// the dish at `index` of a meal's dish list.
export function getProteinKind(dishes, index) {
  const kind = PROTEIN_KIND_BY_INDEX[index];
  if (!kind || !dishes || index >= dishes.length) {
    return null;
  }
  const startsWithRice = /arroz/i.test(dishes[0] ?? '');
  return startsWithRice ? kind : null;
}

// The page spells the same dish differently from one week (or meal) to the
// next: "Bife de Frango grelhado" / "Bife de frango grelhado", "à milanesa" /
// "a milanesa". Dishes are compared by this key instead: no accents, lower
// case, punctuation and repeated spaces collapsed.
export function normalizeDishName(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The main dish ("prato principal") of every meal in a parsed weekly menu
// ({lunch, dinner}), once per normalized name, in menu order.
export function extractMainProteins(weekMenu) {
  const byKey = new Map();
  for (const meal of ['lunch', 'dinner']) {
    for (const day of weekMenu?.[meal] ?? []) {
      const dishes = day?.dishes ?? [];
      dishes.forEach((dish, index) => {
        if (getProteinKind(dishes, index) !== 'main') {
          return;
        }
        const key = normalizeDishName(dish);
        if (key && !byKey.has(key)) {
          byKey.set(key, {name: dish.trim(), normalizedName: key});
        }
      });
    }
  }
  return [...byKey.values()];
}

// Words that don't tell dishes apart ("Filé de peixe" / "Filé peixe").
const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'c', 'com', 'da', 'das', 'de', 'do', 'dos', 'e',
  'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'sem',
]);

// The words that identify a dish, singular: "Bolinhos de feijões" ->
// ['bolinho', 'feijoe'] (same treatment on both sides, so it only has to be
// consistent, not correct Portuguese).
function significantWords(name) {
  return normalizeDishName(name)
    .split(' ')
    .filter(word => word && !STOP_WORDS.has(word))
    .map(word => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word));
}

// At most one inserted, deleted or replaced letter ("empanado" / "empando").
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  const restA = a.slice(i + (a.length >= b.length ? 1 : 0));
  const restB = b.slice(i + (b.length >= a.length ? 1 : 0));
  return restA === restB;
}

function sameWord(a, b) {
  return a === b || (Math.min(a.length, b.length) >= 5 && withinOneEdit(a, b));
}

function coversAll(words, required) {
  return required.every(r => words.some(w => sameWord(w, r)));
}

// Whether `dishName` is the dish whose normalized name is `worstNormalizedName`,
// allowing for how the PRAE page re-types dishes from week to week: extra
// words ("Filé de peixe empanado c/ molho tártaro"), one word left out
// ("Peixe empanado"), plurals and one-letter typos.
export function isSimilarDish(dishName, worstNormalizedName) {
  const dishKey = normalizeDishName(dishName);
  if (!dishKey || !worstNormalizedName) {
    return false;
  }
  if (dishKey === worstNormalizedName) {
    return true;
  }
  const dishWords = significantWords(dishKey);
  const worstWords = significantWords(worstNormalizedName);
  if (!dishWords.length || !worstWords.length) {
    return false;
  }
  if (coversAll(dishWords, worstWords)) {
    return true;
  }
  return (
    dishWords.length >= 2 &&
    dishWords.length >= worstWords.length - 1 &&
    coversAll(worstWords, dishWords)
  );
}

// Index of the user's "pior cardápio" in a meal's dish list, or -1. An exact
// (normalized) name counts anywhere; a similar one only in the main-dish slot,
// so the looser match can't flag a side or the vegetarian option - unless the
// template shifted and the slot is unknown, then any dish may match.
export function findWorstDishIndex(dishes, worstNormalizedName) {
  if (!worstNormalizedName || !dishes?.length) {
    return -1;
  }
  const exact = dishes.findIndex(d => normalizeDishName(d) === worstNormalizedName);
  if (exact !== -1) {
    return exact;
  }
  if (getProteinKind(dishes, 2) === 'main') {
    return isSimilarDish(dishes[2], worstNormalizedName) ? 2 : -1;
  }
  return dishes.findIndex(d => isSimilarDish(d, worstNormalizedName));
}

// Scans a parsed weekly menu ({lunch, dinner}) for the user's "pior cardápio"
// and returns one entry per day/meal where it appears.
export function findWorstDishOccurrences(weekMenu, worstNormalizedName) {
  const occurrences = [];
  if (!worstNormalizedName) {
    return occurrences;
  }
  for (const meal of ['lunch', 'dinner']) {
    const days = weekMenu?.[meal] ?? [];
    days.forEach((day, dayIndex) => {
      const dishes = day?.dishes ?? [];
      const index = findWorstDishIndex(dishes, worstNormalizedName);
      if (index !== -1) {
        occurrences.push({
          meal,
          dayIndex,
          weekday: day.weekday,
          date: day.date,
          dish: dishes[index],
        });
      }
    });
  }
  return occurrences;
}
