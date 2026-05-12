/**
 * Loads artworks.json once on mount. Returns { artworks, loading, error }.
 */

import { useEffect, useState } from 'react';
import type { Artwork } from '../types';
import { asset } from '../utils/asset';

export function useArtworks(): {
  artworks: Artwork[];
  loading: boolean;
  error: string | null;
} {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(asset('data/artworks.json'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = (await res.json()) as Artwork[];
        if (!cancelled) {
          setArtworks(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { artworks, loading, error };
}
