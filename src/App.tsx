/**
 * Top-level composition. Owns:
 *   • The filters reducer (useReducer)
 *   • The currently-active artwork id
 *   • The intro-card visibility
 *   • The sidebar collapsed state
 *
 * The map itself is initialized once (useMap) and then patched on
 * every filter change via setData() — that's the React-friendly way
 * to drive Mapbox without re-creating the WebGL context on every
 * render.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMap, artworkToFeature } from './hooks/useMap';
import { useArtworks } from './hooks/useArtworks';
import { filtersReducer, initialFilters } from './state/filtersReducer';
import { filterArtworks, isCurated } from './utils/filter';
import { Intro } from './components/Intro';
import { Sidebar } from './components/Sidebar';
import { DetailPanel } from './components/DetailPanel';
import { Legend } from './components/Legend';
import { LoadingSpinner } from './components/LoadingSpinner';

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const { artworks, loading, error } = useArtworks();
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [introHidden, setIntroHidden] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Map init — re-runs only on mount; artworks are passed for the
  // initial source, then patched via setData below.
  const { mapRef, isReady } = useMap({
    containerRef: mapContainerRef,
    artworks,
    onPointClick: handleSelect,
  });

  // Filtered set — recomputed only when artworks or filters change
  const filtered = useMemo(() => filterArtworks(artworks, filters), [artworks, filters]);
  const activeArt = useMemo(
    () => (activeId ? artworks.find((a) => a.id === activeId) ?? null : null),
    [activeId, artworks]
  );

  // ── Push filtered FeatureCollection to the map source ──
  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    const src = mapRef.current.getSource('artworks') as
      | { setData: (d: GeoJSON.FeatureCollection) => void }
      | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: filtered.map(artworkToFeature),
    });
  }, [filtered, isReady, mapRef]);

  // ── On first load, push the FULL dataset once it arrives ──
  // (useMap may have initialized with an empty array if artworks
  //  weren't loaded yet.) When isReady && artworks.length both go
  // truthy, the effect above will run — but we also need the data
  // to be bound *before* any filtering happens.
  useEffect(() => {
    if (!isReady || !mapRef.current || !artworks.length) return;
    const src = mapRef.current.getSource('artworks') as any;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: artworks.map(artworkToFeature),
    });
  }, [isReady, artworks, mapRef]);

  // ── Selection / camera control ──
  function handleSelect(id: string) {
    setActiveId(id);
    setIntroHidden(true);
    const art = artworks.find((a) => a.id === id);
    if (art && mapRef.current) {
      mapRef.current.flyTo({
        center: [art.lon, art.lat],
        zoom: 16.5,
        pitch: 55,
        bearing: -18,
        speed: 1.2,
        curve: 1.4,
        essential: true,
      });
    }
  }

  function handleEnterGallery() {
    setIntroHidden(true);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [-74.0445, 40.6892],
      zoom: 13.2,
      pitch: 65,
      bearing: 20,
      duration: 3200,
      essential: true,
    });
    setTimeout(() => {
      mapRef.current?.flyTo({
        center: [-73.9857, 40.7484],
        zoom: 12.0,
        pitch: 56,
        bearing: -15,
        duration: 4200,
        essential: true,
      });
    }, 3300);
  }

  function handleSurprise() {
    const pool = filtered.length ? filtered : artworks;
    if (!pool.length) return;
    const curated = pool.filter(isCurated);
    const pick =
      Math.random() < 0.4 && curated.length
        ? curated[Math.floor(Math.random() * curated.length)]
        : pool[Math.floor(Math.random() * pool.length)];
    handleSelect(pick.id);
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === 'Escape') setActiveId(null);
      else if (e.key === '/' && !inField) {
        e.preventDefault();
        document.getElementById('search')?.focus();
      } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !inField) {
        handleSurprise();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, artworks]);

  return (
    <>
      <div id="map" ref={mapContainerRef} />

      <Intro
        hidden={introHidden}
        total={artworks.length || 1436}
        onEnter={handleEnterGallery}
        onSurprise={handleSurprise}
      />

      <Sidebar
        filters={filters}
        dispatch={dispatch}
        filtered={filtered}
        activeId={activeId}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(true)}
        onSelect={handleSelect}
        onShuffle={handleSurprise}
      />

      {sidebarCollapsed && (
        <button className="reopen visible" title="Open sidebar" onClick={() => setSidebarCollapsed(false)}>
          ☰
        </button>
      )}

      <DetailPanel artwork={activeArt} onClose={() => setActiveId(null)} />

      <Legend />

      <LoadingSpinner hidden={!loading && !error} />

      {error && (
        <div
          style={{
            position: 'fixed',
            inset: '50% auto auto 50%',
            transform: 'translate(-50%, -50%)',
            color: '#ff5e7e',
            background: '#0a0a0f',
            padding: 24,
            border: '1px solid #ff5e7e',
            borderRadius: 8,
            fontFamily: 'Space Mono, monospace',
            fontSize: 13,
            maxWidth: 420,
            zIndex: 5000,
          }}
        >
          ⚠ Couldn't load data/artworks.json: {error}
        </div>
      )}
    </>
  );
}

// Suppress an unused-import warning on MapboxMap (used only as a type ref above)
export type _ = MapboxMap;
