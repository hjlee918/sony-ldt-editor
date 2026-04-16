import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('projector', {
  connect: (ip: string, password?: string) =>
    ipcRenderer.invoke('projector:connect', ip, password),
  disconnect: () => ipcRenderer.invoke('projector:disconnect'),
  getStatus: () => ipcRenderer.invoke('projector:getStatus'),
  set: (upper: number, lower: number, value: number) =>
    ipcRenderer.invoke('projector:set', upper, lower, value),
  upload: (slot: number, channels: [number[], number[], number[]]) =>
    ipcRenderer.invoke('projector:upload', slot, channels),
  on: (event: 'upload-progress', cb: (data: unknown) => void): (() => void) => {
    const channel = `projector:${event}`;
    const listener = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});

contextBridge.exposeInMainWorld('canvasBridge', {
  detach: () => ipcRenderer.invoke('canvas:detach'),
  closeDetached: () => ipcRenderer.invoke('canvas:close-detached'),
  onDetachClosed: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('canvas:detach-closed', listener);
    return () => ipcRenderer.removeListener('canvas:detach-closed', listener);
  },
  sendCurveSync: (data: unknown) => ipcRenderer.send('canvas:curve-sync', data),
  onCurveSync: (cb: (data: unknown) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('canvas:curve-sync', listener);
    return () => ipcRenderer.removeListener('canvas:curve-sync', listener);
  },
  isDetached: () => new URLSearchParams(location.search).get('detached') === '1',
});
