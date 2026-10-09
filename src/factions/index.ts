import type { Allegiance, FactionColors, FactionConfig, FactionId } from '../types';
import { CHINA } from './china';
import { EUROPE } from './europe';
import { ISLAMIC } from './islamic';
import { RUSSIA } from './russia';
import { USA } from './usa';

export const FACTIONS: Readonly<Record<FactionId, FactionConfig>> = {
  usa: USA,
  china: CHINA,
  russia: RUSSIA,
  europe: EUROPE,
  islamic: ISLAMIC,
};

/** Colours for neutral, shared landmarks (Global Financial Center). */
const NEUTRAL_COLORS: FactionColors = { primary: '#e8d9a8', light: '#fff6d8', dark: '#6b5f3a' };

export const teamColors = (a: Allegiance): FactionColors => (a === 'neutral' ? NEUTRAL_COLORS : FACTIONS[a].colors);
