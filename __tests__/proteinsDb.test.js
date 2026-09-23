import {open, __resetAll, __setOpenError} from '@op-engineering/op-sqlite';
import {PROTEINS_DB_NAME, SEED_PROTEINS} from '../src/constants';
import {
  __resetForTests,
  getProteinById,
  listProteins,
  syncWeekProteins,
} from '../src/db/proteinsDb';
import {normalizeDishName} from '../src/utils/protein';
import week from './fixtures/week-2026-09-21.json';

const meal = main => ({
  weekday: 'Segunda',
  date: '28/09',
  dishes: ['Arroz Branco/ Integral', 'Feijão Preto', main, 'Falafel', 'Polenta'],
});

beforeEach(() => {
  __resetAll();
  __resetForTests();
});

test('a fresh database starts with the seed proteins, alphabetically', async () => {
  const proteins = await listProteins();
  expect(proteins.map(p => p.name).sort()).toEqual([...SEED_PROTEINS].sort());
  const keys = proteins.map(p => p.normalizedName);
  expect(keys).toEqual([...keys].sort());
  expect(new Set(proteins.map(p => p.id)).size).toBe(SEED_PROTEINS.length);
  proteins.forEach(p => expect(p.firstSeenWeek).toBeNull());
});

test('reopening the database does not seed it twice', async () => {
  await listProteins();
  __resetForTests(); // app restart: same file, new connection
  const proteins = await listProteins();
  expect(proteins).toHaveLength(SEED_PROTEINS.length);
  const {rows} = await open({name: PROTEINS_DB_NAME}).execute('PRAGMA user_version');
  expect(rows[0].user_version).toBe(1);
});

test("the seeded week's dishes add nothing new", async () => {
  expect(await syncWeekProteins(week, '2026-09-21')).toEqual([]);
  expect(await listProteins()).toHaveLength(SEED_PROTEINS.length);
});

test('a week with new main dishes adds them, tagged with the week', async () => {
  const nextWeek = {
    lunch: [meal('Almôndegas ao sugo'), meal('Bife de Frango grelhado')],
    dinner: [meal('Peixe ao molho de alcaparras'), meal('Almondegas ao  sugo')],
  };
  const added = await syncWeekProteins(nextWeek, '2026-09-28');
  expect(added.map(p => p.name)).toEqual(['Almôndegas ao sugo', 'Peixe ao molho de alcaparras']);
  added.forEach(p => {
    expect(p.firstSeenWeek).toBe('2026-09-28');
    expect(typeof p.id).toBe('number');
  });

  const all = await listProteins();
  expect(all).toHaveLength(SEED_PROTEINS.length + 2);
  // The vegetarian option never joins the list.
  expect(all.map(p => p.normalizedName)).not.toContain(normalizeDishName('Falafel'));

  // Running the same week again (e.g. a manual refresh) changes nothing.
  expect(await syncWeekProteins(nextWeek, '2026-09-28')).toEqual([]);
  expect(await listProteins()).toHaveLength(SEED_PROTEINS.length + 2);
});

test('ids are stable and looked up by getProteinById', async () => {
  const [added] = await syncWeekProteins({lunch: [meal('Galinhada')], dinner: []}, '2026-09-28');
  const found = await getProteinById(added.id);
  expect(found).toEqual({
    id: added.id,
    name: 'Galinhada',
    normalizedName: 'galinhada',
    firstSeenWeek: '2026-09-28',
  });
  __resetForTests();
  expect((await getProteinById(added.id)).name).toBe('Galinhada');
});

test('getProteinById returns null for unknown or missing ids', async () => {
  expect(await getProteinById(9999)).toBeNull();
  expect(await getProteinById(null)).toBeNull();
  expect(await getProteinById(undefined)).toBeNull();
});

test('a menu without a recognisable main dish adds nothing', async () => {
  const shifted = {lunch: [{weekday: 'Segunda', dishes: ['Feijão', 'Frango', 'Falafel']}]};
  expect(await syncWeekProteins(shifted, '2026-09-28')).toEqual([]);
});

test('a failure to open the database is retried on the next call', async () => {
  __setOpenError(new Error('no native module'));
  await expect(listProteins()).rejects.toThrow('no native module');
  __setOpenError(null);
  expect(await listProteins()).toHaveLength(SEED_PROTEINS.length);
});
