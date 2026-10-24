// API aman yang diberikan ke renderer (contextIsolation aktif).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

function on(channel) {
  return (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

contextBridge.exposeInMainWorld('cimol', {
  version: () => ipcRenderer.invoke('app:version'),
  notch: {
    reportRect: (rect) => ipcRenderer.send('notch:rect', rect),
    onHover: on('notch:hover'),
    onReveal: on('notch:reveal'),
  },
  media: {
    get: () => ipcRenderer.invoke('media:get'),
    onState: on('media:state'),
    onArt: on('media:art'),
    command: (cmd) => ipcRenderer.send('media:command', cmd),
  },
  lyrics: {
    get: (track) => ipcRenderer.invoke('lyrics:get', track),
  },
  prayer: {
    get: () => ipcRenderer.invoke('prayer:get'),
    refresh: () => ipcRenderer.invoke('prayer:refresh'),
    onState: on('prayer:state'),
    onAdzan: on('prayer:adzan'),
  },
  shelf: {
    list: () => ipcRenderer.invoke('shelf:list'),
    add: (paths) => ipcRenderer.invoke('shelf:add', paths),
    remove: (p) => ipcRenderer.invoke('shelf:remove', p),
    clear: () => ipcRenderer.invoke('shelf:clear'),
    open: (p) => ipcRenderer.invoke('shelf:open', p),
    reveal: (p) => ipcRenderer.invoke('shelf:reveal', p),
    drag: (p) => ipcRenderer.send('shelf:drag', p),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickSound: () => ipcRenderer.invoke('settings:pickSound'),
    soundUrl: () => ipcRenderer.invoke('settings:soundUrl'),
  },
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onState: on('update:state'),
  },
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
