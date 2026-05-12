/**
 * Right-side detail panel. Shows the active artwork's image, title,
 * artist, location, description, optional artist statement, metadata
 * definitions, and source links.
 */

import { useState } from 'react';
import type { Artwork } from '../types';
import { configFor } from '../utils/icons';

interface Props {
  artwork: Artwork | null;
  onClose: () => void;
}

export function DetailPanel({ artwork, onClose }: Props) {
  // Reset image error when artwork changes (uses key on <img> below).
  return (
    <aside className={`detail ${artwork ? 'visible' : ''}`}>
      <button className="detail-close" title="Close" onClick={onClose}>
        ×
      </button>

      {artwork && (
        <>
          <DetailImage artwork={artwork} />
          <div className="detail-body">
            <div className="detail-eyebrow" style={{ color: configFor(artwork.type).color }}>
              {artwork.type || 'ARTWORK'}
            </div>
            <h2 className="detail-title">{artwork.title || 'Untitled'}</h2>
            <div className="detail-artist">
              {[artwork.artist, artwork.year].filter(Boolean).join(' · ')}
            </div>
            <div className="detail-location">
              {artwork.location || `${artwork.borough}, New York`}
            </div>

            {artwork.description && <p className="detail-desc">{artwork.description}</p>}

            {artwork.artist_statement && (
              <blockquote className="detail-statement visible">{artwork.artist_statement}</blockquote>
            )}

            <DetailMeta artwork={artwork} />

            <div className="detail-links">
              {artwork.source_link && (
                <a
                  className="detail-source"
                  href={artwork.source_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {sourceLabel(artwork.source_link)}
                </a>
              )}
              {artwork.parks_link && (
                <a
                  className="detail-source detail-source-ghost"
                  href={artwork.parks_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NYC Parks page ↗
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function DetailImage({ artwork }: { artwork: Artwork }) {
  const [errored, setErrored] = useState(false);
  const showImg = !!artwork.image_url && !errored;
  return (
    <div className="detail-img-wrap">
      <div className={`detail-img-placeholder ${showImg ? 'hidden' : ''}`} />
      {showImg && (
        <img
          key={artwork.id}
          className="detail-img visible"
          src={artwork.image_url}
          alt={artwork.title}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}

function DetailMeta({ artwork }: { artwork: Artwork }) {
  const rows: [string, string][] = [];
  if (artwork.materials) rows.push(['Materials', artwork.materials]);
  if (artwork.dimensions) rows.push(['Dimensions', artwork.dimensions]);
  if (artwork.sponsor) rows.push(['Sponsor', artwork.sponsor]);
  if (artwork.donor) rows.push(['Donor', artwork.donor]);
  if (artwork.inscription) rows.push(['Inscription', `"${artwork.inscription}"`]);
  if (artwork.status) rows.push(['Status', artwork.status]);
  if (artwork.source) rows.push(['Source', artwork.source]);
  if (!rows.length) return null;
  return (
    <dl className="detail-meta">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function sourceLabel(url: string): string {
  if (url.includes('google.com/search')) return 'Search the web ↗';
  if (url.includes('wikipedia.org/w/index.php?search=')) return 'Look up on Wikipedia ↗';
  if (url.includes('wikipedia.org/wiki/')) return 'Read on Wikipedia ↗';
  if (url.includes('thehighline.org')) return 'View on The High Line ↗';
  if (url.includes('nycgovparks.org')) return 'View on NYC Parks ↗';
  return 'View source ↗';
}
