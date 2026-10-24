// Ikon Cimol di system tray.
const path = require('path');
const { app, Tray, Menu, nativeImage, shell } = require('electron');

let tray = null;
let actions = null;

function create(handlers) {
  actions = handlers;
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip(`Cimol v${app.getVersion()}`);
  tray.on('click', () => actions.toggleNotch());
  refresh();
  return tray;
}

function updateLabel(u) {
  switch (u.status) {
    case 'checking':
      return 'Mengecek update…';
    case 'downloading':
      return `Mengunduh v${u.version} (${u.progress || 0}%)`;
    case 'ready':
      return `Pasang update v${u.version} & restart`;
    default:
      return 'Cek update';
  }
}

function refresh() {
  if (!tray) return;
  const u = actions.updateState();
  const s = actions.settings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Cimol v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: s.notchVisible ? 'Sembunyikan notch' : 'Tampilkan notch', click: () => actions.toggleNotch() },
      {
        label: updateLabel(u),
        enabled: u.status !== 'checking' && u.status !== 'downloading',
        click: () => (u.status === 'ready' ? actions.installUpdate() : actions.checkUpdate()),
      },
      {
        label: 'Mulai bersama Windows',
        type: 'checkbox',
        checked: s.openAtLogin,
        click: (item) => actions.setOpenAtLogin(item.checked),
      },
      { label: 'Muat ulang waktu sholat', click: () => actions.refreshPrayer() },
      { type: 'separator' },
      { label: 'Buka folder data', click: () => shell.openPath(app.getPath('userData')) },
      { label: 'Halaman GitHub', click: () => shell.openExternal('https://github.com/alfitranurr/cimol') },
      { type: 'separator' },
      { label: 'Keluar', click: () => actions.quit() },
    ])
  );
}

module.exports = { create, refresh };
