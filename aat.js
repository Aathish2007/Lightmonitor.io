// Chart instances
let sagCI = null, ctCI = null;

// Helper: get severity level based on sag angle
function getLevel(sag) {
  if (sag === null || sag === undefined) return 'normal';
  if (sag >= 45) return 'danger';
  if (sag >= 30) return 'notice';
  return 'normal';
}

// Update all cards (sag, ct, status)
function updateCards(sag, ct, time) {
  const sagEl = document.getElementById('v-sag');
  const subSag = document.getElementById('sub-sag');
  const cursor = document.getElementById('sag-cursor');
  const cardSag = document.getElementById('card-sag');

  if (sag !== null && !isNaN(sag)) {
    sagEl.innerHTML = sag.toFixed(1) + '<span class="dc-unit">°</span>';
    const pct = Math.min(100, Math.max(0, (sag / 90) * 100));
    cursor.style.left = pct + '%';
    const s = getLevel(sag);
    sagEl.style.color = s === 'normal' ? 'var(--accent)' : s === 'notice' ? 'var(--yellow)' : 'var(--red)';
    subSag.textContent = s === 'normal' ? 'Normal range (0°–30°)' : s === 'notice' ? 'Noticeable (30°–45°)' : '⚠ BREAKAGE DETECTED (>45°)';
    if (s === 'danger') cardSag.classList.add('danger-card');
    else cardSag.classList.remove('danger-card');
  } else {
    sagEl.innerHTML = '—<span class="dc-unit">°</span>';
  }

  const ctEl = document.getElementById('v-ct');
  const subCt = document.getElementById('sub-ct');
  const ctNote = document.getElementById('ct-note');
  if (ct !== null && !isNaN(ct)) {
    ctEl.innerHTML = ct.toFixed(1) + '<span class="dc-unit">A</span>';
    const level = getLevel(sag);
    if (level === 'danger') {
      ctEl.style.color = 'var(--red)';
      subCt.textContent = 'Current near zero — Line broken';
      ctNote.textContent = '⚠ Line breakage suspected';
    } else {
      ctEl.style.color = '#b45f06';
      subCt.textContent = ct > 0 ? 'Current flowing — line intact' : 'No current detected';
      ctNote.textContent = ct > 0 ? '✓ Line carrying nominal load' : '⚠ No current flow';
    }
  } else {
    ctEl.innerHTML = '—<span class="dc-unit">A</span>';
  }

  const vSt = document.getElementById('v-status');
  const subSt = document.getElementById('sub-status');
  const lastUp = document.getElementById('last-up');
  const level = getLevel(sag);
  vSt.textContent = level === 'normal' ? 'NORMAL' : level === 'notice' ? 'WARNING' : 'BREAKAGE';
  vSt.style.color = level === 'normal' ? 'var(--green)' : level === 'notice' ? 'var(--yellow)' : 'var(--red)';
  subSt.textContent = level === 'normal' ? 'All parameters within limits' : level === 'notice' ? 'Sag angle elevated — inspect line' : '⚠ Emergency: relay cutoff triggered!';
  if (time) lastUp.textContent = typeof time === 'string' ? new Date(time).toLocaleString() : time;
}

// Update notification triangle
function updateTriangle(sag) {
  const tri = document.getElementById('triangle');
  const icon = document.getElementById('tri-icon');
  const status = document.getElementById('notif-status');
  const desc = document.getElementById('notif-desc');
  const level = getLevel(sag);
  tri.className = 'triangle ' + level;
  status.className = 'notif-status ' + level;
  if (level === 'normal') {
    icon.textContent = '✓';
    status.textContent = 'NORMAL';
    desc.innerHTML = 'Sag angle within safe range.<br>No action required.';
  } else if (level === 'notice') {
    icon.textContent = '!';
    status.textContent = 'NOTICEABLE';
    desc.innerHTML = 'Sag is elevated (30°–45°).<br>Monitor closely.';
  } else {
    icon.textContent = '✕';
    status.textContent = 'BREAKAGE';
    desc.innerHTML = '⚠ Sag >45° detected!<br>Trigger relay cutoff NOW.';
  }
}

// Render charts from feeds array
function updateChartsWithFeeds(feeds, fSag, fCT) {
  const labels = feeds.map(f => {
    if (!f.created_at) return '';
    const d = new Date(f.created_at);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  });
  const sagData = feeds.map(f => parseFloat(f[fSag]) || 0);
  const ctData = feeds.map(f => parseFloat(f[fCT]) || 0);

  const baseOpts = (unit) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: c => `${c.parsed.y.toFixed(1)} ${unit}` } }
    },
    scales: {
      x: { ticks: { color: '#5a6e7c', font: { size: 9 }, maxTicksLimit: 6 }, grid: { color: '#e2e8f0' } },
      y: { ticks: { color: '#5a6e7c', font: { size: 10 } }, grid: { color: '#e9eef3' } }
    }
  });

  const sagCtx = document.getElementById('sagChart').getContext('2d');
  if (sagCI) sagCI.destroy();
  sagCI = new Chart(sagCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Sag', data: sagData, borderColor: '#2c6e9e', backgroundColor: '#eef2ff',
        borderWidth: 2, tension: 0.3, pointRadius: 2, fill: true, pointBackgroundColor: '#2c6e9e', pointBorderColor: '#ffffff'
      }]
    },
    options: baseOpts('°')
  });

  const ctCtx = document.getElementById('ctChart').getContext('2d');
  if (ctCI) ctCI.destroy();
  ctCI = new Chart(ctCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'CT', data: ctData, borderColor: '#b45f06', backgroundColor: '#fff2e0',
        borderWidth: 2, tension: 0.3, pointRadius: 2, fill: true, pointBackgroundColor: '#b45f06', pointBorderColor: '#ffffff'
      }]
    },
    options: baseOpts('A')
  });
}

// Render map with Leaflet
function renderMap(lat, lng, sag, ct) {
  const ph = document.getElementById('map-placeholder');
  const mel = document.getElementById('leaflet-map');
  ph.style.display = 'none';
  mel.style.display = 'block';

  function buildMap() {
    if (window._mapInst) { window._mapInst.remove(); window._mapInst = null; }
    window._mapInst = L.map(mel).setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(window._mapInst);
    const level = getLevel(sag);
    const col = level === 'normal' ? '#2b7e3a' : (level === 'notice' ? '#b45f06' : '#c23b22');
    L.circleMarker([lat, lng], { radius: 12, fillColor: col, color: '#ffffff', weight: 2, fillOpacity: 0.9 })
      .addTo(window._mapInst)
      .bindPopup(`<b>PowerLine Node</b><br>Sag: ${sag?.toFixed(1)}°<br>CT: ${ct?.toFixed(1)} A`)
      .openPopup();
  }

  if (!window.L) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js';
    js.onload = buildMap;
    document.head.appendChild(js);
  } else {
    buildMap();
  }
}

// Load demo data (pre-filled example)
function loadDemoData() {
  const demoLat = 40.7128;
  const demoLng = -74.0060;
  const demoSag = 24.7;
  const demoCT = 183.5;
  const demoTime = new Date().toLocaleString();

  updateCards(demoSag, demoCT, demoTime);
  updateTriangle(demoSag);

  // Generate 20-point history
  const demoFeeds = [];
  const now = new Date();
  for (let i = 19; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 30 * 60000);
    const sagVal = 20 + Math.sin(i * 0.8) * 4 + (Math.random() * 2);
    const ctVal = 170 + Math.cos(i * 0.6) * 15 + (Math.random() * 6);
    demoFeeds.push({
      created_at: ts.toISOString(),
      field1: sagVal.toFixed(1),
      field2: ctVal.toFixed(1),
      field3: demoLat,
      field4: demoLng
    });
  }
  if (demoFeeds.length) {
    demoFeeds[demoFeeds.length - 1].field1 = demoSag;
    demoFeeds[demoFeeds.length - 1].field2 = demoCT;
  }

  updateChartsWithFeeds(demoFeeds, 'field1', 'field2');
  renderMap(demoLat, demoLng, demoSag, demoCT);

  document.querySelector('.brand span').textContent = 'POWERLINE NODE — DEMO ACTIVE';
  const livePill = document.querySelector('.live-pill');
  livePill.innerHTML = '<div class="dot"></div>DEMO MODE';
  livePill.style.background = "#e9ecef";
  livePill.style.borderColor = "#ced4da";
  hideErr();
}

// Fetch real data from ThingSpeak
async function fetchData() {
  const chId = document.getElementById('chId').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const fSag = document.getElementById('fSag').value;
  const fCT = document.getElementById('fCT').value;
  const fLat = document.getElementById('fLat').value;
  const fLng = document.getElementById('fLng').value;
  if (!chId) { showErr('Please enter ThingSpeak Channel ID.'); return; }
  hideErr();
  const key = apiKey ? `&api_key=${apiKey}` : '';
  try {
    const [lastResp, feedResp] = await Promise.all([
      fetch(`https://api.thingspeak.com/channels/${chId}/feeds/last.json?${key}`).then(r => r.json()),
      fetch(`https://api.thingspeak.com/channels/${chId}/feeds.json?results=20${key}`).then(r => r.json()),
    ]);
    const sag = parseFloat(lastResp[fSag]) ?? null;
    const ct = parseFloat(lastResp[fCT]) ?? null;
    const lat = parseFloat(lastResp[fLat]) || null;
    const lng = parseFloat(lastResp[fLng]) || null;
    const time = lastResp.created_at || null;
    const feeds = feedResp.feeds || [];
    updateCards(sag, ct, time);
    updateTriangle(sag);
    updateChartsWithFeeds(feeds, fSag, fCT);
    if (lat && lng) renderMap(lat, lng, sag, ct);
    document.querySelector('.brand span').textContent = 'POWERLINE NODE — THINGSPEAK';
    const livePill = document.querySelector('.live-pill');
    livePill.innerHTML = '<div class="dot"></div>LIVE';
    livePill.style.background = "#e0f2e9";
    livePill.style.borderColor = "#c0dbc8";
  } catch (e) {
    showErr('Fetch failed: ' + e.message);
  }
}

// UI helpers
function showErr(m) {
  const e = document.getElementById('err');
  if (m) { e.style.display = 'block'; e.textContent = '⚠ ' + m; }
  else e.style.display = 'none';
}
function hideErr() { document.getElementById('err').style.display = 'none'; }

// Auto-load demo on page start
window.addEventListener('DOMContentLoaded', () => {
  loadDemoData();
  // clock updater
  setInterval(() => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  }, 1000);
});
