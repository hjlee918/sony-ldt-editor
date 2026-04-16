import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';
import { SdcpConnection } from './sdcp';

let mainWindow: BrowserWindow | null = null;
let detachedWindow: BrowserWindow | null = null;
const sdcp = new SdcpConnection();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    title: 'Sony LDT Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ── IPC: Projector ──────────────────────────────────────────────────────────

ipcMain.handle('projector:connect', (_e, ip: string, password?: string) =>
  sdcp.connect(ip, password),
);

ipcMain.handle('projector:disconnect', () => sdcp.disconnect());

ipcMain.handle('projector:getStatus', () =>
  sdcp.isConnected() ? sdcp.getStatus() : Promise.resolve({ connected: false }),
);

ipcMain.handle('projector:set', (_e, upper: number, lower: number, value: number) =>
  sdcp.set(upper, lower, value),
);

ipcMain.handle('projector:activateSlot', (_e, slot: number) =>
  sdcp.activateSlot(slot as 7 | 8 | 9 | 10),
);

ipcMain.handle('projector:upload', async (event, slot: number, channels: [number[], number[], number[]]) => {
  await sdcp.upload(slot as 7 | 8 | 9 | 10, channels, (pct) => {
    event.sender.send('projector:upload-progress', pct);
  });
  return 'ok';
});

ipcMain.handle('projector:download', (_e, slot: number) =>
  sdcp.download(slot as 7 | 8 | 9 | 10),
);

// ── IPC: Detached canvas window ─────────────────────────────────────────────

ipcMain.handle('canvas:detach', () => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.focus();
    return;
  }
  detachedWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Sony LDT — Canvas',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    detachedWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?detached=1`);
  } else {
    detachedWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { detached: '1' },
    });
  }

  detachedWindow.on('closed', () => {
    detachedWindow = null;
    mainWindow?.webContents.send('canvas:detach-closed');
  });
});

ipcMain.handle('canvas:close-detached', () => {
  detachedWindow?.close();
});

// Relay curve sync between main and detached windows
ipcMain.on('canvas:curve-sync', (event, data) => {
  const target =
    event.sender === mainWindow?.webContents
      ? detachedWindow?.webContents
      : mainWindow?.webContents;
  target?.send('canvas:curve-sync', data);
});

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:available');
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:ready');
    });
  }
});

ipcMain.on('update:install', () => autoUpdater.quitAndInstall());

app.on('window-all-closed', () => app.quit());
