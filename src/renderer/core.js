// Inti renderer: state bersama, ikon, dan helper. Modul lain menempel ke window.C.
(() => {
  const svg = (body, fill = false) =>
    `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const ICONS = {
    music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    lyrics: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
    timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
    shelf: svg('<path d="M3 7h18v13H3zM3 7l2-4h14l2 4M9 12h6"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    mosque: svg('<path d="M12 2v3M6 21V11a6 6 0 0 1 12 0v10M3 21h18M10 21v-4a2 2 0 0 1 4 0v4"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', true),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', true),
    next: svg('<path d="M5 5.5v13a1 1 0 0 0 1.6.8L15 13v5a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v5L6.6 4.7A1 1 0 0 0 5 5.5z"/>', true),
    prev: svg('<path d="M19 5.5v13a1 1 0 0 1-1.6.8L9 13v5a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5l8.4-6.3a1 1 0 0 1 1.6.8z"/>', true),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>'),
    tomato: svg('<circle cx="12" cy="14" r="7"/><path d="M12 7V4M9 5l3 2 3-2"/>'),
    bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
    cimol: svg('<circle cx="8" cy="14" r="4"/><circle cx="16" cy="14" r="4"/><circle cx="12" cy="8" r="4"/>'),
  };

  const C = {
    api: window.cimol,
    icons: ICONS,
    state: {
      settings: {},
      media: null,
      mediaAt: 0,
      art: null,
      prayer: null,
      adzan: null,
      update: null,
    },
    tickers: [],

    $(id) {
      return document.getElementById(id);
    },

    paintIcons(root = document) {
      root.querySelectorAll('i[data-icon]').forEach((el) => {
        if (!el.firstChild) el.innerHTML = ICONS[el.dataset.icon] || '';
      });
    },

    setIcon(el, name) {
      if (el.dataset.current === name) return;
      el.dataset.current = name;
      el.innerHTML = ICONS[name] || '';
    },

    onTick(fn) {
      this.tickers.push(fn);
    },

    mmss(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = String(sec % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    },

    hhmm(date) {
      return new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    },

    escape(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    },

    // Bunyi pengingat lembut (dipakai kalau user belum memilih file adzan).
    chime() {
      try {
        const ctx = new AudioContext();
        [523.25, 659.25, 783.99].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          const t = ctx.currentTime + i * 0.22;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + 1.3);
        });
        setTimeout(() => ctx.close(), 2500);
      } catch {
        // audio tidak tersedia
      }
    },
  };

  window.C = C;
})();
