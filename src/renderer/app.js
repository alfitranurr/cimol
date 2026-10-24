// Notch: buka/tutup saat di-hover, tab, dan isi notch kecil (pill).
(() => {
  const { $, api, state } = C;
  const notch = $('notch');
  const COLLAPSE_DELAY = 380;
  const ADZAN_HIGHLIGHT_MS = 60 * 1000;

  let open = false;
  let tab = 'music';
  let collapseTimer = null;

  // ---------- Buka/tutup ----------

  function reportRect() {
    const r = notch.getBoundingClientRect();
    api.notch.reportRect({ x: r.left, y: r.top, width: r.width, height: r.height });
  }

  function setOpen(value) {
    if (open === value) return;
    open = value;
    notch.classList.toggle('open', open);
    if (open) document.dispatchEvent(new CustomEvent('tab-change', { detail: tab }));
    // Saat membuka, langsung laporkan ukuran penuh supaya kursor tidak "jatuh" keluar
    // di tengah animasi. Saat menutup, ResizeObserver akan melaporkan ukuran akhirnya.
    if (open) {
      const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--open-w'));
      const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--open-h'));
      api.notch.reportRect({ x: (window.innerWidth - w) / 2, y: 0, width: w, height: h });
    }
  }

  function selectTab(name) {
    tab = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
    document.dispatchEvent(new CustomEvent('tab-change', { detail: name }));
  }

  C.app = {
    expand(name) {
      clearTimeout(collapseTimer);
      if (name && name !== tab) selectTab(name);
      setOpen(true);
    },
  };

  api.notch.onHover((inside) => {
    clearTimeout(collapseTimer);
    if (inside) setOpen(true);
    else collapseTimer = setTimeout(() => setOpen(false), COLLAPSE_DELAY);
  });

  api.notch.onReveal(() => {
    C.app.expand();
    collapseTimer = setTimeout(() => setOpen(false), 2500);
  });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) selectTab(b.dataset.tab);
  });

  new ResizeObserver(reportRect).observe(notch);
  notch.addEventListener('transitionend', reportRect);

  // ---------- Pill ----------

  const pillArt = $('pillArt');
  const pillIcon = $('pillIcon');
  const pillText = $('pillText');
  const pillRight = $('pillRight');
  let rightKind = '';

  function eqHtml(playing) {
    return `<span class="eq${playing ? '' : ' paused'}"><span></span><span></span><span></span></span>`;
  }

  function setRight(kind, value) {
    if (kind === 'eq') {
      const k = `eq:${value}`;
      if (rightKind !== k) {
        pillRight.innerHTML = eqHtml(value);
        rightKind = k;
      }
      return;
    }
    rightKind = 'text';
    if (pillRight.textContent !== value) pillRight.textContent = value;
  }

  function setLeft({ art, icon }) {
    if (art) {
      if (pillArt.getAttribute('src') !== art) pillArt.src = art;
      pillArt.hidden = false;
      pillIcon.hidden = true;
    } else {
      pillArt.hidden = true;
      pillIcon.hidden = false;
      C.setIcon(pillIcon, icon || 'cimol');
    }
  }

  function renderPill() {
    const now = Date.now();
    const s = state.settings || {};
    let alert = false;

    const adzan = state.adzan && now - state.adzan.shownAt < ADZAN_HIGHLIGHT_MS ? state.adzan : null;
    const timer = C.timer.view();
    const next = C.prayer.next();
    const remindMs = (Number(s.remindBefore) || 0) * 60 * 1000;
    const m = state.media;
    const hasMedia = m && m.active && (m.title || m.artist);

    if (adzan) {
      alert = true;
      setLeft({ icon: 'mosque' });
      pillText.textContent = `Waktunya sholat ${adzan.name}`;
      setRight('text', C.hhmm(adzan.at));
    } else if (timer.active) {
      setLeft({ icon: 'timer' });
      pillText.textContent = timer.running ? timer.label : `${timer.label} · dijeda`;
      setRight('text', timer.time);
    } else if (next && remindMs && next.diff <= remindMs) {
      setLeft({ icon: 'mosque' });
      pillText.textContent = `${next.name} sebentar lagi`;
      setRight('text', `−${C.prayer.countdown(next.diff)}`);
    } else if (hasMedia) {
      const playing = C.music.isPlaying();
      setLeft({ art: state.art, icon: 'music' });
      const line = s.lyricsInPill && playing && C.lyrics.hasSynced() ? C.lyrics.currentLine() : '';
      pillText.textContent = line || [m.title, m.artist].filter(Boolean).join(' · ');
      setRight('eq', playing);
    } else if (next) {
      setLeft({ icon: 'moon' });
      pillText.textContent = `${next.name} ${C.hhmm(next.at)}`;
      setRight('text', C.hhmm(now));
    } else {
      setLeft({ icon: 'cimol' });
      pillText.textContent = 'Cimol';
      setRight('text', C.hhmm(now));
    }
    notch.classList.toggle('alert', alert && !open);
  }

  // ---------- Loop ----------

  function loop() {
    for (const fn of C.tickers) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
    renderPill();
  }

  C.paintIcons();
  selectTab('music');
  reportRect();
  loop();
  setInterval(loop, 250);
})();
