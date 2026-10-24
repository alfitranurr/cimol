// Waktu sholat real-time berdasarkan lokasi.
// Lokasi: Windows Location Service → IP geolocation → kota manual.
// Jadwal: api.aladhan.com metode 20 (Kemenag RI).
const { app, net, Notification, powerMonitor } = require('electron');
const { execFile } = require('child_process');
const store = require('./store');
const { helperPath } = require('./helpers-path');

const PRAYERS = [
  { key: 'Imsak', name: 'Imsak', notify: false },
  { key: 'Fajr', name: 'Subuh', notify: true },
  { key: 'Sunrise', name: 'Terbit', notify: false },
  { key: 'Dhuhr', name: 'Dzuhur', notify: true },
  { key: 'Asr', name: 'Ashar', notify: true },
  { key: 'Maghrib', name: 'Maghrib', notify: true },
  { key: 'Isha', name: 'Isya', notify: true },
];
const ADZAN_WINDOW_MS = 5 * 60 * 1000;

let state = { status: 'idle' };
let listener = () => {};
let onAdzan = () => {};
let tickTimer = null;
let fetchedFor = null;
let refreshing = null;
const notified = new Set();
const startedAt = new Date();

async function getJSON(url) {
  const res = await net.fetch(url, {
    headers: { 'User-Agent': `Cimol/${app.getVersion()} (https://github.com/alfitranurr/cimol)` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`);
  return res.json();
}

function windowsLocation() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath('location.ps1')],
      { windowsHide: true, timeout: 25000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const r = JSON.parse(stdout.trim());
          resolve(r.ok ? { lat: r.lat, lon: r.lon } : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function placeName(lat, lon) {
  try {
    const r = await getJSON(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=id&lat=${lat}&lon=${lon}`
    );
    const a = r.address || {};
    return a.city || a.town || a.county || a.state_district || a.state || null;
  } catch {
    return null;
  }
}

async function ipLocation() {
  try {
    const r = await getJSON('https://ipapi.co/json/');
    if (r.latitude) return { lat: r.latitude, lon: r.longitude, name: r.city || r.region };
  } catch {
    // coba layanan cadangan
  }
  const r = await getJSON('https://ipwho.is/');
  if (!r.success) throw new Error('Lokasi dari IP tidak tersedia');
  return { lat: r.latitude, lon: r.longitude, name: r.city || r.region };
}

async function resolveLocation() {
  const s = store.settings();
  if (s.locationMode === 'manual' && s.city) {
    return { manual: true, city: s.city, country: s.country || 'Indonesia', name: s.city, source: 'manual' };
  }
  const win = await windowsLocation();
  if (win) return { ...win, name: (await placeName(win.lat, win.lon)) || 'Lokasi Windows', source: 'windows' };
  const ip = await ipLocation();
  return { ...ip, name: ip.name || 'Perkiraan IP', source: 'ip' };
}

function dmy(d) {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchDay(loc, date) {
  const base = loc.manual
    ? `https://api.aladhan.com/v1/timingsByCity/${dmy(date)}?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}`
    : `https://api.aladhan.com/v1/timings/${dmy(date)}?latitude=${loc.lat}&longitude=${loc.lon}`;
  const r = await getJSON(`${base}&method=20&iso8601=true`);
  const d = r.data;
  const times = {};
  for (const p of PRAYERS) times[p.key] = d.timings[p.key];
  const h = d.date.hijri;
  return {
    date: ymd(date),
    times,
    timezone: d.meta.timezone,
    hijri: `${h.day} ${h.month.en} ${h.year} H`,
    lat: d.meta.latitude,
    lon: d.meta.longitude,
  };
}

function emit() {
  listener(state);
}

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    state = { ...state, status: 'loading' };
    emit();
    try {
      const loc = await resolveLocation();
      const today = new Date();
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const days = await Promise.all([fetchDay(loc, today), fetchDay(loc, tomorrow)]);
      state = {
        status: 'ok',
        location: { name: loc.name, source: loc.source, lat: days[0].lat, lon: days[0].lon },
        timezone: days[0].timezone,
        hijri: days[0].hijri,
        days,
        prayers: PRAYERS,
        updatedAt: Date.now(),
      };
      fetchedFor = ymd(today);
    } catch (err) {
      state = { ...state, status: 'error', error: err.message };
      fetchedFor = null;
    } finally {
      refreshing = null;
    }
    emit();
    tick();
  })();
  return refreshing;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
}

function hhmm(date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function tick() {
  const now = new Date();
  if (state.status !== 'loading' && fetchedFor !== ymd(now)) {
    refresh();
    return;
  }
  if (state.status !== 'ok') return;

  const before = (Number(store.settings().remindBefore) || 0) * 60 * 1000;
  for (const day of state.days) {
    for (const p of PRAYERS) {
      if (!p.notify) continue;
      const at = new Date(day.times[p.key]);
      const key = `${day.date}:${p.key}`;
      const diff = at - now;
      if (before > 0 && diff > 0 && diff <= before && !notified.has(`${key}:pre`)) {
        notified.add(`${key}:pre`);
        notify(`${Math.ceil(diff / 60000)} menit lagi ${p.name}`, `Masuk waktu ${p.name} pukul ${hhmm(at)}`);
      }
      // Jangan beri notifikasi untuk waktu yang sudah lewat sebelum Cimol dibuka.
      if (diff <= 0 && -diff < ADZAN_WINDOW_MS && at >= startedAt && !notified.has(key)) {
        notified.add(key);
        notified.add(`${key}:pre`);
        notify(`Waktunya sholat ${p.name}`, `${hhmm(at)} · ${state.location.name}`);
        onAdzan({ name: p.name, at: at.toISOString() });
      }
    }
  }
}

function start({ onState, onAdzanTime }) {
  listener = onState;
  onAdzan = onAdzanTime;
  refresh();
  tickTimer = setInterval(tick, 15000);
  powerMonitor.on('resume', () => setTimeout(refresh, 5000));
}

function stop() {
  clearInterval(tickTimer);
}

module.exports = { start, stop, refresh, getState: () => state };
