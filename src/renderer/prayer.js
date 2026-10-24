// Tab Sholat: jadwal hari ini, sholat berikutnya, dan bunyi saat masuk waktu.
(() => {
  const { $, api, state } = C;
  const SOURCE = { windows: 'Lokasi Windows', ip: 'Perkiraan dari IP', manual: 'Kota manual' };

  // Semua waktu (hari ini + besok) yang wajib dinotifikasi, urut waktu.
  function upcoming() {
    const p = state.prayer;
    if (!p || !p.days) return [];
    const list = [];
    for (const day of p.days) {
      for (const pr of p.prayers) {
        if (pr.notify) list.push({ name: pr.name, key: pr.key, at: new Date(day.times[pr.key]) });
      }
    }
    return list.sort((a, b) => a.at - b.at);
  }

  C.prayer = {
    next() {
      const now = Date.now();
      const n = upcoming().find((x) => x.at > now);
      return n ? { ...n, diff: n.at - now } : null;
    },
  };

  function countdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}j ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  C.prayer.countdown = countdown;

  function render() {
    const p = state.prayer;
    const list = $('prayerList');
    if (!p || p.status === 'idle' || (p.status === 'loading' && !p.days)) {
      $('prayerLoc').textContent = 'Mencari lokasi…';
      $('prayerSub').textContent = '';
      list.innerHTML = '';
      return;
    }
    if (p.status === 'error' && !p.days) {
      $('prayerLoc').textContent = 'Jadwal belum tersedia';
      $('prayerSub').textContent = '';
      list.innerHTML = `<div class="prayer-error">${C.escape(p.error || 'Gagal memuat')}. Cek koneksi atau atur kota manual di Pengaturan.</div>`;
      return;
    }
    $('prayerLoc').textContent = p.location.name;
    $('prayerSub').textContent = `${p.hijri} · ${SOURCE[p.location.source] || ''} · Kemenag RI`;

    const today = p.days[0];
    const now = Date.now();
    const next = C.prayer.next();
    list.innerHTML = p.prayers
      .map((pr) => {
        const at = new Date(today.times[pr.key]);
        const cls = [
          'pt',
          pr.notify ? '' : 'minor',
          at < now ? 'past' : '',
          next && next.key === pr.key && next.at.getTime() === at.getTime() ? 'next' : '',
        ].join(' ');
        return `<div class="${cls}"><span class="pt-name">${pr.name}</span><span class="pt-time">${C.hhmm(at)}</span></div>`;
      })
      .join('');
    renderNext();
  }

  function renderNext() {
    const next = C.prayer.next();
    $('prayerNextLabel').textContent = next ? `Menuju ${next.name}` : '';
    $('prayerNextTime').textContent = next ? countdown(next.diff) : '';
  }

  async function playAdzan() {
    if (!state.settings.prayerSound) return;
    const url = await api.settings.soundUrl();
    if (!url) return C.chime();
    const audio = new Audio(url);
    audio.volume = 0.8;
    audio.play().catch(() => C.chime());
  }

  api.prayer.onState((s) => {
    state.prayer = s;
    render();
  });

  api.prayer.onAdzan((p) => {
    state.adzan = { ...p, shownAt: Date.now() };
    playAdzan();
  });

  $('prayerRefresh').addEventListener('click', () => api.prayer.refresh());

  let lastMinute = -1;
  C.onTick(() => {
    renderNext();
    const minute = new Date().getMinutes();
    if (minute !== lastMinute) {
      lastMinute = minute;
      render();
    }
  });

  api.prayer.get().then((s) => {
    state.prayer = s;
    render();
  });
})();
