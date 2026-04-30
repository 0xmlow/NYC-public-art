// ============================================================
// PAINTED CITY — Application Logic
// ------------------------------------------------------------
// All Mapbox + UI behavior lives in this single file:
//
//   1. CONFIG          — token, dataset URLs, type → icon/color tables
//   2. STATE           — current filter/search selection
//   3. DATA PIPELINE   — fetch artworks.json → convert each row into
//                         a GeoJSON Feature → set as a Mapbox source
//   4. MAP LAYERS      — three Mapbox layers driven by ONE GeoJSON
//                         source (clustering does the splitting):
//                           · clusters       (circle, paint expression
//                             reads `point_count` for size + color)
//                           · cluster-count  (symbol, label)
//                           · points         (symbol, icon-image is
//                             pulled from each feature's properties)
//                         …plus a 'nyc-mask' fill layer (data-driven
//                         opacity by zoom) and a '3d-buildings' fill-
//                         extrusion layer for context.
//   5. INTERACTIVITY   — click clusters to zoom, click pins to open
//                         a detail panel, hover to preview a popup,
//                         filter via chips, search via text input,
//                         keyboard shortcuts, and an auto-tour mode.
//   6. DEMO MODE       — `?demo=1` runs a scripted walkthrough so the
//                         site can be screen-recorded for submission.
//
// GIS CONCEPTS USED (per assignment rubric):
//   • GeoJSON loaded as a Mapbox `geojson` source
//   • Multiple `circle` and `symbol` layers reading from that source
//   • Clustering enabled at the source level (clusterRadius / clusterMaxZoom)
//   • Data-driven styling via Mapbox expressions:
//       - ['get', 'iconName']           → per-feature icon image
//       - ['step', ['get','point_count'], …]  → cluster size / color
//       - ['case', ['==', …], a, b]     → curated vs. non-curated styling
//       - ['interpolate', ['linear'], ['zoom'], …]  → zoom-driven scaling
//   • Camera control (flyTo) for guided exploration
//   • DOM-driven UI sync with map state (chips ↔ source.setData())
// ============================================================

// --- 1. CONFIG ----------------------------------------------------

// Mapbox public access token. This token is URL-restricted to this
// repo's GitHub Pages origin via the Mapbox dashboard, so it's safe
// to ship in client code (that's exactly what `pk.*` tokens are for).
const MAPBOX_TOKEN = 'pk.eyJ1IjoiMHhtbG93IiwiYSI6ImNtbzF2N2g0dDAxd2gyb3Buc3NyaGw5OG4ifQ.VKV6k6ioa2qvD2o5q3WOcg';

// Path to the main GeoJSON source — an array of artwork records that
// gets transformed into FeatureCollection at runtime via toFeature().
const DATA_URL = 'data/artworks.json';

// Path to the NYC borough mask polygon — used to dim everything
// outside the five boroughs (the "spotlight" effect).
const MASK_URL = 'data/nyc_mask.json';

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
  updateFilterSummary();
}

// Renders the inline summary of active filters next to the "Filters"
// header, and toggles the visibility of the Reset button. Called every
// time applyFilters() runs.
function updateFilterSummary() {
  const active = [];
  if (state.borough !== 'All') active.push(state.borough);
  if (state.type !== 'All')    active.push(state.type);
  if (state.era !== 'All') {
    const labels = { pre1900: 'Pre-1900', '1900-1949': '1900–1949',
                     '1950-1999': '1950–1999', '2000+': '2000+' };
    active.push(labels[state.era] || state.era);
  }
  const summary = $('filtersSummary');
  if (summary) summary.textContent = active.length ? '· ' + active.join(' · ') : '';
  const reset = $('filtersReset');
  if (reset) reset.classList.toggle('visible', active.length > 0);
}

// Reset every filter to "All" without clearing the search query.
function resetAllFilters() {
  state.borough = 'All';
  state.type = 'All';
  state.era = 'All';
  document.querySelectorAll('#boroughChips .chip').forEach(c =>
    c.classList.toggle('active', c.getAttribute('data-borough') === 'All'));
  document.querySelectorAll('#typeChips .chip').forEach(c =>
    c.classList.toggle('active', c.getAttribute('data-type') === 'All'));
  document.querySelectorAll('#eraChips .chip').forEach(c =>
    c.classList.toggle('active', c.getAttribute('data-era') === 'All'));
  applyFilters();
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

  // Source link: label adapts to where the link points so the user
  // knows what to expect when they click.
  const link = $('detailSource');
  if (art.source_link) {
    link.href = art.source_link;
    link.style.display = 'inline-block';
    let label = 'View source ↗';
    if (art.source_link.includes('google.com/search')) {
      label = 'Search the web ↗';
    } else if (art.source_link.includes('wikipedia.org/w/index.php?search=')) {
      label = 'Look up on Wikipedia ↗';
    } else if (art.source_link.includes('wikipedia.org/wiki/')) {
      label = 'Read on Wikipedia ↗';
    } else if (art.source_link.includes('thehighline.org')) {
      label = 'View on The High Line ↗';
    } else if (art.source_link.includes('nycgovparks.org')) {
      label = 'View on NYC Parks ↗';
    }
    link.textContent = label;
  } else {
    link.style.display = 'none';
  }

  // Secondary fallback link to the NYC Parks per-monument page.
  // Only shown for entries that carry a parks_link in the dataset
  // (parks-sourced entries with a known parknumber + monument number).
  const parksLink = $('detailParks');
  if (art.parks_link) {
    parksLink.href = art.parks_link;
    parksLink.style.display = 'inline-block';
  } else {
    parksLink.style.display = 'none';
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

  // Reset button — only visible when at least one filter is non-default.
  // Wired here instead of inline because the button lives inside the
  // <details> summary's expanded body and we want to stop the click
  // from also toggling the panel closed.
  const resetBtn = $('filtersReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetAllFilters();
    });
  }

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
// NYC spotlight mask — dims everything outside the five boroughs.
// ------------------------------------------------------------
async function addNycMask() {
  try {
    const res = await fetch(MASK_URL);
    if (!res.ok) throw new Error('mask fetch ' + res.status);
    const fc = await res.json();
    state.map.addSource('nyc-mask', { type: 'geojson', data: fc });
    state.map.addLayer({
      id: 'nyc-mask',
      type: 'fill',
      source: 'nyc-mask',
      paint: {
        'fill-color': '#05060a',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          9, 0.58,
          12, 0.48,
          15, 0.38
        ],
        'fill-antialias': true
      }
    });
    // Subtle glowing outline around NYC boundary
    state.map.addLayer({
      id: 'nyc-outline',
      type: 'line',
      source: 'nyc-mask',
      paint: {
        'line-color': 'rgba(255, 184, 77, 0.35)',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 1.2,
          14, 2.4
        ],
        'line-blur': 0.6
      }
    });
  } catch (err) {
    console.warn('NYC mask failed to load (continuing without):', err);
  }
}

// ------------------------------------------------------------
// Build the Mapbox source + clustered layers
// ------------------------------------------------------------
// This is where the GIS happens. We:
//   1. Convert our flat array of artwork records into a GeoJSON
//      FeatureCollection.
//   2. Register it as a single Mapbox `geojson` source with
//      clustering enabled — Mapbox handles all the spatial
//      bucketing for us at every zoom level.
//   3. Stack three layers on top of that one source. The same
//      data drives all three; only the `filter` differs.
// ------------------------------------------------------------
function buildMapLayers() {
  const map = state.map;

  // ── Build the FeatureCollection from our raw records ──
  // Each record becomes a Feature with a Point geometry [lon, lat]
  // and a properties bag that carries everything Mapbox expressions
  // will need (id, title, type, iconName, color, curated flag).
  const fc = {
    type: 'FeatureCollection',
    features: state.artworks.map(toFeature)
  };

  // ── Register the GeoJSON source ──
  // cluster:true means Mapbox runs supercluster internally and
  // emits cluster features (with point_count) at low zooms, then
  // breaks them apart as the user zooms in. `clusterMaxZoom` is the
  // last zoom level where clustering happens; above that, every
  // feature is rendered individually.
  map.addSource('artworks', {
    type: 'geojson',
    data: fc,
    cluster: true,
    clusterRadius: 42,    // px — points within 42px get bucketed
    clusterMaxZoom: 14    // zoom 15+ shows individual pins
  });

  // ── LAYER 1 of 3: cluster bubbles ──
  // Renders the circles you see at low zoom.
  // Filter: only features that have a `point_count` (i.e. clusters).
  // Both `circle-color` and `circle-radius` are DATA-DRIVEN
  // STEP expressions: they branch on the value of point_count.
  // The `step` operator returns the input value paired with the
  // largest step ≤ point_count.
  //   <  10  →  amber, 16px
  //  10–49  →  coral, 22px
  //  50–199 →  pink,  30px
  //  ≥ 200  →  lilac, 38px
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

  // ── LAYER 2 of 3: cluster count labels ──
  // A symbol layer that draws the abbreviated number ("1.2k", "237")
  // on top of each cluster bubble. `text-field` reads a property
  // automatically computed by Mapbox's clusterer.
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

  // ── LAYER 3 of 3: individual artwork pins ──
  // Filter: features WITHOUT point_count (i.e. unclustered points).
  // `icon-image` is data-driven — each feature carries an `iconName`
  // property that resolves to one of the seven Blossom SVGs we
  // pre-loaded into the map's image registry (loadAllIcons()).
  // `icon-size` interpolates linearly on zoom AND on the curated
  // flag — curated picks render ~50% larger so they pop out of
  // the noise.
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
      'icon-allow-overlap': true,    // don't hide pins that touch
      'icon-ignore-placement': false,
      // Curated artworks sort to the top so they render over the
      // crowd of NYC-Parks plaques and DOT public-art markers.
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
    antialias: true,
    // ── Geographic guardrails ───────────────────────────────
    // Hard-limit the camera so users can never wander off NYC.
    // Bbox padded ~0.2° around the five-borough envelope so the
    // mask outline + a comfortable harbor margin stay visible.
    maxBounds: [
      [-74.45, 40.40],   // SW corner (lon, lat) — west of Staten Island
      [-73.50, 41.00]    //  NE corner          — east of Bronx
    ],
    minZoom: 9.2,        // can't zoom out past 'all of NYC visible'
    maxZoom: 19          // Mapbox max for the streets source
  });

  state.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  state.map.addControl(new mapboxgl.FullscreenControl(), 'bottom-right');
  state.map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

  state.map.on('style.load', () => {
    add3DBuildings();
  });

  state.map.on('load', async () => {
    await loadAllIcons();
    await addNycMask();
    buildMapLayers();
    applyFilters();
    bindUI();
    $('loading').classList.add('hidden');

    // Auto-run demo tour if ?demo=1 in URL
    if (new URLSearchParams(location.search).get('demo') === '1') {
      setTimeout(() => runDemo(), 600);
    }
  });
}

// ============================================================
// DEMO MODE — auto-tour through every feature
// ============================================================
const DEMO = { active: false, abort: false };

function wait(ms) {
  return new Promise(res => {
    const t = setTimeout(res, ms);
    if (DEMO.abort) { clearTimeout(t); res(); }
  });
}

function showCaption(title, sub = '', ms = 0) {
  const el = $('demoCaption');
  el.innerHTML = `${escapeHtml(title)}${sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ''}`;
  el.classList.add('visible');
  if (ms > 0) {
    setTimeout(() => el.classList.remove('visible'), ms);
  }
}
function hideCaption() {
  $('demoCaption').classList.remove('visible');
}

function setTypeFilter(type) {
  document.querySelectorAll('#typeChips .chip').forEach(c =>
    c.classList.toggle('active', c.getAttribute('data-type') === type));
  state.type = type;
  applyFilters();
}
function setBoroughFilter(b) {
  document.querySelectorAll('#boroughChips .chip').forEach(c =>
    c.classList.toggle('active', c.getAttribute('data-borough') === b));
  state.borough = b;
  applyFilters();
}
function resetFilters() {
  setTypeFilter('All');
  setBoroughFilter('All');
  $('search').value = '';
  state.query = '';
  $('clearSearch').classList.remove('visible');
  applyFilters();
}

async function typeInSearch(text, delayMs = 55) {
  const el = $('search');
  el.focus();
  el.value = '';
  state.query = '';
  for (let i = 1; i <= text.length; i++) {
    if (DEMO.abort) return;
    el.value = text.slice(0, i);
    state.query = el.value;
    $('clearSearch').classList.toggle('visible', !!state.query);
    applyFilters();
    await wait(delayMs);
  }
}

function findByTitle(substr) {
  const s = substr.toLowerCase();
  return state.artworks.find(a => a.title && a.title.toLowerCase().includes(s));
}

async function runDemo() {
  if (DEMO.active) return;
  DEMO.active = true;
  DEMO.abort = false;
  document.body.classList.add('demo-mode');
  $('demoBadge').classList.add('visible');

  const esc = (e) => { if (e.key === 'Escape') stopDemo(); };
  document.addEventListener('keydown', esc);

  try {
    // ---------- 1. Intro card (4s) ----------
    showCaption('Painted City', 'A narrative cartography of NYC public art');
    await wait(3500);
    hideCaption();
    await wait(300);

    // ---------- 2. Enter gallery — cinematic flyTo ----------
    showCaption('1,436 artworks. 5 boroughs.', 'One interactive field guide.');
    enterGallery();
    await wait(3600);
    hideCaption();
    await wait(300);

    // Settle over Manhattan (enterGallery's second flyTo lands at ~7.5s total)
    await wait(4200);

    // ---------- 3. Zoom to reveal color-coded Blossom pins ----------
    showCaption('Color-coded by type', 'Sculpture · Mural · Installation · Plaque · Fountain · Relief', 5000);
    state.map.flyTo({
      center: [-73.9857, 40.7580],
      zoom: 14.2,
      pitch: 55,
      bearing: -12,
      duration: 3500,
      essential: true
    });
    await wait(4200);

    // ---------- 4. Open a curated piece with image + artist statement ----------
    hideCaption();
    const bull = findByTitle('Charging Bull');
    if (bull) {
      showCaption('Click a pin', 'Full image · artist statement · metadata', 3500);
      selectArtwork(bull.id, { fly: true });
      await wait(5000);
      hideDetail();
    }

    // ---------- 5. Crack is Wack in Harlem ----------
    const crack = findByTitle('Crack is Wack');
    if (crack) {
      selectArtwork(crack.id, { fly: true });
      await wait(1200);
      showCaption('Keith Haring, 1986', 'Crack is Wack · 128th & 2nd', 4200);
      await wait(4500);
      hideDetail();
    }

    // ---------- 6. Filter chips ----------
    state.map.flyTo({ center: [-73.95, 40.72], zoom: 12.3, pitch: 35, bearing: 0, duration: 2000 });
    await wait(1800);
    showCaption('Filter by type', 'Instant color-coded clusters', 3500);
    setTypeFilter('Mural');
    await wait(3700);

    // ---------- 7. Full-text search ----------
    hideCaption();
    resetFilters();
    await wait(400);
    showCaption('Search across everything', 'title · artist · borough · year', 4200);
    await typeInSearch('Haring');
    await wait(2600);

    // ---------- 8. Borough filter + surprise ----------
    hideCaption();
    resetFilters();
    await wait(300);
    showCaption('Browse one borough', 'Bronx', 3000);
    setBoroughFilter('Bronx');
    state.map.flyTo({ center: [-73.87, 40.84], zoom: 11.8, pitch: 45, bearing: 0, duration: 2200 });
    await wait(3200);

    // ---------- 9. Surprise me ----------
    hideCaption();
    resetFilters();
    await wait(300);
    showCaption('Shuffle', 'Surprise me', 2500);
    surpriseMe();
    await wait(4500);

    // ---------- 10. Outro ----------
    hideDetail();
    state.map.flyTo({ center: [-74.00, 40.72], zoom: 10.4, pitch: 50, bearing: 22, duration: 3000 });
    await wait(1200);
    showCaption('Painted City', '0xmlow.github.io/NYC-public-art');
    await wait(4500);
    hideCaption();

  } finally {
    document.removeEventListener('keydown', esc);
    document.body.classList.remove('demo-mode');
    $('demoBadge').classList.remove('visible');
    DEMO.active = false;
  }
}

function stopDemo() {
  DEMO.abort = true;
  hideCaption();
  $('demoBadge').classList.remove('visible');
  document.body.classList.remove('demo-mode');
  DEMO.active = false;
}

// expose for manual trigger from console
window.runDemo = runDemo;
window.stopDemo = stopDemo;

init();
