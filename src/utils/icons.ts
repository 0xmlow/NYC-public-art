/**
 * Type → Blossom icon + color mapping. The map uses these in two ways:
 *   1. Pre-loads each SVG, recolors via canvas composite, and registers
 *      it as a Mapbox image (see useMap → loadAllIcons).
 *   2. Surfaces the same colors in the legend, list swatches, and
 *      detail-panel eyebrow so the visual language is consistent.
 */

import type { ArtworkType } from '../types';

export interface IconConfig {
  file: string;
  color: string;
}

export const BLOSSOM_ICONS: Record<ArtworkType, IconConfig> = {
  Sculpture:    { file: 'icons/blossom-01.svg', color: '#ffb84d' },
  Mural:        { file: 'icons/blossom-03.svg', color: '#ff5e7e' },
  Installation: { file: 'icons/blossom-02.svg', color: '#4de1c2' },
  Plaque:       { file: 'icons/blossom-04.svg', color: '#c9a7ff' },
  Fountain:     { file: 'icons/blossom-05.svg', color: '#7ec9ff' },
  Relief:       { file: 'icons/blossom-06.svg', color: '#ffd27a' },
  Signage:      { file: 'icons/blossom-04.svg', color: '#c9a7ff' },
  Other:        { file: 'icons/blossom-07.svg', color: '#9a9aa8' },
};

export function configFor(type: string): IconConfig {
  return BLOSSOM_ICONS[type as ArtworkType] || BLOSSOM_ICONS.Other;
}

export function iconNameFor(type: string): string {
  return `blossom-${type in BLOSSOM_ICONS ? type : 'Other'}`;
}

export const TYPE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(BLOSSOM_ICONS).map(([t, c]) => [t, c.color])
);
