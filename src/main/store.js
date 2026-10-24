// Penyimpanan JSON sederhana di folder userData (%APPDATA%\Cimol\cimol.json).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  settings: {
    openAtLogin: true,
    locationMode: 'auto', // 'auto' (Windows/IP) | 'manual'
    city: '',
    country: 'Indonesia',
    remindBefore: 10, // menit sebelum waktu sholat
    prayerSound: true,
    adzanFile: '',
    lyricsInPill: true,
    notchVisible: true,
  },
  shelf: [],
};

const MAX_LYRICS_CACHE = 200;

let data = null;
let saveTimer = null;

function file() {
  return path.join(app.getPath('userData'), 'cimol.json');
}

function load() {
  if (data) return data;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    data = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    data = structuredClone(DEFAULTS);
  }
  data.lyricsCache ||= {};
  return data;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  const target = file();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[store] gagal menyimpan:', err);
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  save();
}

function settings() {
  return load().settings;
}

function updateSettings(patch) {
  const d = load();
  d.settings = { ...d.settings, ...patch };
  save();
  return d.settings;
}

function cacheLyrics(key, value) {
  const cache = load().lyricsCache;
  cache[key] = value;
  const keys = Object.keys(cache);
  if (keys.length > MAX_LYRICS_CACHE) {
    for (const k of keys.slice(0, keys.length - MAX_LYRICS_CACHE)) delete cache[k];
  }
  save();
}

function cachedLyrics(key) {
  return load().lyricsCache[key];
}

module.exports = { get, set, settings, updateSettings, cacheLyrics, cachedLyrics, flush };
