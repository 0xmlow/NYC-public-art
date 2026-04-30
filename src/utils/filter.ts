/**
 * Apply the active filter state to the full artwork list.
 * Pure function — used by both the list render and the map setData call.
 */

import type { Artwork } from '../types';
import type { FiltersState } from '../state/filtersReducer';
import { eraBucket } from './era';

export function filterArtworks(all: Artwork[], f: FiltersState): Artwork[] {
  const q = f.query.trim().toLowerCase();
  return all.filter((a) => {
    if (f.borough !== 'All' && a.borough !== f.borough) return false;
    if (f.type !== 'All' && a.type !== f.type) return false;
    if (f.era !== 'All' && eraBucket(a.year) !== f.era) return false;
    if (q) {
      const hay = `${a.title} ${a.artist} ${a.borough} ${a.location} ${a.type} ${a.year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const isCurated = (a: Artwork): boolean => a.source === 'Curated';
