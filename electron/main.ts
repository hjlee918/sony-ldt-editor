import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';
import { AdcpConnection } from './adcp';

let mainWindow: BrowserWindow | null = null;
let detachedWindow: BrowserWindow | null = null;
const sdcp = new AdcpConnection();

let boundsFile: string;

function loadBounds(): { width: number; height: number; x?: number; y?: number } {
  try {
    return JSON.parse(readFileSync(boundsFile, 'utf8'));
  } catch {
    return { width: 1280, height: 800 };
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    writeFileSync(boundsFile, JSON.stringify(win.getBounds()));
  } catch { /* ignore */ }
}

function createWindow(): void {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 700,
    minHeight: 500,
    title: 'Sony LDT Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('close', () => { if (mainWindow) saveBounds(mainWindow); });

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

ipcMain.handle('projector:getStatus', (_e, lite?: boolean) =>
  sdcp.isConnected() ? sdcp.getStatus(lite) : Promise.resolve({ connected: false }),
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

ipcMain.handle('projector:picPos', (_e, action: string, slot: string) =>
  sdcp.picPos(action as 'sel' | 'save' | 'del', slot),
);

ipcMain.handle('projector:key', (_e, keyCode: string) =>
  sdcp.key(keyCode),
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
  boundsFile = join(app.getPath('userData'), 'window-bounds.json');
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
