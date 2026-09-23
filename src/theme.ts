import {Platform} from 'react-native';

export const SERIF_FONT = Platform.select({ios: 'Georgia', default: 'serif'});

export const LIGHT_COLORS = {
  bg: '#f7f1e4',
  surface: '#fffbf2',
  text: '#2a231b',
  textSoft: '#6f6152',
  textFaint: '#9a8d7c',
  border: 'rgba(42,35,27,0.16)',
  borderStrong: 'rgba(42,35,27,0.30)',
  accent: '#7c2d3a',
  accentSoft: '#f0ddb8',
  fishText: '#5c1f29',
  olive: '#65703f',
};

export const DARK_COLORS = {
  bg: '#1c1712',
  surface: '#26201a',
  text: '#f2e9da',
  textSoft: '#bdaf9b',
  textFaint: '#8a7c69',
  border: 'rgba(242,233,218,0.14)',
  borderStrong: 'rgba(242,233,218,0.26)',
  accent: '#e0a458',
  accentSoft: 'rgba(224,164,88,0.16)',
  fishText: '#e0a458',
  olive: '#a9b087',
};

export type ColorTokens = typeof LIGHT_COLORS;
