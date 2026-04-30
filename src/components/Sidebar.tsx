/**
 * Left sidebar — composes search, filters, count line, and the
 * artwork list. Collapsible via the × button in the header; reopens
 * via the ☰ button shown when collapsed (rendered in App.tsx).
 */

import type { Artwork } from '../types';
import type { FiltersState, FiltersAction } from '../state/filtersReducer';
import type { Borough, EraBucket, TypeFilter } from '../types';
import { SearchInput } from './SearchInput';
import { Filters } from './Filters';
import { ArtworkList } from './ArtworkList';

interface Props {
  filters: FiltersState;
  dispatch: React.Dispatch<FiltersAction>;
  filtered: Artwork[];
  activeId: string | null;
  collapsed: boolean;
  onCollapse: () => void;
  onSelect: (id: string) => void;
  onShuffle: () => void;
}

export function Sidebar({
  filters,
  dispatch,
  filtered,
  activeId,
  collapsed,
  onCollapse,
  onSelect,
  onShuffle,
}: Props) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <header className="sidebar-header">
        <div className="sidebar-title">PAINTED CITY</div>
        <button className="collapse" title="Collapse" onClick={onCollapse}>
          ×
        </button>
      </header>

      <SearchInput value={filters.query} onChange={(q) => dispatch({ type: 'setQuery', value: q })} />

      <Filters
        state={filters}
        onSetBorough={(b: Borough) => dispatch({ type: 'setBorough', value: b })}
        onSetType={(t: TypeFilter) => dispatch({ type: 'setType', value: t })}
        onSetEra={(e: EraBucket) => dispatch({ type: 'setEra', value: e })}
        onReset={() => dispatch({ type: 'resetFiltersOnly' })}
      />

      <div className="count-line">
        <span>{filtered.length.toLocaleString()}</span> works on view
        <button className="shuffle-mini" title="Surprise me" onClick={onShuffle}>
          ↻ shuffle
        </button>
      </div>

      <ArtworkList filtered={filtered} activeId={activeId} onSelect={onSelect} />
    </aside>
  );
}
