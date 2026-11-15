/* Lumi — app de computador (Electron): uma janela transparente, sempre no topo,
   presa no alto da tela. Fora do entalho, os cliques passam para o que está atrás. */
const { app, BrowserWindow, screen, ipcMain, globalShortcut, shell, session } = require('electron');
const path = require('path');

const LARGURA = 900, ALTURA = 580;
let janela = null;

function posicionar() {
  if (!janela) return;
  const tela = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = tela.workArea;
  janela.setBounds({ x: Math.round(x + (width - LARGURA) / 2), y, width: LARGURA, height: ALTURA });
}

function criar() {
  janela = new BrowserWindow({
    width: LARGURA, height: ALTURA, frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, fullscreenable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  janela.setIgnoreMouseEvents(true, { forward: true }); // só o entalho recebe o mouse
  posicionar();
  janela.loadFile(path.join(__dirname, '..', 'index.html'), { query: { desktop: '1' } });
  janela.once('ready-to-show', () => janela.showInactive());

  // links abrem no navegador padrão, nunca dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  // microfone, notificações e localização (clima) para a página local do app
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(['media', 'notifications', 'geolocation', 'clipboard-sanitized-write'].includes(permissao)));
  criar();
  globalShortcut.register('Alt+K', () => janela && janela.webContents.send('lumi:atalho', 'abrir'));
  globalShortcut.register('Alt+L', () => janela && janela.webContents.send('lumi:atalho', 'ouvir'));
  screen.on('display-metrics-changed', posicionar);
});

ipcMain.on('lumi:mouse', (_e, dentro) => { if (janela) janela.setIgnoreMouseEvents(!dentro, { forward: true }); });
ipcMain.on('lumi:aberto', (_e, aberto) => {
  if (!janela) return;
  if (aberto) { janela.setIgnoreMouseEvents(false); janela.focus(); }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
