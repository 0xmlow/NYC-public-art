/**
 * useDemo — auto-runs a scripted walkthrough of every feature when
 * the URL contains `?demo=1`. Designed for screen-recording: every
 * step advances on a timer, with caption overlays narrating what's
 * happening. ESC aborts the tour.
 *
 * The hook is passive — it accepts callbacks for the actions it
 * doesn't own (filter/select/enter/surprise) and the App.tsx wires
 * them up. Keeps demo logic out of the main composition.
 */

import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { Artwork } from '../types';
import type { Borough, TypeFilter } from '../types';

export interface Caption {
  title: string;
  sub?: string;
}

export interface UseDemoArgs {
  enabled: boolean;
  mapRef: React.MutableRefObject<MapboxMap | null>;
  artworks: Artwork[];
  isReady: boolean;
  onEnterGallery: () => void;
  onSelect: (id: string) => void;
  onSurprise: () => void;
  onSetType: (t: TypeFilter) => void;
  onSetBorough: (b: Borough) => void;
  onSetQuery: (q: string) => void;
  onResetFilters: () => void;
  onCloseDetail: () => void;
}

export function useDemo(args: UseDemoArgs): { caption: Caption | null; running: boolean } {
  const [caption, setCaption] = useState<Caption | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!args.enabled || !args.isReady || !args.artworks.length) return;
    if (running) return;
    setRunning(true);
    abortRef.current = false;

    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const t = setTimeout(() => res(), ms);
        // If aborted mid-wait, resolve early
        if (abortRef.current) {
          clearTimeout(t);
          res();
        }
      });

    const findByTitle = (substr: string): Artwork | undefined =>
      args.artworks.find((a) => a.title?.toLowerCase().includes(substr.toLowerCase()));

    async function typeQuery(text: string, delayMs = 55) {
      for (let i = 1; i <= text.length; i++) {
        if (abortRef.current) return;
        args.onSetQuery(text.slice(0, i));
        await wait(delayMs);
      }
    }

    async function tour() {
      // 1. Intro card — site purpose
      setCaption({ title: 'Painted City', sub: 'A narrative cartography of NYC public art' });
      await wait(3500);
      setCaption(null);
      await wait(300);

      // 2. Enter gallery — slow north-up zoom-in (no pitch/bearing)
      setCaption({ title: '1,436 artworks. 5 boroughs.', sub: 'One interactive field guide.' });
      args.onEnterGallery();
      await wait(3600);
      setCaption(null);
      await wait(4500);

      // 3. Color-coded pins
      const map = args.mapRef.current;
      if (map) {
        setCaption({
          title: 'Color-coded by type',
          sub: 'Sculpture · Mural · Installation · Plaque · Fountain · Relief',
        });
        map.flyTo({
          center: [-73.9857, 40.758],
          zoom: 14.2,
          pitch: 30,
          bearing: 0,
          duration: 3500,
          essential: true,
        });
        await wait(4200);
        setCaption(null);
      }

      // 4. Open Charging Bull
      const bull = findByTitle('Charging Bull');
      if (bull) {
        setCaption({ title: 'Click a pin', sub: 'Full image · artist statement · metadata' });
        args.onSelect(bull.id);
        await wait(5000);
        args.onCloseDetail();
      }

      // 5. Crack is Wack in Harlem
      const crack = findByTitle('Crack is Wack');
      if (crack) {
        args.onSelect(crack.id);
        await wait(1200);
        setCaption({ title: 'Keith Haring, 1986', sub: 'Crack is Wack · 128th & 2nd' });
        await wait(4500);
        args.onCloseDetail();
      }

      // 6. Filter chips — Mural
      map?.flyTo({ center: [-73.95, 40.72], zoom: 12.3, pitch: 0, bearing: 0, duration: 2000 });
      await wait(1800);
      setCaption({ title: 'Filter by type', sub: 'Instant color-coded clusters' });
      args.onSetType('Mural');
      await wait(3700);
      setCaption(null);
      args.onResetFilters();
      await wait(400);

      // 7. Full-text search
      setCaption({ title: 'Search across everything', sub: 'title · artist · borough · year' });
      await typeQuery('Haring');
      await wait(2600);
      args.onSetQuery('');
      setCaption(null);
      await wait(300);

      // 8. Borough filter — Bronx
      setCaption({ title: 'Browse one borough', sub: 'Bronx' });
      args.onSetBorough('Bronx');
      map?.flyTo({ center: [-73.87, 40.84], zoom: 11.8, pitch: 0, bearing: 0, duration: 2200 });
      await wait(3200);
      setCaption(null);
      args.onResetFilters();
      await wait(300);

      // 9. Surprise me
      setCaption({ title: 'Shuffle', sub: 'Surprise me' });
      args.onSurprise();
      await wait(4500);

      // 10. Outro
      args.onCloseDetail();
      map?.flyTo({ center: [-74.0, 40.72], zoom: 10.4, pitch: 0, bearing: 0, duration: 3000 });
      await wait(1200);
      setCaption({ title: 'Painted City', sub: 'publicnyc.art' });
      await wait(4500);
      setCaption(null);
      setRunning(false);
    }

    tour();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abortRef.current = true;
        setCaption(null);
        setRunning(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.isReady, args.artworks.length]);

  return { caption, running };
}
