/**
 * Scrollable list of filtered artworks. Caps at 300 rows for render
 * performance (the full set is still on the map). Click a row to
 * open the detail panel + flyTo on the map.
 */

import type { Artwork } from '../types';
import { configFor } from '../utils/icons';
import { isCurated } from '../utils/filter';

interface Props {
  filtered: Artwork[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const MAX_ROWS = 300;

export function ArtworkList({ filtered, activeId, onSelect }: Props) {
  if (!filtered.length) {
    return (
      <div className="list">
        <div className="list-empty">
          <span className="emoji">◌</span>
          No works match these filters.
          <br />
          Try widening your search.
        </div>
      </div>
    );
  }

  const rows = filtered.slice(0, MAX_ROWS);
  const overflow = filtered.length - rows.length;

  return (
    <div className="list">
      {rows.map((a) => (
        <div
          key={a.id}
          className={`list-item ${activeId === a.id ? 'active' : ''}`}
          onClick={() => onSelect(a.id)}
        >
          <div className="list-title">
            <span>{a.title}</span>
            {isCurated(a) && <span className="curated-badge">Curated</span>}
          </div>
          <div className="list-meta">
            <span className="type-swatch" style={{ background: configFor(a.type).color }} />
            {a.artist}
            {a.year ? ' · ' + a.year : ''}
            <span className="dot">·</span>
            <span className="borough-tag">{a.borough}</span>
            <span className="dot">·</span>
            <span className="type-tag">{a.type}</span>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div className="list-empty" style={{ padding: '20px 22px', fontSize: 11 }}>
          + {overflow.toLocaleString()} more on the map — use filters to narrow
        </div>
      )}
    </div>
  );
}
