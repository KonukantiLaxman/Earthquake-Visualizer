/* Earthquake Visualizer
   - Fetches USGS GeoJSON feeds (day/week/month)
   - Filters by minimum magnitude
   - Renders circle markers sized+colored by magnitude
   - List side shows items; clicking list item flies to marker and opens popup
   - Small animations (marker pulse, list hover)
*/

const map = L.map('map', { zoomControl: true }).setView([20, 0], 2);

// OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// UI elements
const magRange = document.getElementById('magRange');
const magValue = document.getElementById('magValue');
const timeRange = document.getElementById('timeRange');
const quakeList = document.getElementById('quake-list');
const lastUpdated = document.getElementById('lastUpdated');
const stats = document.getElementById('stats');
const refreshBtn = document.getElementById('refreshBtn');

let earthquakeData = [];
let currentRange = timeRange.value; // all_day | all_week | all_month
let minMagnitude = parseFloat(magRange.value) || 0;
let markersGroup = L.layerGroup().addTo(map); // group for markers
let idToMarker = new Map(); // map earthquake id -> marker

// helper: format time
function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleString(); // uses user's locale/timezone
}

// helper: choose color based on magnitude
function magColor(m) {
  if (m >= 6.0) return '#d32f2f';
  if (m >= 4.0) return '#f57c00';
  if (m >= 2.5) return '#ffd166';
  return '#ffd166';
}

// helper: choose size
function magRadius(m) {
  // clamp so very small mags still visible and very large not huge
  const base = Math.max(m, 0.8);
  return Math.min(24, Math.max(4, base * 3));
}

// clear and render data
function renderEarthquakes() {
  quakeList.innerHTML = '';
  markersGroup.clearLayers();
  idToMarker.clear();

  const visible = earthquakeData.filter(eq => (eq.properties.mag || 0) >= minMagnitude);

  stats.textContent = `${visible.length} events • Min mag ${minMagnitude.toFixed(1)}`;

  if (!visible.length) {
    quakeList.innerHTML = `<div class="muted">No earthquakes match the filters.</div>`;
    return;
  }

  // sort by magnitude descending for list
  visible.sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));

  visible.forEach(eq => {
    const id = eq.id;
    const mag = eq.properties.mag || 0;
    const place = eq.properties.place || 'Unknown location';
    const time = fmtTime(eq.properties.time);
    const coords = eq.geometry.coordinates; // [lon,lat,depth]
    const lat = coords[1], lon = coords[0], depth = coords[2];

    // create marker (circleMarker)
    const marker = L.circleMarker([lat, lon], {
      radius: magRadius(mag),
      fillColor: magColor(mag),
      color: '#00000020',
      weight: 1,
      fillOpacity: 0.85
    }).addTo(markersGroup);

    // bind popup with details
    const popupHtml = `
      <div style="min-width:180px">
        <div style="font-weight:700; margin-bottom:6px">${place}</div>
        <div>Magnitude: <strong>${mag.toFixed(1)}</strong></div>
        <div>Depth: ${depth ?? 'N/A'} km</div>
        <div style="margin-top:6px; font-size:0.9em; color:#cbd6df">${time}</div>
        <div style="margin-top:8px"><a href="${eq.properties.url}" target="_blank">View on USGS</a></div>
      </div>
    `;
    marker.bindPopup(popupHtml);

    // animate marker by adding CSS class after element is in DOM
    // (circleMarker uses SVG path which becomes available after addTo)
    setTimeout(() => {
      try {
        const el = marker.getElement();
        if (el) el.classList.add('pulse');
      } catch(e) { /* ignore */ }
    }, 60);

    // store for list click linking
    idToMarker.set(id, marker);

    // add list item
    const item = document.createElement('div');
    item.className = 'quake-item';
    item.innerHTML = `
      <div class="quake-left">
        <span class="mag ${mag>=6 ? 'high' : mag>=4 ? 'mid' : 'small'}">M ${mag.toFixed(1)}</span>
        <div class="quake-meta muted">${(eq.properties.time) ? new Date(eq.properties.time).toLocaleTimeString() : ''}</div>
      </div>
      <div class="quake-right">
        <div class="location">${place}</div>
        <div class="quake-meta muted">Depth: ${depth ?? 'N/A'} km</div>
      </div>
    `;

    // on click => fly to marker and open popup
    item.addEventListener('click', () => {
      map.flyTo([lat, lon], Math.max(4, Math.min(8, Math.floor(10 - mag))), { duration: 0.8 });
      marker.openPopup();
      // quick visual highlight on the item
      item.style.background = 'rgba(255,255,255,0.06)';
      setTimeout(() => item.style.background = '', 600);
    });

    quakeList.appendChild(item);
  });

  // fit bounds to visible markers (if enough)
  const allLayers = markersGroup.getLayers();
  if (allLayers.length) {
    const group = new L.featureGroup(allLayers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

// fetch USGS feed (day/week/month)
async function fetchEarthquakes() {
  const endpoint = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${currentRange}.geojson`;
  try {
    // show loading
    stats.textContent = 'Loading…';
    quakeList.innerHTML = '<div class="muted">Loading events…</div>';

    const resp = await fetch(endpoint, { cache: "no-store" });
    if (!resp.ok) throw new Error('Network response not ok');

    const data = await resp.json();
    earthquakeData = data.features || [];
    lastUpdated.textContent = 'Last: ' + new Date().toLocaleTimeString();
    renderEarthquakes();
  } catch (err) {
    console.error('Fetch error', err);
    quakeList.innerHTML = `<div class="muted">Failed to load data. Try refresh.</div>`;
    stats.textContent = 'Error';
  }
}

// UI handlers
magRange.addEventListener('input', (e) => {
  minMagnitude = parseFloat(e.target.value);
  magValue.textContent = minMagnitude.toFixed(1);
  renderEarthquakes();
});
timeRange.addEventListener('change', (e) => {
  currentRange = e.target.value;
  fetchEarthquakes();
});
refreshBtn.addEventListener('click', () => fetchEarthquakes());

// initial load
magValue.textContent = parseFloat(magRange.value).toFixed(1);
fetchEarthquakes();
