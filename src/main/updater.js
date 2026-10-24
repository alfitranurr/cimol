// Auto-update dari GitHub Releases (alfitranurr/cimol).
// Cek saat start lalu tiap 4 jam; update diunduh di belakang layar, lalu user ditanya sebelum dipasang.
const { app, dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let state = { status: 'idle', version: null, progress: 0, error: null };
let listener = () => {};
let manualCheck = false;
let asking = false;

function set(patch) {
  state = { ...state, ...patch };
  listener(state);
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on('click', onClick);
  n.show();
}

function init({ onState }) {
  listener = onState;
  if (!app.isPackaged) {
    set({ status: 'dev' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => {
    set({ status: 'downloading', version: info.version, progress: 0 });
    notify(`Cimol v${info.version} tersedia`, 'Sedang mengunduh update di belakang layar…');
  });
  autoUpdater.on('update-not-available', () => {
    set({ status: 'latest' });
    if (manualCheck) notify('Cimol sudah versi terbaru', `Versi terpasang: v${app.getVersion()}`);
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) => set({ progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version, progress: 100 });
    notify(`Cimol v${info.version} siap dipasang`, 'Klik untuk memasang sekarang.', ask);
    ask();
  });
  autoUpdater.on('error', (err) => {
    set({ status: 'error', error: err?.message || String(err) });
    if (manualCheck) notify('Gagal mengecek update', state.error);
    manualCheck = false;
  });

  setTimeout(() => check(false), 10_000);
  setInterval(() => check(false), CHECK_EVERY_MS);
}

async function check(manual = true) {
  if (!app.isPackaged) {
    if (manual) notify('Mode pengembangan', 'Auto-update hanya aktif di versi yang terpasang.');
    return;
  }
  if (state.status === 'ready') return ask();
  if (state.status === 'checking' || state.status === 'downloading') return;
  manualCheck = manual;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // ditangani oleh event 'error'
  }
}

async function ask() {
  if (state.status !== 'ready' || asking) return;
  asking = true;
  try {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Cimol',
      message: `Cimol v${state.version} siap dipasang`,
      detail: `Versi sekarang v${app.getVersion()}. Cimol akan menutup sebentar, lalu terbuka lagi.`,
      buttons: ['Install sekarang', 'Nanti'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) install();
  } finally {
    asking = false;
  }
}

function install() {
  if (state.status !== 'ready') return;
  app.isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

module.exports = { init, check, ask, install, getState: () => state };
