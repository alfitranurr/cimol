// Tab Pengaturan + status update.
(() => {
  const { $, api, state } = C;

  function render() {
    const s = state.settings;
    $('setLogin').checked = !!s.openAtLogin;
    $('setLyricsPill').checked = !!s.lyricsInPill;
    $('setSound').checked = !!s.prayerSound;
    $('setRemind').value = s.remindBefore ?? 10;
    $('setSoundName').textContent = s.adzanFile ? s.adzanFile.split(/[\\/]/).pop() : 'Bunyi bawaan';
    $('setSoundName').title = s.adzanFile || '';
    document.querySelectorAll('#setLocMode button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === s.locationMode);
    });
    $('manualLoc').classList.toggle('show', s.locationMode === 'manual');
    if (document.activeElement !== $('setCity')) $('setCity').value = s.city || '';
    if (document.activeElement !== $('setCountry')) $('setCountry').value = s.country || 'Indonesia';
  }

  async function save(patch) {
    state.settings = await api.settings.set(patch);
    render();
  }

  function renderUpdate() {
    const u = state.update || {};
    const text = {
      dev: 'Mode pengembangan: auto-update nonaktif',
      idle: 'Auto-update aktif',
      checking: 'Mengecek update…',
      latest: 'Sudah versi terbaru',
      downloading: `Mengunduh v${u.version} · ${u.progress || 0}%`,
      ready: `v${u.version} siap dipasang`,
      error: `Gagal cek update: ${u.error || ''}`,
    }[u.status || 'idle'];
    $('updateText').textContent = text;
    $('updateBtn').textContent = u.status === 'ready' ? 'Install & restart' : 'Cek update';
    $('updateBtn').disabled = u.status === 'checking' || u.status === 'downloading';
    $('updateDot').hidden = u.status !== 'ready';
  }

  $('setLogin').addEventListener('change', (e) => save({ openAtLogin: e.target.checked }));
  $('setLyricsPill').addEventListener('change', (e) => save({ lyricsInPill: e.target.checked }));
  $('setSound').addEventListener('change', (e) => save({ prayerSound: e.target.checked }));
  $('setRemind').addEventListener('change', (e) => {
    const v = Math.min(60, Math.max(0, Math.round(Number(e.target.value) || 0)));
    save({ remindBefore: v });
  });
  $('setSoundPick').addEventListener('click', async () => {
    state.settings = await api.settings.pickSound();
    render();
  });
  $('setLocMode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode === 'manual' && !state.settings.city) {
      state.settings.locationMode = 'manual';
      render();
      $('setCity').focus();
      return;
    }
    save({ locationMode: b.dataset.mode });
  });
  $('setLocSave').addEventListener('click', () => {
    const city = $('setCity').value.trim();
    if (!city) return $('setCity').focus();
    save({ locationMode: 'manual', city, country: $('setCountry').value.trim() || 'Indonesia' });
  });
  $('setCity').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('setLocSave').click();
  });

  $('updateBtn').addEventListener('click', () => {
    if (state.update && state.update.status === 'ready') api.update.install();
    else api.update.check();
  });
  $('githubLink').addEventListener('click', () => api.openExternal('https://github.com/alfitranurr/cimol'));

  api.update.onState((u) => {
    state.update = u;
    renderUpdate();
  });

  C.settings = { render };

  Promise.all([api.settings.get(), api.update.get(), api.version()]).then(([s, u, v]) => {
    state.settings = s;
    state.update = u;
    $('appVersion').textContent = `v${v}`;
    render();
    renderUpdate();
  });
})();
