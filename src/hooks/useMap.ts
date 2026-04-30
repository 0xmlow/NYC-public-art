/**
 * useMap — initializes a Mapbox GL JS map exactly once, loads the
 * Blossom icons + NYC mask, and registers the artworks GeoJSON source
 * with three layers (clusters / cluster-count / points).
 *
 * Returns a stable `mapRef` (the live mapboxgl.Map instance, may be
 * null until 'load') plus an `isReady` flag callers can use to gate
 * setData / flyTo calls.
 *
 * GIS techniques exercised in here, per assignment rubric:
 *   • GeoJSON source with built-in clustering
 *   • circle / symbol / fill / fill-extrusion layers
 *   • data-driven styling: get / step / case / interpolate expressions
 *   • polygon-with-holes mask
 *   • camera bounds + zoom limits (maxBounds, minZoom, maxZoom)
 */

import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '../types';
import { BLOSSOM_ICONS, iconNameFor } from '../utils/icons';
import { asset } from '../utils/asset';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiMHhtbG93IiwiYSI6ImNtbzF2N2g0dDAxd2gyb3Buc3NyaGw5OG4ifQ.VKV6k6ioa2qvD2o5q3WOcg';

export interface UseMapResult {
  mapRef: React.MutableRefObject<MapboxMap | null>;
  isReady: boolean;
}

interface UseMapOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  artworks: Artwork[];
  onPointClick: (id: string) => void;
}

export function useMap({ containerRef, artworks, onPointClick }: UseMapOptions): UseMapResult {
  const mapRef = useRef<MapboxMap | null>(null);
  const [isReady, setReady] = useState(false);
  const onPointClickRef = useRef(onPointClick);
  onPointClickRef.current = onPointClick;

  // ── Initialize the map exactly once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-74.02, 40.68],
      zoom: 9.4,
      pitch: 0,
      bearing: 0,
      antialias: true,
      // Hard-bound the camera to NYC so the user can never wander off.
      maxBounds: [
        [-74.45, 40.40],
        [-73.50, 41.00],
      ],
      minZoom: 9.2,
      maxZoom: 19,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('style.load', () => add3DBuildings(map));

    map.on('load', async () => {
      await loadAllIcons(map);
      await addNycMask(map);
      buildArtworkLayers(map, artworks, (id) => onPointClickRef.current(id));
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // We intentionally only run on mount — artworks are passed into
    // buildArtworkLayers once, then patched via setData in the parent
    // component when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mapRef, isReady };
}

// ─────────────────────────────────────────────────────────────────
// Below: helpers extracted from the vanilla script.js, unchanged in
// behavior. They live outside the hook so React Fast Refresh doesn't
// re-create them on every render.
// ─────────────────────────────────────────────────────────────────

async function loadAllIcons(map: MapboxMap): Promise<void> {
  for (const [type, cfg] of Object.entries(BLOSSOM_ICONS)) {
    const name = iconNameFor(type);
    if (map.hasImage(name)) continue;
    try {
      const data = await rasterizeBlossom(asset(cfg.file), cfg.color);
      map.addImage(name, data);
    } catch (err) {
      console.warn('Icon load failed for', type, err);
    }
  }
}

function rasterizeBlossom(file: string, color: string, size = 128): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      // Recolor: keep the SVG's alpha channel, replace black with target color
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';

      // Soft drop shadow for legibility on the dark map
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = size;
      shadowCanvas.height = size;
      const sctx = shadowCanvas.getContext('2d')!;
      sctx.shadowColor = 'rgba(0,0,0,0.55)';
      sctx.shadowBlur = 10;
      sctx.drawImage(canvas, 0, 0);

      const out = document.createElement('canvas');
      out.width = size;
      out.height = size;
      const octx = out.getContext('2d')!;
      octx.drawImage(shadowCanvas, 0, 0);
      octx.drawImage(canvas, 0, 0);
      resolve(octx.getImageData(0, 0, size, size));
    };
    img.onerror = () => reject(new Error('Failed to load icon: ' + file));
    img.src = file;
  });
}

async function addNycMask(map: MapboxMap): Promise<void> {
  try {
    const res = await fetch(asset('data/nyc_mask.json'));
    if (!res.ok) throw new Error('mask fetch ' + res.status);
    const fc = await res.json();

    map.addSource('nyc-mask', { type: 'geojson', data: fc });

    // Dimming layer: fill-opacity is ZOOM-DRIVEN via interpolate.
    // Closer in → softer dim so context isn't lost.
    map.addLayer({
      id: 'nyc-mask',
      type: 'fill',
      source: 'nyc-mask',
      paint: {
        'fill-color': '#05060a',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          9, 0.58,
          12, 0.48,
          15, 0.38,
        ],
        'fill-antialias': true,
      },
    });
    // Subtle amber outline around the borough boundary
    map.addLayer({
      id: 'nyc-outline',
      type: 'line',
      source: 'nyc-mask',
      paint: {
        'line-color': 'rgba(255, 184, 77, 0.35)',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 1.2,
          14, 2.4,
        ],
        'line-blur': 0.6,
      },
    });
  } catch (err) {
    console.warn('NYC mask failed to load:', err);
  }
}

function add3DBuildings(map: MapboxMap): void {
  if (map.getLayer('3d-buildings')) return;
  const layers = map.getStyle().layers ?? [];
  const labelLayerId = layers.find(
    (l) => l.type === 'symbol' && (l.layout as any)?.['text-field']
  )?.id;
  map.addLayer(
    {
      id: '3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', 'extrude', 'true'],
      type: 'fill-extrusion',
      minzoom: 12,
      paint: {
        'fill-extrusion-color': '#1c1c28',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.88,
      },
    },
    labelLayerId
  );
}

export function artworkToFeature(a: Artwork): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {
      id: a.id,
      title: a.title,
      artist: a.artist,
      type: a.type,
      borough: a.borough,
      iconName: iconNameFor(a.type),
      curated: a.source === 'Curated' ? 1 : 0,
    },
    geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
  };
}

function buildArtworkLayers(
  map: MapboxMap,
  artworks: Artwork[],
  onPointClick: (id: string) => void
): void {
  // ── Build the FeatureCollection from raw records ──
  const fc: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: artworks.map(artworkToFeature),
  };

  // ── GeoJSON source with built-in clustering ──
  // Mapbox runs supercluster internally; emits cluster features
  // (with point_count) at low zooms, breaks them apart as you zoom in.
  map.addSource('artworks', {
    type: 'geojson',
    data: fc,
    cluster: true,
    clusterRadius: 42,
    clusterMaxZoom: 14,
  });

  // LAYER 1 — cluster bubbles. circle-color & circle-radius are
  // STEP expressions on point_count.
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'artworks',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#ffb84d', 10,
        '#ff8a5e', 50,
        '#ff5e7e', 200, '#c9a7ff',
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        16, 10,
        22, 50,
        30, 200, 38,
      ],
      'circle-opacity': 0.88,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.4)',
    },
  });

  // LAYER 2 — cluster count labels (symbol)
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'artworks',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 13,
    },
    paint: { 'text-color': '#0a0a0f' },
  });

  // LAYER 3 — individual artwork pins. icon-image is data-driven
  // via ['get','iconName']; icon-size interpolates on zoom AND the
  // curated flag.
  map.addLayer({
    id: 'points',
    type: 'symbol',
    source: 'artworks',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'iconName'],
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        10, ['case', ['==', ['get', 'curated'], 1], 0.22, 0.14],
        14, ['case', ['==', ['get', 'curated'], 1], 0.36, 0.24],
        18, ['case', ['==', ['get', 'curated'], 1], 0.54, 0.38],
      ],
      'icon-allow-overlap': true,
      'symbol-sort-key': ['case', ['==', ['get', 'curated'], 1], 1, 0],
    },
    paint: {
      'icon-opacity': ['case', ['==', ['get', 'curated'], 1], 1.0, 0.92],
    },
  });

  // ── Interactivity ──
  map.on('click', 'clusters', (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
    const cid = (f.properties as any).cluster_id;
    (map.getSource('artworks') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
      cid,
      (err, zoom) => {
        if (err || zoom == null) return;
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      }
    );
  });

  map.on('click', 'points', (e) => {
    const f = e.features?.[0];
    if (!f) return;
    onPointClick((f.properties as any).id);
  });

  for (const layer of ['clusters', 'points']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }

  // Hover popup preview
  const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  map.on('mouseenter', 'points', (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as any;
    hoverPopup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(
        `<h3>${escapeHtml(p.title)}</h3>
         <div class="popup-artist">${escapeHtml(p.artist)} · ${escapeHtml(p.borough)}</div>
         <div class="popup-open-detail">Click to open ↗</div>`
      )
      .addTo(map);
  });
  map.on('mouseleave', 'points', () => hoverPopup.remove());
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
