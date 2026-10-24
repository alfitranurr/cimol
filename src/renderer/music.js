// Tab Musik: info lagu dari sesi media Windows + kontrol.
(() => {
  const { $, api, state } = C;

  const APP_NAMES = [
    [/spotify/i, 'Spotify'],
    [/chrome/i, 'Chrome'],
    [/msedge|edge/i, 'Edge'],
    [/firefox/i, 'Firefox'],
    [/brave/i, 'Brave'],
    [/opera/i, 'Opera'],
    [/zunemusic|music\.ui|media\s*player/i, 'Media Player'],
    [/vlc/i, 'VLC'],
    [/youtube/i, 'YouTube Music'],
    [/apple/i, 'Apple Music'],
  ];

  function appName(id = '') {
    const hit = APP_NAMES.find(([re]) => re.test(id));
    return hit ? hit[1] : id.replace(/\.exe$/i, '').split(/[!\\]/).pop() || 'Media';
  }

  C.music = {
    isPlaying() {
      return !!(state.media && state.media.active && state.media.status === 'Playing');
    },
    // Posisi diperkirakan di antara laporan dari bridge supaya lirik dan progress bergerak halus.
    position() {
      const m = state.media;
      if (!m || !m.active) return 0;
      let pos = m.position || 0;
      if (m.status === 'Playing') pos += (Date.now() - state.mediaAt) / 1000;
      return m.duration ? Math.min(pos, m.duration) : pos;
    },
    trackKey() {
      const m = state.media;
      return m && m.active ? `${m.title}|${m.artist}` : '';
    },
    appName,
  };

  function render() {
    const m = state.media;
    const active = m && m.active && (m.title || m.artist);
    $('musicApp').textContent = active ? appName(m.app) : 'Tidak ada media';
    $('musicTitle').textContent = active ? m.title || 'Tanpa judul' : 'Putar lagu di Spotify atau YouTube';
    $('musicArtist').textContent = active ? m.artist || '' : 'Cimol akan menampilkannya di sini';
    C.setIcon($('playBtn').querySelector('i'), C.music.isPlaying() ? 'pause' : 'play');
    const cover = $('cover');
    if (active && state.art) {
      cover.style.backgroundImage = `url("${state.art}")`;
      cover.classList.add('has-art');
    } else {
      cover.style.backgroundImage = '';
      cover.classList.remove('has-art');
    }
  }

  function renderProgress() {
    const m = state.media;
    const dur = (m && m.duration) || 0;
    const pos = C.music.position();
    $('progressFill').style.width = dur ? `${(pos / dur) * 100}%` : '0%';
    $('timeNow').textContent = C.mmss(pos);
    $('timeEnd').textContent = C.mmss(dur);
  }

  function applyState(m) {
    const changed = C.music.trackKey() !== (m.active ? `${m.title}|${m.artist}` : '');
    state.media = m;
    state.mediaAt = Date.now();
    if (changed) state.art = null;
    render();
    if (changed) document.dispatchEvent(new CustomEvent('track-change'));
  }

  function applyArt(a) {
    if (a.key === C.music.trackKey()) {
      state.art = a.data;
      render();
    }
  }

  api.media.onState(applyState);
  api.media.onArt(applyArt);
  api.media.get().then(({ state: m, art }) => {
    if (m && !state.media) applyState(m);
    if (art && !state.art) applyArt(art);
  });

  document.querySelectorAll('[data-cmd]').forEach((b) =>
    b.addEventListener('click', () => {
      api.media.command(b.dataset.cmd);
      if (b.dataset.cmd === 'toggle' && state.media) {
        state.media.position = C.music.position();
        state.mediaAt = Date.now();
        state.media.status = state.media.status === 'Playing' ? 'Paused' : 'Playing';
        render();
      }
    })
  );

  $('progress').addEventListener('click', (e) => {
    const m = state.media;
    if (!m || !m.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sec = ((e.clientX - r.left) / r.width) * m.duration;
    api.media.command(`seek ${sec.toFixed(1)}`);
  });

  C.onTick(renderProgress);
  render();
})();
