/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import * as opSqlite from '@op-engineering/op-sqlite';
import AsyncStorageModule from '@react-native-async-storage/async-storage';
import App from '../App';
import {fetchRU06Menu} from '../src/api/menuFetcher';
import {__resetForTests} from '../src/db/proteinsDb';
import {getPreferences, savePreferences} from '../src/services/preferences';
import week from './fixtures/week-2026-09-21.json';

jest.mock('../src/api/menuFetcher', () => ({fetchRU06Menu: jest.fn()}));
// Test helpers of the __mocks__ stand-ins, which the libraries' types lack.
// (Imported like the app imports them: jest.requireMock would hand back a
// separate instance.)
const {__resetAll, __setOpenError} = opSqlite as any;
const AsyncStorage = AsyncStorageModule as any;
// The real provider renders nothing until native reports the insets.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const flush = () =>
  ReactTestRenderer.act(async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise<void>(resolve => setImmediate(() => resolve()));
    }
  });

function texts(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
}

function pressText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const button = root
    .findAllByType(TouchableOpacity)
    .find(b => b.findAllByType(Text).some(t => t.props.children === label));
  if (!button) {
    throw new Error(`No button "${label}"`);
  }
  return ReactTestRenderer.act(async () => {
    await button.props.onPress();
  });
}

beforeEach(() => {
  AsyncStorage.__reset();
  __resetAll();
  __resetForTests();
  (fetchRU06Menu as jest.Mock).mockResolvedValue(week);
});

test('first launch asks for the preferences, then shows the menu', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  expect(texts(root)).toContain('Como você quer ser avisado?');
  expect(texts(root)).toContain('Filé de peixe empanado');

  // Can't finish the setup without picking a worst dish.
  await pressText(root, 'Salvar e começar');
  expect(await getPreferences()).toBeNull();

  await pressText(root, 'Filé de peixe empanado');
  await pressText(root, 'Salvar e começar');
  await flush();

  const prefs = await getPreferences();
  expect(prefs?.worstProteinId).not.toBeNull();
  expect(prefs?.lunchTime).toEqual({hour: 11, minute: 20});
  expect(texts(root)).toContain('Seus avisos');
  expect(texts(root)).toContain('Seu pior cardápio');

  await pressText(root, 'EDITAR');
  expect(texts(root)).toContain('Salvar alterações');
  await pressText(root, 'Cancelar');
  expect(texts(root)).toContain('Seus avisos');
});

test('an edit while the dish list is unavailable keeps the saved worst dish', async () => {
  await savePreferences({
    worstProteinId: 5,
    worstProteinName: 'Filé de peixe empanado',
    worstProteinKey: 'file de peixe empanado',
  });
  __setOpenError(new Error('db down'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // The strip and the menu still know the dish, from the saved copy.
  expect(texts(root)).toContain('Filé de peixe empanado');
  expect(texts(root)).toContain('Seu pior cardápio');

  await pressText(root, 'EDITAR');
  await flush();
  expect(texts(root)).toContain('Não foi possível carregar a lista de pratos.');
  expect(texts(root)).toContain(
    'A lista está indisponível agora; sua escolha continua salva.',
  );
  await pressText(root, 'Salvar alterações');
  await flush();
  warn.mockRestore();

  expect(await getPreferences()).toMatchObject({
    worstProteinId: 5,
    worstProteinName: 'Filé de peixe empanado',
    worstProteinKey: 'file de peixe empanado',
  });
});
