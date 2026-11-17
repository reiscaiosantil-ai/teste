/* Lumi — app de computador (Electron): uma janela transparente, sempre no topo,
   presa no alto da tela. Fora do entalho, os cliques passam para o que está atrás. */
const { app, BrowserWindow, screen, ipcMain, globalShortcut, shell, session, protocol, dialog, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const spotify = require('./spotify');
const claudeCode = require('./claude-code');
const whisper = require('./whisper');
const piper = require('./piper');
const supertonic = require('./supertonic');
const sistema = require('./sistema');
const jogos = require('./jogos');
const agenda = require('./agenda');
const arquivos = require('./arquivos');

const LARGURA = 900, ALTURA = 580;
let janela = null, olhoSpotify = null;

// modelo de voz offline (Vosk, português): vai junto do instalador e é servido à página por lumivoz://
const MODELO_VOZ = app.isPackaged ? path.join(process.resourcesPath, 'voz', 'modelo-pt.tar.gz') : path.join(__dirname, '..', 'voz', 'modelo-pt.tar.gz');
protocol.registerSchemesAsPrivileged([{ scheme: 'lumivoz', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

/* Onde ela fica: em qual tela e em qual canto/lado (arrastando, ou em Ajustes). Fica salvo em posicao.json. */
const ARQ_POSICAO = () => path.join(app.getPath('userData'), 'posicao.json');
const VERT = ['cima', 'meio', 'baixo'], HORIZ = ['esq', 'centro', 'dir'];
let pos = { tela: null, v: 'cima', h: 'centro' };
function lerPosicao() {
  try { const d = JSON.parse(fs.readFileSync(ARQ_POSICAO(), 'utf8')); if (VERT.includes(d.v) && HORIZ.includes(d.h)) pos = { tela: d.tela ?? null, v: d.v, h: d.h }; } catch (_) { /* padrão: topo, no meio */ }
}
function salvarPosicao() { try { fs.writeFileSync(ARQ_POSICAO(), JSON.stringify(pos)); } catch (_) { /* sem disco */ } }
function telaAtual() { return screen.getAllDisplays().find((d) => d.id === pos.tela) || screen.getPrimaryDisplay(); }
function posicionar() {
  if (!janela || arrasto) return;
  const { x, y, width, height } = telaAtual().workArea;
  const nx = pos.h === 'esq' ? x : pos.h === 'dir' ? x + width - LARGURA : x + (width - LARGURA) / 2;
  const ny = pos.v === 'cima' ? y : pos.v === 'baixo' ? y + height - ALTURA : y + (height - ALTURA) / 2;
  janela.setBounds({ x: Math.round(nx), y: Math.round(ny), width: LARGURA, height: ALTURA });
  janela.webContents.send('lumi:posicao', { v: pos.v, h: pos.h });
}
// arrastar: enquanto o botão está segurado a janela vira uma gotinha que segue o mouse
const GOTA = 150;
let arrasto = null;
function comecarArrasto() {
  if (!janela || arrasto) return;
  janela.setIgnoreMouseEvents(false);
  const seguir = () => { const c = screen.getCursorScreenPoint(); janela.setBounds({ x: c.x - GOTA / 2, y: c.y - GOTA / 2, width: GOTA, height: GOTA }); };
  seguir();
  arrasto = { t: setInterval(seguir, 16), limite: setTimeout(terminarArrasto, 60000) };
}
function terminarArrasto() {
  if (!arrasto) return;
  clearInterval(arrasto.t); clearTimeout(arrasto.limite); arrasto = null;
  const c = screen.getCursorScreenPoint(), tela = screen.getDisplayNearestPoint(c), wa = tela.workArea;
  const fx = (c.x - wa.x) / wa.width, fy = (c.y - wa.y) / wa.height;
  let h = fx < 1 / 3 ? 'esq' : fx > 2 / 3 ? 'dir' : 'centro', v = fy < 1 / 3 ? 'cima' : fy > 2 / 3 ? 'baixo' : 'meio';
  if (v === 'meio' && h === 'centro') v = 'cima'; // soltou no meio da tela: volta para o topo
  pos = { tela: tela.id, v, h }; salvarPosicao();
  posicionar();
  janela.setIgnoreMouseEvents(true, { forward: true });
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
  lerPosicao();
  posicionar();
  janela.webContents.on('did-finish-load', () => janela.webContents.send('lumi:posicao', { v: pos.v, h: pos.h }));
  janela.loadFile(path.join(__dirname, '..', 'index.html'), { query: { desktop: '1' } });
  janela.once('ready-to-show', () => janela.showInactive());

  // links abrem no navegador padrão, nunca dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  claudeCode.definirPastaConta(path.join(app.getPath('userData'), 'claude-conta'));
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
// voz natural offline (Supertonic 3): baixa uma vez e fala sem internet; uma frase por vez, na ordem pedida
const avisarNatural = (e) => { if (janela && !janela.isDestroyed()) janela.webContents.send('lumi:natural', e); };
let filaNatural = Promise.resolve();
ipcMain.handle('lumi:nat-estado', () => { const e = supertonic.lerEstado(app.getPath('userData')); if (e.pronto) supertonic.aquecer(app.getPath('userData')); return e; });
ipcMain.handle('lumi:nat-baixar', () => supertonic.baixar(app.getPath('userData'), avisarNatural).then((e) => { if (e.pronto) supertonic.aquecer(app.getPath('userData')); return e; }));
ipcMain.handle('lumi:nat-falar', (_e, texto, op) => {
  const r = filaNatural.then(async () => {
    try { return { wav: new Uint8Array(await supertonic.sintetizar(String(texto || '').slice(0, 1200), app.getPath('userData'), { voz: String((op && op.voz) || 'F1'), passos: Number(op && op.passos) || 6, velocidade: Number(op && op.velocidade) || 1.05 })) }; }
    catch (e) { return { erro: String(e && e.message ? e.message : e).slice(0, 200) }; }
  });
  filaNatural = r.catch(() => {});
  return r;
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
// cada pessoa conecta a própria conta: login do PC, conta separada só da assistente, ou chave de API do Console
const opConta = (op) => ({ chave: String((op && op.chave) || '').slice(0, 300), contaPropria: !!(op && op.contaPropria) });
ipcMain.handle('lumi:cc-status', (_e, op) => claudeCode.status(opConta(op)));
ipcMain.handle('lumi:cc-pensar', (_e, p) => claudeCode.pensar({
  pedido: String((p && p.pedido) || ''), nome: String((p && p.nome) || 'Lumi').slice(0, 30),
  usuario: String((p && p.usuario) || '').slice(0, 40), personalidade: String((p && p.personalidade) || 'fofo'), modelo: String((p && p.modelo) || 'sonnet'),
  memoria: Array.isArray(p && p.memoria) ? p.memoria.slice(0, 40).map((x) => String(x).slice(0, 200)) : [],
  ...opConta(p),
}));
ipcMain.handle('lumi:cc-nova', () => { claudeCode.novaConversa(); return true; });
ipcMain.handle('lumi:cc-terminal', (_e, acao, op) => claudeCode.abrirTerminal(['instalar', 'entrar', 'entrar-console', 'sair'].includes(acao) ? acao : 'entrar', opConta(op)));
ipcMain.handle('lumi:cc-sair', (_e, op) => claudeCode.sair(opConta(op)));

// computador: memória, antivírus, apps, conversas, ligações e energia (desligar só com a senha)
const abrirUrl = (u) => shell.openExternal(u);
const txt = (t, n = 200) => String(t || '').slice(0, n);
ipcMain.handle('lumi:sis-memoria', () => sistema.memoria());
ipcMain.handle('lumi:sis-fechar', (_e, alvo, op) => sistema.fechar(txt(alvo, 120), { forcar: !!(op && op.forcar), processo: txt(op && op.processo, 80) }));
ipcMain.handle('lumi:sis-abrir', async (_e, alvo) => { // jogo instalado (Steam, Epic, Riot) primeiro, se o nome bater bem; senão o menu Iniciar
  const j = await jogos.abrirJogo(txt(alvo, 120), abrirUrl, 55).catch(() => ({}));
  return j.ok ? { ok: true, nome: j.nome, jogo: true } : sistema.abrir(txt(alvo, 120), abrirUrl);
});
ipcMain.handle('lumi:sis-conversa', (_e, contato) => sistema.conversa(txt(contato, 80), abrirUrl));
ipcMain.handle('lumi:sis-ligacao', () => sistema.sairLigacao());
ipcMain.handle('lumi:sis-energia', (_e, acao, senha, nome, segundos) => sistema.energia(txt(acao, 20), txt(senha, 200), app.getPath('userData'), txt(nome, 30) || 'A assistente', Number(segundos) || 30));
ipcMain.handle('lumi:sis-senha', (_e, atual, nova) => sistema.trocarSenha(app.getPath('userData'), txt(atual, 200), txt(nova, 200)));
ipcMain.handle('lumi:sis-senha-padrao', () => !!sistema.lerSeguranca(app.getPath('userData')).padrao);
ipcMain.handle('lumi:sis-protecao', () => sistema.protecao());
ipcMain.handle('lumi:sis-verificar', (_e, tipo) => sistema.verificar(txt(tipo, 20), app.getPath('downloads')));
ipcMain.handle('lumi:sis-verificando', () => sistema.estadoVerificacao());
ipcMain.handle('lumi:sis-atualizar', () => sistema.atualizarProtecao());
ipcMain.handle('lumi:sis-seguranca-windows', () => shell.openExternal('windowsdefender://threat/').then(() => true).catch(() => false));

// jogos: atalhos (clipe, print, Discord), modo jogo, status, lojas e manchetes
ipcMain.handle('lumi:jogo-teclas', (_e, combo) => jogos.teclas(txt(combo, 40)));
ipcMain.handle('lumi:jogo-clipe', (_e, gravador, tipo) => jogos.teclas((tipo === 'print' ? jogos.ATALHOS_PRINT : jogos.ATALHOS_CLIPE)[gravador] || (tipo === 'print' ? jogos.ATALHOS_PRINT.xbox : jogos.ATALHOS_CLIPE.xbox)));
ipcMain.handle('lumi:jogo-listar', () => jogos.listar().map((j) => ({ nome: j.nome, loja: j.loja })));
ipcMain.handle('lumi:jogo-abrir', (_e, alvo) => jogos.abrirJogo(txt(alvo, 80), abrirUrl));
ipcMain.handle('lumi:jogo-modo', async (_e, ligar) => {
  const r = await jogos.modoJogo(!!ligar, app.getPath('userData'));
  if (ligar) { const m = await sistema.memoria().catch(() => null); r.sugestoes = m ? jogos.sugerirFechar(m.apps).map((a) => ({ nome: a.nome, rotulo: a.rotulo, mb: a.mb })) : []; }
  return r;
});
ipcMain.handle('lumi:jogo-status', () => jogos.status());
ipcMain.handle('lumi:jogo-epic', () => jogos.epicGratis());
ipcMain.handle('lumi:jogo-steam', (_e, busca) => jogos.precoSteam(txt(busca, 80)));
ipcMain.handle('lumi:manchetes', () => jogos.manchetes());

// agenda pelo link iCal (só leitura)
ipcMain.handle('lumi:agenda', (_e, links) => agenda.eventos(Array.isArray(links) ? links.map((l) => txt(l, 1000)) : []));

// arquivos: só abre o que a busca devolveu; lixeira só com a lista que foi mostrada
const permitidos = new Set();
let paraLixeira = [];
const resumoArq = (a) => { permitidos.add(a.caminho); return { nome: a.nome, caminho: a.caminho, pasta: a.pasta, mtime: a.mtime, tamanho: a.tamanho }; };
ipcMain.handle('lumi:arq-procurar', (_e, texto) => arquivos.procurar(txt(texto, 120)).map(resumoArq));
ipcMain.handle('lumi:arq-ultimo', () => arquivos.ultimosDownloads(1).map(resumoArq)[0] || null);
ipcMain.handle('lumi:arq-abrir', async (_e, caminho) => (permitidos.has(caminho) ? { ok: !(await shell.openPath(caminho)) } : { erro: 'arquivo não autorizado' }));
ipcMain.handle('lumi:arq-mostrar', (_e, caminho) => { if (permitidos.has(caminho)) shell.showItemInFolder(caminho); return true; });
ipcMain.handle('lumi:arq-velhos', (_e, dias) => {
  const r = arquivos.downloadsVelhos(Math.max(7, Math.min(365, Number(dias) || 30)));
  paraLixeira = r.arquivos.map((a) => a.caminho);
  return { qtd: r.arquivos.length, total: r.total, exemplos: r.arquivos.slice(0, 5).map((a) => a.nome) };
});
ipcMain.handle('lumi:arq-lixeira', async () => {
  let ok = 0; const falhas = [];
  for (const p of paraLixeira) { try { await shell.trashItem(p); ok++; } catch (e) { falhas.push(path.basename(p)); } }
  paraLixeira = [];
  return { ok, falhas };
});

// ditado: cola o texto onde o cursor estiver (área de transferência + Ctrl+V; depois devolve o que estava copiado)
async function digitar(texto) {
  if (process.platform !== 'win32') return { indisponivel: true };
  const antes = clipboard.readText();
  clipboard.writeText(String(texto));
  if (janela && janela.isFocused()) janela.blur(); // devolve o foco para a janela onde você estava
  await new Promise((r) => setTimeout(r, 450));
  const r = await jogos.teclas('ctrl+v');
  setTimeout(() => { try { if (clipboard.readText() === String(texto)) clipboard.writeText(antes); } catch (_) { /* sem área de transferência */ } }, 1500);
  return r;
}
ipcMain.handle('lumi:digitar', (_e, texto) => digitar(txt(texto, 4000)));
// mensagem no WhatsApp: abre a conversa e deixa o texto escrito; quem envia é você (Enter)
ipcMain.handle('lumi:sis-mensagem', async (_e, contato, texto) => {
  const c = txt(contato, 80), t = txt(texto, 2000), digitos = c.replace(/\D/g, '');
  if (digitos.length >= 10) {
    const numero = digitos.length <= 11 ? '55' + digitos : digitos;
    await shell.openExternal(`whatsapp://send?phone=${numero}&text=${encodeURIComponent(t)}`).catch(() => shell.openExternal(`https://wa.me/${numero}?text=${encodeURIComponent(t)}`));
    return { ok: true, por: 'numero' };
  }
  const r = await sistema.conversa(c, abrirUrl);
  if (!r.ok) return r;
  await new Promise((ok) => setTimeout(ok, 1500));
  await digitar(t);
  return { ok: true, por: 'busca' };
});
// documentos do Claude Code: o arquivo mais novo em Notas desde o pedido
ipcMain.handle('lumi:cc-ultima-nota', async (_e, desde) => {
  let itens = []; try { itens = fs.readdirSync(claudeCode.NOTAS); } catch (_) { return null; }
  const novo = itens.map((n) => { const p = path.join(claudeCode.NOTAS, n); try { const st = fs.statSync(p); return st.isFile() ? { p, n, t: st.mtimeMs, s: st.size } : null; } catch (_) { return null; } })
    .filter((x) => x && x.t >= (Number(desde) || 0) - 2000).sort((a, b) => b.t - a.t)[0];
  if (!novo) return null;
  await shell.openPath(novo.p);
  const texto = /\.(?:md|txt|csv|html?)$/i.test(novo.n) && novo.s < 300e3 ? fs.readFileSync(novo.p, 'utf8') : '';
  return { arquivo: novo.n, texto };
});
// alertas: memória e disco (leitura rápida, sem PowerShell)
ipcMain.handle('lumi:sis-ram', () => { const os = require('os'); return { pct: Math.round((1 - os.freemem() / os.totalmem()) * 100) }; });
ipcMain.handle('lumi:sis-disco', async () => {
  try { const st = await fs.promises.statfs(process.platform === 'win32' ? 'C:\\' : '/'); return { livre: st.bavail * st.bsize, total: st.blocks * st.bsize }; } catch (_) { return null; }
});
ipcMain.handle('lumi:sis-volume', (_e, op) => sistema.volume(op && typeof op === 'object' ? { valor: typeof op.valor === 'number' ? op.valor : undefined, delta: Number(op.delta) || 0, mudo: !!op.mudo } : {}));
ipcMain.handle('lumi:sis-brilho', (_e, op) => sistema.brilho(op && typeof op === 'object' ? { valor: typeof op.valor === 'number' ? op.valor : undefined, delta: Number(op.delta) || 0 } : {}));

// posição na tela
ipcMain.on('lumi:arrastar', (_e, fase) => { if (fase === 'inicio') comecarArrasto(); else terminarArrasto(); });
ipcMain.handle('lumi:telas', () => {
  const prim = screen.getPrimaryDisplay().id, atual = telaAtual().id;
  return { atual, v: pos.v, h: pos.h, telas: screen.getAllDisplays().map((d, i) => ({ id: d.id, nome: `Tela ${i + 1} · ${d.size.width}×${d.size.height}${d.id === prim ? ' (principal)' : ''}` })) };
});
ipcMain.handle('lumi:posicionar', (_e, p) => {
  if (p && VERT.includes(p.v) && HORIZ.includes(p.h)) { pos.v = p.v; pos.h = p.h; }
  if (p && p.tela !== undefined && screen.getAllDisplays().some((d) => d.id === p.tela)) pos.tela = p.tela;
  salvarPosicao(); posicionar(); return true;
});

ipcMain.handle('lumi:capa', (_e, musica, artista) => spotify.buscarCapa(String(musica || '').slice(0, 200), String(artista || '').slice(0, 200)));
ipcMain.handle('lumi:spotify-estado', () => (olhoSpotify ? olhoSpotify.estado() : null));
ipcMain.handle('lumi:spotify-comando', (_e, acao) => (olhoSpotify ? olhoSpotify.comando(String(acao)) : false));
ipcMain.handle('lumi:spotify-buscar', async (_e, busca) => {
  const q = String(busca || '').slice(0, 200);
  try { await shell.openExternal('spotify:search:' + encodeURIComponent(q)); return 'app'; } catch (_) {
    await shell.openExternal('https://open.spotify.com/search/' + encodeURIComponent(q)); return 'web';
  }
});

ipcMain.on('lumi:mouse', (_e, dentro) => { if (janela && !arrasto) janela.setIgnoreMouseEvents(!dentro, { forward: true }); });
ipcMain.on('lumi:aberto', (_e, aberto) => {
  if (!janela || arrasto) return;
  if (aberto) { janela.setIgnoreMouseEvents(false); janela.focus(); }
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); if (olhoSpotify) olhoSpotify.parar(); });
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
