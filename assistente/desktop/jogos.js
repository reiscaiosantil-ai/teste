/* Lumi — coisas de quem joga: abrir jogos (Steam, Epic, Riot), modo jogo, clipe/print pelo atalho do
   gravador, status do PC (CPU, RAM, placa de vídeo, ping), jogos de graça na Epic e preços da Steam.
   Nada aqui mexe dentro dos jogos (memória, mira, automação): só atalhos do sistema e lojas, para não
   esbarrar em anti-cheat. As funções de leitura (vdf, manifestos, ping, ofertas) são puras e testadas. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function rodar(exe, args, ms = 20000, env) {
  return new Promise((ok) => {
    let saida = '', erro = '';
    let p;
    try { p = spawn(exe, args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env }); } catch (e) { ok({ falhou: e.message }); return; }
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    const t = setTimeout(() => { try { p.kill(); } catch (_) { /* já saiu */ } }, ms);
    p.stdout.on('data', (d) => { saida += d; }); p.stderr.on('data', (d) => { erro += d; });
    p.on('error', (e) => { clearTimeout(t); ok({ falhou: e.message, saida, erro }); });
    p.on('close', (codigo) => { clearTimeout(t); ok({ codigo, saida, erro }); });
  });
}
function ps(script, env = {}, ms = 30000) {
  if (!WIN) return Promise.resolve({ falhou: 'só no Windows' });
  const codigo = Buffer.from('[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ProgressPreference="SilentlyContinue"\n' + script, 'utf16le').toString('base64');
  return rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codigo], ms, env);
}
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch (_) { return ''; } };

/* ================= teclas de atalho (gravador, Discord) ================= */
const VK = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B, printscreen: 0x2C, print: 0x2C, prtsc: 0x2C, space: 0x20, espaco: 0x20,
  enter: 0x0D, esc: 0x1B, tab: 0x09, home: 0x24, end: 0x23, insert: 0x2D, delete: 0x2E, pause: 0x13, scrolllock: 0x91,
};
for (let i = 1; i <= 24; i++) VK['f' + i] = 0x6F + i;
for (let i = 0; i <= 9; i++) VK[String(i)] = 0x30 + i;
for (let c = 65; c <= 90; c++) VK[String.fromCharCode(c + 32)] = c;
/** "ctrl+shift+m" → [0x11, 0x10, 0x4D]. Exportada para testes. */
function codigosTeclas(combo) {
  const partes = String(combo || '').toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  if (!partes.length || partes.length > 5) return null;
  const v = partes.map((p) => VK[p]);
  return v.every((x) => typeof x === 'number') ? v : null;
}
const PS_TECLAS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class LumiTec { [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e); }
"@
$v = $env:LUMI_VK -split ',' | ForEach-Object { [byte][int]$_ }
foreach ($k in $v) { [LumiTec]::keybd_event($k, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
Start-Sleep -Milliseconds 60
[array]::Reverse($v)
foreach ($k in $v) { [LumiTec]::keybd_event($k, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 20 }
'ok'
`;
/** Aperta uma combinação de teclas no Windows (vai para a janela da frente: o jogo ou, se global, o Discord). */
async function teclas(combo) {
  const v = codigosTeclas(combo);
  if (!v) return { erro: `Atalho inválido: ${combo}` };
  if (!WIN) return { indisponivel: true };
  const r = await ps(PS_TECLAS, { LUMI_VK: v.join(',') }, 15000);
  return /ok/.test(r.saida || '') ? { ok: true } : { erro: String(r.erro || r.falhou || 'não consegui apertar o atalho').slice(0, 160) };
}
const ATALHOS_CLIPE = { xbox: 'win+alt+g', nvidia: 'alt+f10', amd: 'ctrl+shift+s' };
const ATALHOS_PRINT = { xbox: 'win+alt+printscreen', nvidia: 'alt+f1', amd: 'ctrl+shift+i' };

/* ================= jogos instalados ================= */
/** Lê os caminhos das bibliotecas do libraryfolders.vdf da Steam. */
function bibliotecasSteam(vdf) {
  const out = [];
  for (const m of String(vdf || '').matchAll(/"path"\s+"([^"]+)"/g)) out.push(m[1].replace(/\\\\/g, '\\'));
  return out;
}
/** Lê appid e nome de um appmanifest_*.acf. */
function manifestoSteam(acf) {
  const id = /"appid"\s+"(\d+)"/.exec(acf || ''), nome = /"name"\s+"([^"]+)"/.exec(acf || '');
  return id && nome ? { id: id[1], nome: nome[1] } : null;
}
const NAO_JOGO = /redistributable|steamworks|proton|steam linux runtime|\bsdk\b|dedicated server|soundtrack|benchmark|wallpaper engine/i;
function jogosSteam() {
  const raiz = [process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'), process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    path.join(os.homedir(), '.steam', 'steam'), path.join(os.homedir(), '.local', 'share', 'Steam')].filter(Boolean).find((p) => fs.existsSync(path.join(p, 'steamapps')));
  if (!raiz) return [];
  const libs = [...new Set([raiz, ...bibliotecasSteam(lerTexto(path.join(raiz, 'steamapps', 'libraryfolders.vdf')))])];
  const jogos = [];
  for (const lib of libs) {
    let arqs = []; try { arqs = fs.readdirSync(path.join(lib, 'steamapps')).filter((a) => /^appmanifest_\d+\.acf$/.test(a)); } catch (_) { continue; }
    for (const a of arqs) {
      const j = manifestoSteam(lerTexto(path.join(lib, 'steamapps', a)));
      if (j && !NAO_JOGO.test(j.nome) && j.id !== '228980') jogos.push({ nome: j.nome, loja: 'Steam', url: `steam://rungameid/${j.id}` });
    }
  }
  return jogos;
}
/** Lê um manifesto .item da Epic (JSON). */
function manifestoEpic(txt) {
  let d; try { d = JSON.parse(txt); } catch (_) { return null; }
  if (!d || !d.DisplayName || !d.AppName || d.bIsIncompleteInstall) return null;
  if (Array.isArray(d.AppCategories) && d.AppCategories.length && !d.AppCategories.includes('games')) return null;
  const id = [d.CatalogNamespace, d.CatalogItemId, d.AppName].filter(Boolean).map(encodeURIComponent).join('%3A');
  return { nome: d.DisplayName, loja: 'Epic', url: `com.epicgames.launcher://apps/${id}?action=launch&silent=true` };
}
function jogosEpic() {
  const pasta = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let arqs = []; try { arqs = fs.readdirSync(pasta).filter((a) => a.endsWith('.item')); } catch (_) { return []; }
  return arqs.map((a) => manifestoEpic(lerTexto(path.join(pasta, a)))).filter(Boolean);
}
const RIOT = [['valorant', 'VALORANT'], ['league_of_legends', 'League of Legends'], ['lion', '2XKO']];
function jogosRiot() {
  const base = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games');
  let cliente = null;
  try { const d = JSON.parse(lerTexto(path.join(base, 'RiotClientInstalls.json'))); cliente = d.rc_default || d.rc_live || null; } catch (_) { /* sem Riot */ }
  if (!cliente) return [];
  return RIOT.filter(([p]) => fs.existsSync(path.join(base, 'Metadata', `${p}.live`))).map(([p, nome]) => ({ nome, loja: 'Riot', exe: cliente, args: [`--launch-product=${p}`, '--launch-patchline=live'] }));
}
let cacheJogos = { t: 0, lista: [] };
function listar() {
  if (Date.now() - cacheJogos.t < 5 * 60e3) return cacheJogos.lista;
  const lista = [...jogosSteam(), ...jogosEpic(), ...jogosRiot()].sort((a, b) => a.nome.localeCompare(b.nome));
  cacheJogos = { t: Date.now(), lista };
  return lista;
}
const APELIDOS_JOGO = { lol: 'league of legends', cs: 'counter strike 2', cs2: 'counter strike 2', csgo: 'counter strike 2', gta: 'grand theft auto v', fortinite: 'fortnite', valo: 'valorant', r6: 'rainbow six siege' };
/** Acha o jogo pelo nome falado. Exportada para testes. */
function escolherJogo(alvo, lista, minimo = 1) {
  let a = norm(alvo).replace(/^(?:o|a|jogo|game)\s+/, '');
  a = APELIDOS_JOGO[a] || a;
  if (!a) return null;
  let melhor = null, nota = 0;
  for (const j of lista) {
    const n = norm(j.nome);
    let s = n === a ? 100 : n.startsWith(a + ' ') ? 80 : (` ${n} `).includes(` ${a} `) ? 60 : a.length >= 4 && n.replace(/ /g, '').includes(a.replace(/ /g, '')) ? 40 : 0;
    if (s) s -= Math.min(15, n.length / 6);
    if (s > nota) { nota = s; melhor = j; }
  }
  return nota >= minimo ? melhor : null;
}
async function abrirJogo(alvo, abrirUrl, minimo = 1) {
  const j = escolherJogo(alvo, listar(), minimo);
  if (!j) return { naoAchei: true };
  try {
    if (j.url) await abrirUrl(j.url);
    else { const p = spawn(j.exe, j.args, { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); }
    return { ok: true, nome: j.nome, loja: j.loja };
  } catch (e) { return { erro: String(e && e.message || e) }; }
}

/* ================= modo jogo ================= */
// apps que pesam e não costumam ser usados jogando (o Discord, o Spotify e o OBS ficam)
const PESADOS = new Set(['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'ms-teams', 'teams', 'code', 'winword', 'excel', 'powerpnt', 'outlook', 'olk', 'notion', 'figma',
  'slack', 'photoshop', 'afterfx', 'adobe premiere pro', 'capcut', 'onedrive', 'docker desktop', 'vmmem']); // o Claude fica: pode ser o cérebro dela
/** Escolhe o que sugerir fechar no modo jogo. Exportada para testes. */
function sugerirFechar(apps) {
  return (apps || []).filter((a) => PESADOS.has(String(a.nome).toLowerCase()) && a.mb >= 250).sort((a, b) => b.mb - a.mb).slice(0, 4);
}
const ARQ_MODO = (pasta) => path.join(pasta, 'modo-jogo.json');
const PS_NOTIF = `
$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
$antes = (Get-ItemProperty -Path $k -Name ToastEnabled -ErrorAction SilentlyContinue).ToastEnabled
if ($null -eq $antes) { $antes = 1 }
New-ItemProperty -Path $k -Name ToastEnabled -Value ([int]$env:LUMI_VALOR) -PropertyType DWord -Force | Out-Null
"antes=$antes"
`;
/** Liga ou desliga o modo jogo: plano de energia de alto desempenho e notificações do Windows silenciadas. Guarda como estava para desfazer. */
async function modoJogo(ligar, pasta) {
  if (!WIN) return { indisponivel: true };
  const feito = [];
  let salvo = {}; try { salvo = JSON.parse(lerTexto(ARQ_MODO(pasta)) || '{}'); } catch (_) { salvo = {}; }
  if (ligar) {
    const atual = await rodar('powercfg', ['/getactivescheme']);
    const guid = (/([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(atual.saida || '') || [])[1];
    const r = await rodar('powercfg', ['/setactive', 'SCHEME_MIN']); // SCHEME_MIN = alto desempenho
    if (r.codigo === 0) feito.push('energia em alto desempenho');
    const n = await ps(PS_NOTIF, { LUMI_VALOR: '0' });
    const antes = (/antes=(\d)/.exec(n.saida || '') || [])[1];
    if (antes !== undefined) feito.push('notificações do Windows silenciadas');
    salvo = { ligado: true, plano: salvo.ligado ? salvo.plano : guid, toast: salvo.ligado ? salvo.toast : antes };
  } else {
    if (salvo.plano) { const r = await rodar('powercfg', ['/setactive', salvo.plano]); if (r.codigo === 0) feito.push('energia de volta ao normal'); }
    await ps(PS_NOTIF, { LUMI_VALOR: String(salvo.toast === '0' ? 0 : 1) }); feito.push('notificações de volta');
    salvo = { ligado: false };
  }
  try { fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(ARQ_MODO(pasta), JSON.stringify(salvo)); } catch (_) { /* sem disco */ }
  return { ok: true, feito };
}

/* ================= status do PC (CPU, RAM, placa de vídeo, ping) ================= */
/** Média do ping (Windows em português/inglês ou Linux). Exportada para testes. */
function lerPing(saida) {
  const s = String(saida || '');
  let m = /(?:M[ée]dia|Average|Media)\s*=\s*(\d+)\s*ms/i.exec(s); if (m) return Number(m[1]);
  m = /=\s*[\d.]+\/([\d.]+)\/[\d.]+/.exec(s); if (m) return Math.round(Number(m[1]));
  return null;
}
/** Lê a linha do nvidia-smi: nome, temperatura, uso, memória usada e total. Exportada para testes. */
function lerNvidia(saida) {
  const l = String(saida || '').trim().split(/\r?\n/)[0]; if (!l) return null;
  const [nome, temp, uso, usada, total] = l.split(',').map((x) => x.trim());
  if (!nome || isNaN(Number(temp))) return null;
  return { nome, temp: Number(temp), uso: Number(uso), memUsada: Number(usada), memTotal: Number(total) };
}
async function status(hostPing = '1.1.1.1') {
  const total = os.totalmem(), livre = os.freemem();
  const ping = rodar('ping', WIN ? ['-n', '4', hostPing] : ['-c', '4', '-W', '2', hostPing], 15000);
  const cpu = WIN ? ps('[math]::Round((Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average)', {}, 15000)
    : Promise.resolve({ saida: String(Math.round(os.loadavg()[0] / os.cpus().length * 100)) });
  const smi = WIN && fs.existsSync('C:\\Windows\\System32\\nvidia-smi.exe') ? 'C:\\Windows\\System32\\nvidia-smi.exe' : 'nvidia-smi';
  const gpu = rodar(smi, ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], 10000);
  const [p, c, g] = await Promise.all([ping, cpu, gpu]);
  return { ram: Math.round((total - livre) / total * 100), ramGb: [(total - livre) / 1024 ** 3, total / 1024 ** 3], cpu: Number(String(c.saida || '').trim()) || null, gpu: lerNvidia(g.saida), ping: lerPing(p.saida) };
}

/* ================= Epic (de graça) e Steam (preço) ================= */
/** Jogos de graça agora e os próximos, do JSON da loja da Epic. Exportada para testes. */
function lerEpicGratis(d, agora = Date.now()) {
  const els = (((d || {}).data || {}).Catalog || {}).searchStore ? d.data.Catalog.searchStore.elements || [] : [];
  const agoraG = [], depois = [];
  for (const e of els) {
    const p = e.promotions; if (!p) continue;
    const slug = (e.offerMappings && e.offerMappings[0] && e.offerMappings[0].pageSlug) || e.productSlug || '';
    const url = slug ? 'https://store.epicgames.com/pt-BR/p/' + String(slug).replace(/\/home$/, '') : 'https://store.epicgames.com/pt-BR/free-games';
    for (const grupo of p.promotionalOffers || []) for (const o of grupo.promotionalOffers || []) {
      if (o.discountSetting && o.discountSetting.discountPercentage === 0 && Date.parse(o.startDate) <= agora && Date.parse(o.endDate) > agora) agoraG.push({ nome: e.title, ate: o.endDate, url });
    }
    for (const grupo of p.upcomingPromotionalOffers || []) for (const o of grupo.promotionalOffers || []) {
      if (o.discountSetting && o.discountSetting.discountPercentage === 0) depois.push({ nome: e.title, de: o.startDate, url });
    }
  }
  return { agora: agoraG, depois };
}
async function pegarJson(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'accept-language': 'pt-BR' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function epicGratis() {
  try { return lerEpicGratis(await pegarJson('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR')); }
  catch (e) { return { erro: String(e && e.message || e) }; }
}
async function precoSteam(busca) {
  try {
    const r = await pegarJson('https://store.steampowered.com/api/storesearch/?l=portuguese&cc=br&term=' + encodeURIComponent(String(busca).slice(0, 80)));
    const it = (r.items || []).filter((i) => i.type === 'app');
    if (!it.length) return { naoAchei: true };
    const alvo = norm(busca), j = it.find((i) => norm(i.name) === alvo) || it[0];
    const d = await pegarJson(`https://store.steampowered.com/api/appdetails?appids=${j.id}&cc=br&filters=price_overview`).catch(() => null);
    const po = d && d[j.id] && d[j.id].data && d[j.id].data.price_overview;
    const url = `https://store.steampowered.com/app/${j.id}`;
    if (!po && !j.price) return { nome: j.name, gratis: true, url };
    const p = po || { final: j.price.final, initial: j.price.initial, discount_percent: j.price.initial ? Math.round((1 - j.price.final / j.price.initial) * 100) : 0 };
    return { nome: j.name, preco: p.final / 100, original: p.initial / 100, desconto: p.discount_percent || 0, url, id: j.id };
  } catch (e) { return { erro: String(e && e.message || e) }; }
}

/* ================= manchetes (resumo da manhã) ================= */
/** Títulos do RSS do Google Notícias. Exportada para testes. */
function lerManchetes(xml, n = 3) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)) {
    const t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    out.push(t.replace(/\s+-\s+[^-]+$/, '')); // tira o " - Nome do jornal"
    if (out.length >= n) break;
  }
  return out;
}
async function manchetes() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch('https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419', { signal: ctl.signal }); return lerManchetes(await r.text()); }
  catch (_) { return []; } finally { clearTimeout(t); }
}

module.exports = {
  teclas, ATALHOS_CLIPE, ATALHOS_PRINT, listar, abrirJogo, modoJogo, sugerirFechar, status, epicGratis, precoSteam, manchetes,
  // para testes
  codigosTeclas, bibliotecasSteam, manifestoSteam, manifestoEpic, escolherJogo, lerPing, lerNvidia, lerEpicGratis, lerManchetes,
};
