// ============================================================
// PAINTED CITY — A Narrative Cartography of NYC's Urban Gallery
// ============================================================

const MAPBOX_TOKEN = 'pk.eyJ1IjoiMHhtbG93IiwiYSI6ImNtbzF2N2g0dDAxd2gyb3Buc3NyaGw5OG4ifQ.VKV6k6ioa2qvD2o5q3WOcg';
const DATA_URL = 'data/artworks.json';

// ------------------------------------------------------------
// Blossom icons + color-coding per category
// ------------------------------------------------------------
const BLOSSOM_ICONS = {
  Sculpture:    { file: 'icons/blossom-01.svg', color: '#ffb84d' },
  Mural:        { file: 'icons/blossom-03.svg', color: '#ff5e7e' },
  Installation: { file: 'icons/blossom-02.svg', color: '#4de1c2' },
  Plaque:       { file: 'icons/blossom-04.svg', color: '#c9a7ff' },
  Fountain:     { file: 'icons/blossom-05.svg', color: '#7ec9ff' },
  Relief:       { file: 'icons/blossom-06.svg', color: '#ffd27a' },
  Signage:      { file: 'icons/blossom-04.svg', color: '#c9a7ff' },
  Other:        { file: 'icons/blossom-07.svg', color: '#9a9aa8' }
};

// Convenience lookup: type → color
const TYPE_COLORS = Object.fromEntries(
  Object.entries(BLOSSOM_ICONS).map(([t, c]) => [t, c.color])
);

function configFor(type) {
  return BLOSSOM_ICONS[type] || BLOSSOM_ICONS.Other;
}
function iconNameFor(type) {
  return `blossom-${type in BLOSSOM_ICONS ? type : 'Other'}`;
}

// ------------------------------------------------------------
// Global state
// ------------------------------------------------------------
const state = {
  artworks: [],
  filtered: [],
  borough: 'All',
  type: 'All',
  era: 'All',
  query: '',
  activeId: null,
  map: null
};

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function $(id) { return document.getElementById(id); }

function eraBucket(year) {
  if (!year) return null;
  const y = parseInt(String(year).match(/\d{4}/)?.[0], 10);
  if (!y) return null;
  if (y < 1900) return 'pre1900';
  if (y < 1950) return '1900-1949';
  if (y < 2000) return '1950-1999';
  return '2000+';
}

function isCurated(art) { return art.source === 'Curated'; }

// ------------------------------------------------------------
// Filter + search
// ------------------------------------------------------------
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.artworks.filter(a => {
    if (state.borough !== 'All' && a.borough !== state.borough) return false;
    if (state.type !== 'All' && a.type !== state.type) return false;
    if (state.era !== 'All' && eraBucket(a.year) !== state.era) return false;
    if (q) {
      const hay = `${a.title} ${a.artist} ${a.borough} ${a.location} ${a.type} ${a.year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  updateMapFilter();
  renderList();
  $('count').textContent = state.filtered.length.toLocaleString();
}

function toFeature(a) {
  return {
    type: 'Feature',
    properties: {
      id: a.id,
      title: a.title,
      artist: a.artist,
      type: a.type,
      borough: a.borough,
      color: TYPE_COLORS[a.type] || TYPE_COLORS.Other,
      iconName: iconNameFor(a.type),
      curated: isCurated(a) ? 1 : 0
    },
    geometry: { type: 'Point', coordinates: [a.lon, a.lat] }
  };
}

function updateMapFilter() {
  if (!state.map || !state.map.getSource('artworks')) return;
  const fc = {
    type: 'FeatureCollection',
    features: state.filtered.map(toFeature)
  };
  state.map.getSource('artworks').setData(fc);
}

// ------------------------------------------------------------
// List render
// ------------------------------------------------------------
function renderList() {
  const list = $('list');
  if (!state.filtered.length) {
    list.innerHTML = `
      <div class="list-empty">
        <span class="emoji">◌</span>
        No works match these filters.<br/>
        Try widening your search.
      </div>`;
    return;
  }
  const rows = state.filtered.slice(0, 300);
  const html = rows.map(a => `
    <div class="list-item" data-id="${escapeHtml(a.id)}">
      <div class="list-title">
        <span>${escapeHtml(a.title)}</span>
        ${isCurated(a) ? '<span class="curated-badge">Curated</span>' : ''}
      </div>
      <div class="list-meta">
        <span class="type-swatch" style="background:${configFor(a.type).color}"></span>
        ${escapeHtml(a.artist)}${a.year ? ' · ' + escapeHtml(a.year) : ''}
        <span class="dot">·</span>
        <span class="borough-tag">${escapeHtml(a.borough)}</span>
        <span class="dot">·</span>
        <span class="type-tag">${escapeHtml(a.type)}</span>
      </div>
    </div>
  `).join('');
  const footer = state.filtered.length > rows.length
    ? `<div class="list-empty" style="padding:20px 22px;font-size:11px;">+ ${state.filtered.length - rows.length} more on the map — use filters to narrow</div>`
    : '';
  list.innerHTML = html + footer;

  list.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => {
      selectArtwork(el.getAttribute('data-id'), { fly: true });
    });
  });
}

// ------------------------------------------------------------
// Detail panel
// ------------------------------------------------------------
function showDetail(art) {
  const panel = $('detail');
  $('detailType').textContent = art.type || 'ARTWORK';
  $('detailTitle').textContent = art.title || 'Untitled';
  $('detailArtist').textContent = [art.artist, art.year].filter(Boolean).join(' · ');
  $('detailLocation').textContent = art.location || `${art.borough}, New York`;
  $('detailDesc').textContent = art.description || '';

  // Set type eyebrow color
  $('detailType').style.color = configFor(art.type).color;

  const img = $('detailImg');
  const ph = $('detailPlaceholder');
  if (art.image_url) {
    img.src = art.image_url;
    img.classList.add('visible');
    ph.classList.add('hidden');
    img.onerror = () => {
      img.classList.remove('visible');
      ph.classList.remove('hidden');
    };
  } else {
    img.src = '';
    img.classList.remove('visible');
    ph.classList.remove('hidden');
  }

  const stmt = $('detailStatement');
  if (art.artist_statement) {
    stmt.textContent = art.artist_statement;
    stmt.classList.add('visible');
  } else {
    stmt.classList.remove('visible');
    stmt.textContent = '';
  }

  const meta = $('detailMeta');
  const rows = [];
  if (art.materials)    rows.push(['Materials', art.materials]);
  if (art.dimensions)   rows.push(['Dimensions', art.dimensions]);
  if (art.sponsor)      rows.push(['Sponsor', art.sponsor]);
  if (art.donor)        rows.push(['Donor', art.donor]);
  if (art.inscription)  rows.push(['Inscription', '"' + art.inscription + '"']);
  if (art.status)       rows.push(['Status', art.status]);
  if (art.source)       rows.push(['Source', art.source]);
  meta.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');

  const link = $('detailSource');
  if (art.source_link) {
    link.href = art.source_link;
    link.style.display = 'inline-block';
  } else {
    link.style.display = 'none';
  }

  panel.classList.add('visible');
}

function hideDetail() {
  $('detail').classList.remove('visible');
  state.activeId = null;
  document.querySelectorAll('.list-item.active').forEach(el => el.classList.remove('active'));
}

// ------------------------------------------------------------
// Select an artwork
// ------------------------------------------------------------
function selectArtwork(id, { fly = true } = {}) {
  const art = state.artworks.find(a => a.id === id);
  if (!art) return;
  state.activeId = id;

  showDetail(art);

  document.querySelectorAll('.list-item').forEach(el => {
    const match = el.getAttribute('data-id') === id;
    el.classList.toggle('active', match);
    if (match) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  if (fly && state.map) {
    state.map.flyTo({
      center: [art.lon, art.lat],
      zoom: 16.5,
      pitch: 55,
      bearing: -18,
      speed: 1.2,
      curve: 1.4,
      essential: true
    });
  }
}

// ------------------------------------------------------------
// Surprise me
// ------------------------------------------------------------
function surpriseMe() {
  const pool = state.filtered.length ? state.filtered : state.artworks;
  if (!pool.length) return;
  const curated = pool.filter(isCurated);
  const pick = Math.random() < 0.4 && curated.length
    ? curated[Math.floor(Math.random() * curated.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  hideIntro();
  selectArtwork(pick.id, { fly: true });
}

// ------------------------------------------------------------
// Intro flyTo sequence
// ------------------------------------------------------------
function hideIntro() {
  $('intro').classList.add('hidden');
}

function enterGallery() {
  hideIntro();
  state.map.flyTo({
    center: [-74.0445, 40.6892],
    zoom: 13.2,
    pitch: 65,
    bearing: 20,
    duration: 3200,
    essential: true
  });
  setTimeout(() => {
    state.map.flyTo({
      center: [-73.9857, 40.7484],
      zoom: 12.0,
      pitch: 56,
      bearing: -15,
      duration: 4200,
      essential: true
    });
  }, 3300);
}

// ------------------------------------------------------------
// Bind UI
// ------------------------------------------------------------
function bindUI() {
  document.querySelectorAll('#boroughChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#boroughChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.borough = chip.getAttribute('data-borough');
      applyFilters();
    });
  });
  document.querySelectorAll('#typeChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#typeChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.type = chip.getAttribute('data-type');
      applyFilters();
    });
  });
  document.querySelectorAll('#eraChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#eraChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.era = chip.getAttribute('data-era');
      applyFilters();
    });
  });
  const search = $('search');
  const clearBtn = $('clearSearch');
  search.addEventListener('input', (e) => {
    state.query = e.target.value;
    clearBtn.classList.toggle('visible', !!state.query);
    applyFilters();
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    state.query = '';
    clearBtn.classList.remove('visible');
    applyFilters();
    search.focus();
  });

  const sidebar = $('sidebar');
  const reopen = $('reopenBtn');
  $('collapseBtn').addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    reopen.classList.add('visible');
  });
  reopen.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    reopen.classList.remove('visible');
  });

  $('detailClose').addEventListener('click', hideDetail);

  $('enterBtn').addEventListener('click', enterGallery);
  $('surpriseBtn').addEventListener('click', surpriseMe);
  $('shuffleBtn').addEventListener('click', surpriseMe);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideDetail();
    } else if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey && document.activeElement !== search) {
      surpriseMe();
    }
  });
}

// ------------------------------------------------------------
// Icon rasterization — load each SVG, render with target color
// baked in, register as a Mapbox image.
// ------------------------------------------------------------
function rasterizeBlossom(file, color, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Draw SVG (black on transparent)
      ctx.drawImage(img, 0, 0, size, size);
      // Recolor: keep alpha of original, replace black with target color
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      // Reset comp op for any subsequent ops
      ctx.globalCompositeOperation = 'source-over';
      // Add soft halo via shadow pass below the icon for legibility on dark map
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = size;
      shadowCanvas.height = size;
      const sctx = shadowCanvas.getContext('2d');
      sctx.shadowColor = 'rgba(0,0,0,0.55)';
      sctx.shadowBlur = 10;
      sctx.drawImage(canvas, 0, 0);
      // Compose: shadow first then icon
      const out = document.createElement('canvas');
      out.width = size; out.height = size;
      const octx = out.getContext('2d');
      octx.drawImage(shadowCanvas, 0, 0);
      octx.drawImage(canvas, 0, 0);
      resolve(octx.getImageData(0, 0, size, size));
    };
    img.onerror = () => reject(new Error('Failed to load icon: ' + file));
    img.src = file;
  });
}

async function loadAllIcons() {
  for (const [type, cfg] of Object.entries(BLOSSOM_ICONS)) {
    const name = iconNameFor(type);
    if (state.map.hasImage(name)) continue;
    try {
      const data = await rasterizeBlossom(cfg.file, cfg.color);
      state.map.addImage(name, data);
    } catch (err) {
      console.warn('Icon load failed for', type, err);
    }
  }
}

// ------------------------------------------------------------
// Build the Mapbox source + clustered layers
// ------------------------------------------------------------
function buildMapLayers() {
  const map = state.map;

  const fc = {
    type: 'FeatureCollection',
    features: state.artworks.map(toFeature)
  };

  map.addSource('artworks', {
    type: 'geojson',
    data: fc,
    cluster: true,
    clusterRadius: 42,
    clusterMaxZoom: 14
  });

  // Cluster bubbles
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
        '#ff5e7e', 200, '#c9a7ff'
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        16, 10,
        22, 50,
        30, 200, 38
      ],
      'circle-opacity': 0.88,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.4)'
    }
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'artworks',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 13
    },
    paint: { 'text-color': '#0a0a0f' }
  });

  // Unclustered points — now Blossom icons, color-coded per type
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
        18, ['case', ['==', ['get', 'curated'], 1], 0.54, 0.38]
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      'symbol-sort-key': ['case', ['==', ['get', 'curated'], 1], 1, 0]
    },
    paint: {
      'icon-opacity': [
        'case',
        ['==', ['get', 'curated'], 1], 1.0,
        0.92
      ]
    }
  });

  // Click cluster → zoom
  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('artworks').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  // Click point → select
  map.on('click', 'points', (e) => {
    const feature = e.features[0];
    const id = feature.properties.id;
    selectArtwork(id, { fly: true });
  });

  for (const layer of ['clusters', 'points']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  map.on('mouseenter', 'points', (e) => {
    const f = e.features[0];
    const p = f.properties;
    hoverPopup
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <h3>${escapeHtml(p.title)}</h3>
        <div class="popup-artist">${escapeHtml(p.artist)} · ${escapeHtml(p.borough)}</div>
        <div class="popup-open-detail">Click to open ↗</div>
      `)
      .addTo(map);
  });
  map.on('mouseleave', 'points', () => hoverPopup.remove());
}

// ------------------------------------------------------------
// Add 3D building extrusions
// ------------------------------------------------------------
function add3DBuildings() {
  const layers = state.map.getStyle().layers;
  const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout && l.layout['text-field'])?.id;
  if (state.map.getLayer('3d-buildings')) return;
  state.map.addLayer({
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
      'fill-extrusion-opacity': 0.88
    }
  }, labelLayerId);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.artworks = await res.json();
  } catch (err) {
    console.error('Failed to load artworks.json:', err);
    $('loading').innerHTML = `
      <div style="text-align:center;padding:40px;color:#ff5e7e;font-family:'Space Mono',monospace;max-width:420px;">
        <div style="font-size:40px;margin-bottom:16px;">⚠</div>
        <div style="font-size:13px;line-height:1.6;">
          Could not load <code style="background:#1a1a24;padding:2px 6px;border-radius:4px">data/artworks.json</code><br/><br/>
          Make sure you're serving over HTTP (not file://).<br/>
          From the project folder run:<br/>
          <code style="background:#1a1a24;padding:6px 10px;border-radius:4px;display:inline-block;margin-top:8px;color:#4de1c2">python3 -m http.server 8765</code><br/><br/>
          then visit <code style="color:#ffb84d">localhost:8765</code>
        </div>
      </div>`;
    return;
  }

  state.filtered = state.artworks.slice();
  $('introCount').textContent = state.artworks.length.toLocaleString();

  mapboxgl.accessToken = MAPBOX_TOKEN;
  state.map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-74.02, 40.68],
    zoom: 9.4,
    pitch: 0,
    bearing: 0,
    antialias: true
  });

  state.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  state.map.addControl(new mapboxgl.FullscreenControl(), 'bottom-right');
  state.map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

  state.map.on('style.load', () => {
    add3DBuildings();
  });

  state.map.on('load', async () => {
    await loadAllIcons();
    buildMapLayers();
    applyFilters();
    bindUI();
    $('loading').classList.add('hidden');
  });
}

init();
