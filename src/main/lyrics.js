// Lirik dari lrclib.net (gratis, tanpa API key). Hasil di-cache per lagu.
const { app, net } = require('electron');
const store = require('./store');

const API = 'https://lrclib.net/api';
const NOISE = /\s*[([][^)\]]*(official|lyrics?|video|audio|visualizer|music video|mv|hd|4k|remaster(ed)?|live)[^)\]]*[)\]]/gi;

// Judul dari YouTube biasanya "Artis - Lagu (Official Video)" dengan artist = nama channel.
function clean({ title = '', artist = '' }) {
  let t = title.replace(NOISE, '').trim();
  let a = artist.replace(/\s*-\s*Topic$/i, '').trim();
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash && (!a || /vevo|official|records|music/i.test(a) || dash[1].toLowerCase().includes(a.toLowerCase()))) {
    a = dash[1].trim();
    t = dash[2].trim();
  }
  t = t.replace(/\s*[|｜].*$/, '').replace(/\s+(ft|feat)\.?\s.*$/i, '').trim();
  return { title: t, artist: a };
}

function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return lines.sort((x, y) => x.t - y.t);
}

async function request(path) {
  const res = await net.fetch(`${API}${path}`, {
    headers: { 'User-Agent': `Cimol/${app.getVersion()} (https://github.com/alfitranurr/cimol)` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lrclib HTTP ${res.status}`);
  return res.json();
}

function toResult(rec) {
  if (!rec) return { found: false };
  return {
    found: true,
    instrumental: !!rec.instrumental,
    synced: rec.syncedLyrics ? parseLrc(rec.syncedLyrics) : null,
    plain: rec.plainLyrics || null,
  };
}

async function get(track) {
  const { title, artist } = clean(track);
  if (!title) return { found: false };
  const key = `${artist}|${title}`.toLowerCase();
  const cached = store.cachedLyrics(key);
  if (cached) return cached;

  const duration = Math.round(track.duration || 0);
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (track.album) q.set('album_name', track.album);
  if (duration) q.set('duration', String(duration));

  let rec = await request(`/get?${q}`);
  if (!rec || !rec.syncedLyrics) {
    const sq = new URLSearchParams({ track_name: title });
    if (artist) sq.set('artist_name', artist);
    const list = (await request(`/search?${sq}`)) || [];
    const close = (r) => !duration || Math.abs((r.duration || 0) - duration) <= 4;
    rec = list.find((r) => r.syncedLyrics && close(r)) || list.find((r) => r.syncedLyrics) || rec || list[0] || null;
  }

  const result = toResult(rec);
  store.cacheLyrics(key, result);
  return result;
}

module.exports = { get, clean, parseLrc };
