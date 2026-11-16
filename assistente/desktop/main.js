/* Lumi — app de computador (Electron): uma janela transparente, sempre no topo,
   presa no alto da tela. Fora do entalho, os cliques passam para o que está atrás. */
const { app, BrowserWindow, screen, ipcMain, globalShortcut, shell, session, protocol, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const spotify = require('./spotify');
const claudeCode = require('./claude-code');
const whisper = require('./whisper');
const piper = require('./piper');

const LARGURA = 900, ALTURA = 580;
let janela = null, olhoSpotify = null;

// modelo de voz offline (Vosk, português): vai junto do instalador e é servido à página por lumivoz://
const MODELO_VOZ = app.isPackaged ? path.join(process.resourcesPath, 'voz', 'modelo-pt.tar.gz') : path.join(__dirname, '..', 'voz', 'modelo-pt.tar.gz');
protocol.registerSchemesAsPrivileged([{ scheme: 'lumivoz', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

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
  protocol.handle('lumivoz', async () => {
    try {
      const dados = await fs.promises.readFile(MODELO_VOZ);
      return new Response(dados, { headers: { 'content-type': 'application/gzip', 'access-control-allow-origin': '*' } });
    } catch (_) { return new Response('modelo de voz não encontrado', { status: 404, headers: { 'access-control-allow-origin': '*' } }); }
  });
  // microfone, notificações e localização (clima) para a página local do app
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(['media', 'notifications', 'geolocation', 'clipboard-sanitized-write'].includes(permissao)));
  criar();
  globalShortcut.register('Alt+K', () => janela && janela.webContents.send('lumi:atalho', 'abrir'));
  globalShortcut.register('Alt+L', () => janela && janela.webContents.send('lumi:atalho', 'ouvir'));
  screen.on('display-metrics-changed', posicionar);
  // Spotify do computador: avisa a página quando a música muda
  olhoSpotify = spotify.iniciar((estado) => { if (janela && !janela.isDestroyed()) janela.webContents.send('lumi:spotify', estado); });
});

// cérebro pelo Claude Code instalado no PC (usa a assinatura do Claude)
// Whisper: transcreve a frase do pedido (áudio 16 kHz mono vindo da página)
const avisarWhisper = (e) => { if (janela && !janela.isDestroyed()) janela.webContents.send('lumi:whisper', e); };
ipcMain.handle('lumi:whisper-estado', () => whisper.estado());
ipcMain.handle('lumi:whisper-preparar', (_e, nome) => whisper.carregar(String(nome || 'small'), app.getPath('userData'), avisarWhisper).then(() => whisper.estado()).catch(() => whisper.estado()));
ipcMain.handle('lumi:transcrever', async (_e, audio, nome) => {
  if (!(audio instanceof Float32Array) || audio.length < 1600 || audio.length > 16000 * 30) return { texto: '' };
  try { return { texto: await whisper.transcrever(audio, String(nome || 'small'), app.getPath('userData'), avisarWhisper) }; }
  catch (e) { return { erro: String(e && e.message ? e.message : e).slice(0, 200) }; }
});
// Piper: vozes offline (pasta "vozes" do app) e o Estúdio de voz (Documentos/Lumi/estudio-voz)
const pastaVozes = () => { const p = path.join(app.getPath('userData'), 'vozes'); fs.mkdirSync(p, { recursive: true }); return p; };
const pastaEstudio = () => path.join(app.getPath('documents'), 'Lumi', 'estudio-voz');
ipcMain.handle('lumi:piper-vozes', () => piper.listar(pastaVozes()).map((v) => v.nome));
ipcMain.handle('lumi:piper-falar', async (_e, texto, nome, op) => {
  const vozes = piper.listar(pastaVozes()), v = vozes.find((x) => x.nome === nome) || vozes[0];
  if (!v) return { erro: 'nenhuma voz offline instalada' };
  try { return { wav: new Uint8Array(await piper.sintetizar(String(texto || '').slice(0, 2000), v.modelo, op || {})) }; }
  catch (e) { return { erro: String(e && e.message ? e.message : e).slice(0, 200) }; }
});
ipcMain.handle('lumi:piper-adicionar', async () => {
  const r = await dialog.showOpenDialog(janela, { title: 'Escolha a voz (arquivo .onnx)', filters: [{ name: 'Voz Piper', extensions: ['onnx'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  if (!fs.existsSync(src + '.json')) return { erro: `Falta o arquivo ${path.basename(src)}.json na mesma pasta.` };
  const nome = path.basename(src);
  fs.copyFileSync(src, path.join(pastaVozes(), nome)); fs.copyFileSync(src + '.json', path.join(pastaVozes(), nome + '.json'));
  return { nome: nome.replace(/\.onnx$/, '') };
});
ipcMain.handle('lumi:abrir-pasta', (_e, qual) => { const p = qual === 'estudio' ? pastaEstudio() : pastaVozes(); fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
function lerMetadados() {
  const m = new Map();
  try { for (const l of fs.readFileSync(path.join(pastaEstudio(), 'metadata.csv'), 'utf8').split(/\r?\n/)) { const [a, t] = l.split('|'); if (a && t) m.set(a, t); } } catch (_) { /* ainda vazio */ }
  return m;
}
ipcMain.handle('lumi:estudio-estado', () => ({ gravadas: [...lerMetadados().keys()].map((a) => parseInt(a.replace(/\D/g, ''), 10)), pasta: pastaEstudio() }));
ipcMain.handle('lumi:estudio-salvar', (_e, indice, texto, wav) => {
  const i = Number(indice); if (!Number.isInteger(i) || i < 0 || i > 9999 || !(wav instanceof Uint8Array) || wav.length > 20e6) return { erro: 'gravação inválida' };
  const nome = `frase${String(i).padStart(4, '0')}.wav`;
  fs.mkdirSync(path.join(pastaEstudio(), 'wavs'), { recursive: true });
  fs.writeFileSync(path.join(pastaEstudio(), 'wavs', nome), Buffer.from(wav));
  const m = lerMetadados(); m.set(nome, String(texto || '').replace(/[|\r\n]+/g, ' ').trim());
  fs.writeFileSync(path.join(pastaEstudio(), 'metadata.csv'), [...m.entries()].sort().map(([a, t]) => `${a}|${t}`).join('\n') + '\n', 'utf8');
  return { ok: true, total: m.size };
});

ipcMain.handle('lumi:voz-info', () => ({ disponivel: fs.existsSync(MODELO_VOZ), url: 'lumivoz://modelo/pt.tar.gz' }));
ipcMain.handle('lumi:cc-status', () => claudeCode.status());
ipcMain.handle('lumi:cc-pensar', (_e, p) => claudeCode.pensar({
  pedido: String((p && p.pedido) || ''), nome: String((p && p.nome) || 'Lumi').slice(0, 30),
  usuario: String((p && p.usuario) || '').slice(0, 40), personalidade: String((p && p.personalidade) || 'fofo'), modelo: String((p && p.modelo) || 'sonnet'),
}));
ipcMain.handle('lumi:cc-nova', () => { claudeCode.novaConversa(); return true; });

ipcMain.handle('lumi:capa', (_e, musica, artista) => spotify.buscarCapa(String(musica || '').slice(0, 200), String(artista || '').slice(0, 200)));
ipcMain.handle('lumi:spotify-estado', () => (olhoSpotify ? olhoSpotify.estado() : null));
ipcMain.handle('lumi:spotify-comando', (_e, acao) => (olhoSpotify ? olhoSpotify.comando(String(acao)) : false));
ipcMain.handle('lumi:spotify-buscar', async (_e, busca) => {
  const q = String(busca || '').slice(0, 200);
  try { await shell.openExternal('spotify:search:' + encodeURIComponent(q)); return 'app'; } catch (_) {
    await shell.openExternal('https://open.spotify.com/search/' + encodeURIComponent(q)); return 'web';
  }
});

ipcMain.on('lumi:mouse', (_e, dentro) => { if (janela) janela.setIgnoreMouseEvents(!dentro, { forward: true }); });
ipcMain.on('lumi:aberto', (_e, aberto) => {
  if (!janela) return;
  if (aberto) { janela.setIgnoreMouseEvents(false); janela.focus(); }
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); if (olhoSpotify) olhoSpotify.parar(); });
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
