import {RU_SECTION_ID} from '../constants';

const ENTITY_MAP = {
  nbsp: ' ',
  amp: '&',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  atilde: 'ã',
  otilde: 'õ',
  ccedil: 'ç',
  ecirc: 'ê',
  ocirc: 'ô',
  acirc: 'â',
  agrave: 'à',
  quot: '"',
  apos: "'",
};

function decodeEntities(text) {
  return text
    .replace(/&(\w+);/g, (match, name) =>
      ENTITY_MAP[name] !== undefined ? ENTITY_MAP[name] : match,
    )
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanText(fragmentHtml) {
  const withBreaks = fragmentHtml.replace(/<br\s*\/?>/gi, ' ');
  const withoutTags = withBreaks.replace(/<[^>]*>/g, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

// The PRAE cardápio page's markup has changed shape at least once (from a
// per-meal table layout to a per-weekday card/list layout) without notice.
// To stay resilient across further redesigns, each known layout is tried in
// turn until one of them yields data.

// --- Layout A (current, as of Sep/2026): one accordion item per weekday,
// each containing an "ALMOÇO" card and a "JANTA" card with <ul><li> dishes.
function parseWeekdayCardsLayout(html) {
  const sectionStart = html.indexOf(`id="accordion-${RU_SECTION_ID}"`);
  if (sectionStart === -1) {
    return null;
  }
  const nextSection = html.indexOf('id="accordion-', sectionStart + 1);
  const section = html.slice(sectionStart, nextSection === -1 ? html.length : nextSection);

  const headingMarker = `accordion-header" id="${RU_SECTION_ID}-heading-`;
  const chunkStarts = [];
  for (let idx = section.indexOf(headingMarker); idx !== -1; idx = section.indexOf(headingMarker, idx + 1)) {
    chunkStarts.push(idx);
  }
  if (!chunkStarts.length) {
    return null;
  }

  const lunch = [];
  const dinner = [];
  const cardRegex = /card-header[^>]*>([\s\S]*?)<\/div>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/g;

  chunkStarts.forEach((start, i) => {
    const chunk = section.slice(start, chunkStarts[i + 1] ?? section.length);
    const strongMatch = chunk.match(/<strong>([\s\S]*?)<\/strong>/);
    const headerText = strongMatch ? cleanText(strongMatch[1]) : '';
    const dateMatch = headerText.match(/(\d{2}\/\d{2})(?:\/\d{4})?/);
    const weekday = dateMatch
      ? headerText.slice(0, headerText.indexOf(dateMatch[0])).replace(/-\s*$/, '').trim()
      : headerText;

    const dayLunch = {weekday, date: dateMatch ? dateMatch[1] : null, dishes: []};
    const dayDinner = {weekday, date: dateMatch ? dateMatch[1] : null, dishes: []};

    cardRegex.lastIndex = 0;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(chunk))) {
      const label = cleanText(cardMatch[1]).toUpperCase();
      const dishes = [...cardMatch[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
        .map(li => cleanText(li[1]))
        .filter(Boolean);
      if (label.includes('ALMO')) {
        dayLunch.dishes = dishes;
      } else if (label.includes('JANTA')) {
        dayDinner.dishes = dishes;
      }
    }

    lunch.push(dayLunch);
    dinner.push(dayDinner);
  });

  return {lunch, dinner};
}

// --- Layout B (older): one table per meal (Almoço / Janta), one column per
// weekday, one row per dish category.
function parseMealTablesLayout(html) {
  const lunchAnchor = html.indexOf(`id="collapse-almoco-${RU_SECTION_ID}"`);
  const dinnerAnchor = html.indexOf(`id="collapse-janta-${RU_SECTION_ID}"`);
  if (lunchAnchor === -1 || dinnerAnchor === -1) {
    return null;
  }

  const extractTableAfter = anchorIndex => {
    const tableStart = html.indexOf('<table', anchorIndex);
    if (tableStart === -1) {
      return null;
    }
    const tableEnd = html.indexOf('</table>', tableStart);
    return tableEnd === -1 ? null : html.slice(tableStart, tableEnd + '</table>'.length);
  };

  const parseTable = tableHtml => {
    const theadMatch = tableHtml.match(/<thead[\s\S]*?<\/thead>/i);
    const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
    if (!theadMatch || !tbodyMatch) {
      return [];
    }
    const headerCells = [...theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m =>
      cleanText(m[1]),
    );
    const days = headerCells.map(headerText => {
      const dateMatch = headerText.match(/(\d{2}\/\d{2})/);
      const weekday = headerText.replace(/\d{2}\/\d{2}/, '').trim();
      return {weekday, date: dateMatch ? dateMatch[1] : null, dishes: []};
    });
    [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].forEach(rowMatch => {
      [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].forEach((cellMatch, colIndex) => {
        const text = cleanText(cellMatch[1]);
        if (text && days[colIndex]) {
          days[colIndex].dishes.push(text);
        }
      });
    });
    return days;
  };

  const lunchTable = extractTableAfter(lunchAnchor);
  const dinnerTable = extractTableAfter(dinnerAnchor);
  if (!lunchTable || !dinnerTable) {
    return null;
  }
  return {lunch: parseTable(lunchTable), dinner: parseTable(dinnerTable)};
}

function hasDishes(menu) {
  return (
    !!menu &&
    menu.lunch.length > 0 &&
    menu.dinner.length > 0 &&
    menu.lunch.some(d => d.dishes.length > 0) &&
    menu.dinner.some(d => d.dishes.length > 0)
  );
}

// Parses the PRAE cardápio page and returns the RU06 (RU VALE / Informática)
// lunch and dinner menus, one entry per weekday. Tries each known page
// layout in turn since the site's markup has changed shape before.
export function parseRU06Menu(html) {
  const layouts = [parseWeekdayCardsLayout, parseMealTablesLayout];
  for (const layout of layouts) {
    const menu = layout(html);
    if (hasDishes(menu)) {
      return menu;
    }
  }
  throw new Error(
    'Não foi possível ler o cardápio do RU06 - o site do PRAE pode ter mudado de formato.',
  );
}
