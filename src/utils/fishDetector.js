function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function isFishDish(dishName) {
  const normalized = normalize(dishName);
  return normalized.includes('peixe') && normalized.includes('empanado');
}

// Scans a parsed weekly menu ({lunch, dinner}) for "Filé de peixe empanado"
// and returns one entry per day/meal where it appears.
export function findFishOccurrences(weekMenu) {
  const occurrences = [];
  for (const meal of ['lunch', 'dinner']) {
    const days = weekMenu[meal] || [];
    days.forEach((day, dayIndex) => {
      const fishDish = day.dishes.find(isFishDish);
      if (fishDish) {
        occurrences.push({
          meal,
          dayIndex,
          weekday: day.weekday,
          date: day.date,
          dish: fishDish,
        });
      }
    });
  }
  return occurrences;
}
