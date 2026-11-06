// YorLedger desktop shell. Loads the same web build from a private app:// scheme
// (a proper secure origin: IndexedDB offline cache, web workers for OCR, fetch).
const { app, BrowserWindow, protocol, net, shell, session, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'app://yorledger';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    title: 'YorLedger',
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  // WhatsApp / phone / web links open outside the app; nothing else leaves it.
  const openOutside = url => {
    if (/^(https?:|tel:|mailto:|whatsapp:)/.test(url)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); openOutside(url); }
  });

  win.loadURL(`${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.yorledger.app');

  // Serve files from the bundled web build only (no path escapes).
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Allow notifications (due reminders); deny camera / mic / location etc.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'notifications'));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ]));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
