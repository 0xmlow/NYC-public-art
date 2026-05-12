/**
 * Bottom-left legend — maps each artwork TYPE to its color + Blossom
 * icon shape. Uses CSS mask on a colored span so the icon shape comes
 * from the SVG and the color from the inline `background` style.
 */

import { asset } from '../utils/asset';

interface Row {
  type: string;
  color: string;
  icon: string;
}
const ROWS: Row[] = [
  { type: 'Sculpture',    color: '#ffb84d', icon: 'icons/blossom-01.svg' },
  { type: 'Mural',        color: '#ff5e7e', icon: 'icons/blossom-03.svg' },
  { type: 'Installation', color: '#4de1c2', icon: 'icons/blossom-02.svg' },
  { type: 'Plaque',       color: '#c9a7ff', icon: 'icons/blossom-04.svg' },
  { type: 'Fountain',     color: '#7ec9ff', icon: 'icons/blossom-05.svg' },
  { type: 'Relief',       color: '#ffd27a', icon: 'icons/blossom-06.svg' },
];

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">TYPE</div>
      {ROWS.map((r) => (
        <div className="legend-row" key={r.type}>
          <span
            className="legend-icon"
            style={{
              background: r.color,
              WebkitMask: `url(${asset(r.icon)}) center/contain no-repeat`,
              mask: `url(${asset(r.icon)}) center/contain no-repeat`,
            }}
          />
          {r.type}
        </div>
      ))}
    </div>
  );
}
