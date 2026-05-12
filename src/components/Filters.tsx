/**
 * Collapsible filters block. Three single-select chip rows (borough,
 * type, era) feeding into the FiltersState reducer. Uses native
 * <details>/<summary> for open/close so we get keyboard and ARIA
 * support for free.
 */

import type { FiltersState } from '../state/filtersReducer';
import { hasActiveFilters } from '../state/filtersReducer';
import type { Borough, EraBucket, TypeFilter } from '../types';
import { configFor } from '../utils/icons';
import { asset } from '../utils/asset';

interface Props {
  state: FiltersState;
  onSetBorough: (b: Borough) => void;
  onSetType: (t: TypeFilter) => void;
  onSetEra: (e: EraBucket) => void;
  onReset: () => void;
}

const BOROUGHS: Borough[] = ['All', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
const TYPES: TypeFilter[] = ['All', 'Sculpture', 'Mural', 'Installation', 'Plaque', 'Fountain', 'Relief'];
const ERAS: { value: EraBucket; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'pre1900', label: 'Pre-1900' },
  { value: '1900-1949', label: '1900–1949' },
  { value: '1950-1999', label: '1950–1999' },
  { value: '2000+', label: '2000+' },
];
const ERA_LABEL: Record<EraBucket, string> = {
  All: 'All',
  pre1900: 'Pre-1900',
  '1900-1949': '1900–1949',
  '1950-1999': '1950–1999',
  '2000+': '2000+',
};

export function Filters({ state, onSetBorough, onSetType, onSetEra, onReset }: Props) {
  // Compose the inline summary that renders next to the "Filters" label
  const active: string[] = [];
  if (state.borough !== 'All') active.push(state.borough);
  if (state.type !== 'All') active.push(state.type);
  if (state.era !== 'All') active.push(ERA_LABEL[state.era]);
  const summary = active.length ? '· ' + active.join(' · ') : '';

  // Default-collapsed so the artwork list gets the screen real-estate
  // immediately. The toggle row still surfaces any active filters
  // inline ("· Manhattan · Mural") so the user knows what's applied.
  return (
    <details className="filters">
      <summary className="filters-toggle">
        <span className="filters-toggle-label">Filters</span>
        <span className="filters-summary">{summary}</span>
        <span className="filters-chevron" aria-hidden>
          ▾
        </span>
      </summary>

      <div className="filter-label">BOROUGH</div>
      <div className="chip-row">
        {BOROUGHS.map((b) => (
          <button
            key={b}
            className={`chip ${state.borough === b ? 'active' : ''}`}
            onClick={() => onSetBorough(b)}
          >
            {b === 'Staten Island' ? 'Staten Is.' : b}
          </button>
        ))}
      </div>

      <div className="filter-label">TYPE</div>
      <div className="chip-row">
        {TYPES.map((t) => {
          // 'All' is the only one without an associated Blossom icon —
          // every real type maps to one of the 7 brand glyphs via configFor.
          const cfg = t === 'All' ? null : configFor(t);
          return (
            <button
              key={t}
              className={`chip ${state.type === t ? 'active' : ''}`}
              onClick={() => onSetType(t)}
            >
              {cfg && (
                <span
                  className="chip-icon"
                  style={{
                    background: cfg.color,
                    WebkitMask: `url(${asset(cfg.file)}) center/contain no-repeat`,
                    mask: `url(${asset(cfg.file)}) center/contain no-repeat`,
                  }}
                />
              )}
              {t}
            </button>
          );
        })}
      </div>

      <div className="filter-label">ERA</div>
      <div className="chip-row">
        {ERAS.map((e) => (
          <button
            key={e.value}
            className={`chip ${state.era === e.value ? 'active' : ''}`}
            onClick={() => onSetEra(e.value)}
          >
            {e.label}
          </button>
        ))}
      </div>

      {hasActiveFilters(state) && (
        <button
          className="filters-reset visible"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReset();
          }}
        >
          ↺ Reset
        </button>
      )}
    </details>
  );
}
