/**
 * Bucket a year string into one of four era cohorts. Returns null when
 * the year can't be parsed — the reducer treats null as "no era match"
 * which means it'll be excluded from any non-'All' era filter.
 */

import type { EraBucket } from '../types';

export function eraBucket(year: string | null | undefined): EraBucket | null {
  if (!year) return null;
  const m = String(year).match(/\d{4}/);
  const y = m ? parseInt(m[0], 10) : NaN;
  if (Number.isNaN(y)) return null;
  if (y < 1900) return 'pre1900';
  if (y < 1950) return '1900-1949';
  if (y < 2000) return '1950-1999';
  return '2000+';
}
