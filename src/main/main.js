// Cimol: notch di tepi atas Windows.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Notification,
  shell,
  dialog,
  nativeImage,
} = require('electron');
const store = require('./store');
const media = require('./media');
const lyrics = require('./lyrics');
const prayer = require('./prayer');
const updater = require('./updater');
const tray = require('./tray');

const APP_ID = 'com.alfitranurr.cimol';
const WIN_W = 600;
const WIN_H = 340;
const HOVER_MARGIN = 6;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath);

let win = null;
let notchRect = { x: (WIN_W - 240) / 2, y: 0, width: 240, height: 36 };
let hovering = false;
let fullscreenApp = false;
const iconCache = new Map();
// Bridge hanya mengirim cover saat lagu berganti, jadi simpan yang terakhir untuk renderer yang baru dimuat.
const lastMedia = { state: null, art: null };

// ---------- Window ----------

function placeWindow() {
  if (!win) return;
  const { bounds } = screen.getPrimaryDisplay();
  win.setBounds({
    x: Math.round(bounds.x + (bounds.width - WIN_W) / 2),
    y: bounds.y,
    width: WIN_W,
    height: WIN_H,
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Cimol',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  placeWindow();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', applyVisibility);
  win.on('close', (e) => {
    if (!app.isQuitting) e.preventDefault();
  });
  screen.on('display-metrics-changed', placeWindow);
  screen.on('display-added', placeWindow);
  screen.on('display-removed', placeWindow);
}

function applyVisibility() {
  if (!win) return;
  const visible = store.settings().notchVisible && !fullscreenApp;
  if (visible && !win.isVisible()) {
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  } else if (!visible && win.isVisible()) {
    win.hide();
  }
}

// Jendela transparan meneruskan klik ke aplikasi di bawahnya, kecuali saat kursor
// berada di atas notch. Posisi kursor dicek dari main process supaya tetap jalan
// saat user menyeret file (event mouse tidak sampai ke renderer saat drag dari Explorer).
function watchCursor() {
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const r = notchRect;
    const inside =
      p.x >= b.x + r.x - HOVER_MARGIN &&
      p.x <= b.x + r.x + r.width + HOVER_MARGIN &&
      p.y >= b.y + r.y - HOVER_MARGIN &&
      p.y <= b.y + r.y + r.height + HOVER_MARGIN;
    if (inside === hovering) return;
    hovering = inside;
    win.setIgnoreMouseEvents(!inside, { forward: true });
    win.webContents.send('notch:hover', inside);
  }, 50);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

// ---------- Rak file ----------

async function shelfItems() {
  const items = [];
  for (const p of store.get('shelf')) {
    const exists = fs.existsSync(p);
    let icon = iconCache.get(p);
    if (!icon && exists) {
      try {
        icon = await app.getFileIcon(p, { size: 'normal' });
        iconCache.set(p, icon);
      } catch {
        icon = null;
      }
    }
    items.push({ path: p, name: path.basename(p), exists, icon: icon ? icon.toDataURL() : null });
  }
  return items;
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.on('notch:rect', (_e, rect) => {
    if (rect && rect.width > 0) notchRect = rect;
  });

  ipcMain.handle('media:get', () => lastMedia);
  ipcMain.on('media:command', (_e, cmd) => {
    if (/^(toggle|play|pause|next|prev|seek [\d.]+)$/.test(cmd)) media.command(cmd);
  });

  ipcMain.handle('lyrics:get', async (_e, track) => {
    try {
      return await lyrics.get(track);
    } catch (err) {
      return { found: false, error: err.message };
    }
  });

  ipcMain.handle('prayer:get', () => prayer.getState());
  ipcMain.handle('prayer:refresh', () => prayer.refresh());

  ipcMain.handle('shelf:list', shelfItems);
  ipcMain.handle('shelf:add', (_e, paths) => {
    const shelf = store.get('shelf').filter((p) => !paths.includes(p));
    store.set('shelf', [...paths.filter((p) => typeof p === 'string' && p), ...shelf].slice(0, 30));
    return shelfItems();
  });
  ipcMain.handle('shelf:remove', (_e, p) => {
    store.set('shelf', store.get('shelf').filter((x) => x !== p));
    iconCache.delete(p);
    return shelfItems();
  });
  ipcMain.handle('shelf:clear', () => {
    store.set('shelf', []);
    iconCache.clear();
    return [];
  });
  ipcMain.handle('shelf:open', (_e, p) => store.get('shelf').includes(p) && shell.openPath(p));
  ipcMain.handle('shelf:reveal', (_e, p) => store.get('shelf').includes(p) && shell.showItemInFolder(p));
  ipcMain.on('shelf:drag', (e, p) => {
    if (!store.get('shelf').includes(p) || !fs.existsSync(p)) return;
    const icon = iconCache.get(p) || nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
    e.sender.startDrag({ file: p, icon });
  });

  ipcMain.handle('settings:get', () => store.settings());
  ipcMain.handle('settings:set', (_e, patch) => {
    const before = store.settings();
    const next = store.updateSettings(patch);
    if ('openAtLogin' in patch) setOpenAtLogin(next.openAtLogin);
    if ('notchVisible' in patch) applyVisibility();
    if (
      before.locationMode !== next.locationMode ||
      before.city !== next.city ||
      before.country !== next.country
    ) {
      prayer.refresh();
    }
    tray.refresh();
    return next;
  });
  ipcMain.handle('settings:pickSound', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Pilih suara adzan',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    });
    if (r.canceled || !r.filePaths[0]) return store.settings();
    return store.updateSettings({ adzanFile: r.filePaths[0] });
  });
  ipcMain.handle('settings:soundUrl', () => {
    const f = store.settings().adzanFile;
    return f && fs.existsSync(f) ? pathToFileURL(f).href : null;
  });

  ipcMain.handle('update:get', () => updater.getState());
  ipcMain.handle('update:check', () => updater.check(true));
  ipcMain.handle('update:install', () => updater.install());

  ipcMain.on('notify', (_e, { title, body }) => notify(String(title), String(body || '')));
  ipcMain.on('open-external', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
}

// ---------- Lain-lain ----------

function setOpenAtLogin(enabled) {
  store.updateSettings({ openAtLogin: enabled });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled });
  tray.refresh();
}

function toggleNotch() {
  store.updateSettings({ notchVisible: !store.settings().notchVisible });
  applyVisibility();
  tray.refresh();
}

function quit() {
  app.isQuitting = true;
  app.quit();
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  watchCursor();

  // Sinkronkan setiap start supaya path di registry ikut benar setelah update/instal ulang.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: store.settings().openAtLogin });

  tray.create({
    toggleNotch,
    checkUpdate: () => updater.check(true),
    installUpdate: () => updater.install(),
    updateState: () => updater.getState(),
    settings: () => store.settings(),
    setOpenAtLogin,
    refreshPrayer: () => prayer.refresh(),
    quit,
  });

  media.start((msg) => {
    if (msg.type === 'media') {
      lastMedia.state = msg;
      send('media:state', msg);
    } else if (msg.type === 'art') {
      lastMedia.art = msg;
      send('media:art', msg);
    }
    else if (msg.type === 'fullscreen') {
      fullscreenApp = !!msg.value;
      applyVisibility();
    } else if (msg.type === 'error') console.error('[media]', msg.message);
  });

  prayer.start({
    onState: (s) => send('prayer:state', s),
    onAdzanTime: (p) => send('prayer:adzan', p),
  });

  updater.init({
    onState: (s) => {
      send('update:state', s);
      tray.refresh();
    },
  });
});

app.on('second-instance', () => {
  if (!store.settings().notchVisible) toggleNotch();
  send('notch:reveal');
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  app.isQuitting = true;
  media.stop();
  prayer.stop();
  store.flush();
});
