// Tab Lirik: lirik tersinkron dari lrclib.net.
(() => {
  const { $, api, state } = C;
  const box = $('lyrics');
  let current = { key: '', data: null, loading: false };
  let activeIdx = -1;

  C.lyrics = {
    // Baris yang sedang dinyanyikan (untuk ditampilkan di notch kecil).
    currentLine() {
      const lines = current.data && current.data.synced;
      if (!lines || activeIdx < 0) return '';
      return lines[activeIdx].text || '♪';
    },
    hasSynced() {
      return !!(current.data && current.data.synced && current.data.synced.length);
    },
  };

  function message(text) {
    box.innerHTML = `<p class="empty">${C.escape(text)}</p>`;
  }

  function renderLines() {
    activeIdx = -1;
    const d = current.data;
    if (current.loading) return message('Mencari lirik…');
    if (!current.key) return message('Putar lagu untuk melihat lirik.');
    if (!d || !d.found) return message(d && d.error ? 'Lirik tidak bisa dimuat (cek koneksi).' : 'Lirik tidak ditemukan untuk lagu ini.');
    if (d.instrumental) return message('♪ Instrumental ♪');
    if (d.synced && d.synced.length) {
      box.innerHTML = d.synced
        .map((l, i) => `<div class="line" data-i="${i}">${C.escape(l.text) || '♪'}</div>`)
        .join('');
      box.scrollTop = 0;
      return;
    }
    box.innerHTML = `<p class="plain">${C.escape(d.plain || '')}</p>`;
  }

  async function load() {
    const m = state.media;
    const key = C.music.trackKey();
    if (key === current.key) return;
    current = { key, data: null, loading: !!key };
    renderLines();
    if (!key || !m.title) {
      current.loading = false;
      return renderLines();
    }
    const data = await api.lyrics.get({ title: m.title, artist: m.artist, album: m.album, duration: m.duration });
    if (current.key !== key) return; // lagu sudah ganti
    current = { key, data, loading: false };
    renderLines();
  }

  function sync() {
    const lines = current.data && current.data.synced;
    if (!lines || !lines.length) return;
    const pos = C.music.position() + 0.25;
    let idx = -1;
    for (let i = 0; i < lines.length && lines[i].t <= pos; i++) idx = i;
    if (idx === activeIdx) return;
    activeIdx = idx;
    const nodes = box.children;
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('active', i === idx);
      nodes[i].classList.toggle('past', i < idx);
    }
    const el = nodes[idx];
    if (el && box.offsetParent) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }

  box.addEventListener('click', (e) => {
    const line = e.target.closest('.line');
    if (!line || !current.data || !current.data.synced) return;
    const t = current.data.synced[Number(line.dataset.i)].t;
    api.media.command(`seek ${Math.max(0, t).toFixed(2)}`);
  });

  document.addEventListener('track-change', load);
  document.addEventListener('tab-change', (e) => {
    if (e.detail === 'lyrics') {
      activeIdx = -1;
      sync();
    }
  });
  C.onTick(sync);
  // Lagu bisa sudah terdeteksi sebelum skrip ini dimuat.
  load();
})();
