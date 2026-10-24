// Tab Timer: hitung mundur bebas dan Pomodoro 25/5.
(() => {
  const { $, api } = C;
  const FOCUS = 25 * 60;
  const BREAK = 5 * 60;

  const t = {
    duration: FOCUS,
    endAt: 0,
    remaining: FOCUS, // dipakai saat berhenti/jeda
    running: false,
    pomodoro: false,
    phase: 'focus',
    cycle: 1,
  };

  function left() {
    return t.running ? Math.max(0, (t.endAt - Date.now()) / 1000) : t.remaining;
  }

  function label() {
    if (!t.pomodoro) return 'Timer';
    return t.phase === 'focus' ? `Fokus · sesi ${t.cycle}` : 'Istirahat';
  }

  C.timer = {
    // Untuk notch kecil: tampil kalau timer sedang jalan atau dijeda di tengah.
    view() {
      const active = t.running || t.remaining < t.duration;
      return { active, running: t.running, label: label(), time: C.mmss(Math.ceil(left())) };
    },
  };

  function setDuration(sec, opts = {}) {
    t.duration = sec;
    t.remaining = sec;
    t.running = false;
    t.pomodoro = !!opts.pomodoro;
    if (!t.pomodoro) {
      t.phase = 'focus';
      t.cycle = 1;
    }
    render();
  }

  function start() {
    if (t.remaining <= 0) t.remaining = t.duration;
    t.endAt = Date.now() + t.remaining * 1000;
    t.running = true;
    render();
  }

  function pause() {
    t.remaining = left();
    t.running = false;
    render();
  }

  function finish() {
    t.running = false;
    t.remaining = 0;
    C.chime();
    if (t.pomodoro) {
      if (t.phase === 'focus') {
        api.notify('Sesi fokus selesai 🎉', 'Istirahat 5 menit dulu.');
        t.phase = 'break';
        t.duration = t.remaining = BREAK;
      } else {
        api.notify('Istirahat selesai', `Lanjut sesi fokus ke-${t.cycle + 1}.`);
        t.phase = 'focus';
        t.cycle += 1;
        t.duration = t.remaining = FOCUS;
      }
      start();
      return;
    }
    api.notify('Timer selesai ⏰', `${C.mmss(t.duration)} sudah berlalu.`);
    t.remaining = t.duration;
    render();
  }

  function render() {
    $('timerMode').textContent = label();
    const el = $('timerTime');
    el.textContent = C.mmss(Math.ceil(left()));
    el.classList.toggle('running', t.running);
    $('timerStart').textContent = t.running ? 'Jeda' : t.remaining < t.duration ? 'Lanjut' : 'Mulai';
    $('pomodoroBtn').classList.toggle('primary', t.pomodoro);
    document.querySelectorAll('#timerPresets .chip').forEach((c) => {
      c.classList.toggle('active', !t.pomodoro && Number(c.dataset.min) * 60 === t.duration);
    });
  }

  $('timerStart').addEventListener('click', () => (t.running ? pause() : start()));
  $('timerReset').addEventListener('click', () => {
    if (t.pomodoro) {
      t.phase = 'focus';
      t.cycle = 1;
      setDuration(FOCUS, { pomodoro: true });
    } else {
      setDuration(t.duration);
    }
  });
  $('timerPresets').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) setDuration(Number(chip.dataset.min) * 60);
  });
  $('timerSet').addEventListener('click', () => {
    const min = Number($('timerCustom').value);
    if (min > 0) setDuration(Math.round(min * 60));
  });
  $('timerCustom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('timerSet').click();
  });
  $('pomodoroBtn').addEventListener('click', () => {
    t.phase = 'focus';
    t.cycle = 1;
    setDuration(FOCUS, { pomodoro: true });
    start();
  });

  C.onTick(() => {
    if (t.running && left() <= 0) finish();
    else if (t.running) render();
  });
  render();
})();
