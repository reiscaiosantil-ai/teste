/* Lumi — mexe no computador a pedido: memória RAM, antivírus (Microsoft Defender), abrir e fechar apps,
   abrir conversa no WhatsApp, sair de ligação e desligar/reiniciar (com senha).
   No Windows tudo passa pelo PowerShell; o texto falado nunca vira código: vai por variável de ambiente.
   As partes de "decidir" (achar o app, escolher a janela da ligação, conferir a senha) são funções puras, testadas. */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';

/* ================= utilidades ================= */
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Roda um script do PowerShell (sem janela) e devolve { codigo, saida, erro }. `env` vai para o script como $env:NOME. */
function ps(script, env = {}, ms = 60000) {
  return new Promise((ok) => {
    if (!WIN) { ok({ falhou: 'só no Windows' }); return; }
    const codigo = Buffer.from('[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ProgressPreference="SilentlyContinue"\n' + script, 'utf16le').toString('base64');
    let saida = '', erro = '', fim = false;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codigo],
      { windowsHide: true, env: { ...process.env, ...env } });
    const t = setTimeout(() => { if (!fim) { fim = true; try { p.kill(); } catch (_) { /* já saiu */ } ok({ tempoEsgotado: true, saida, erro }); } }, ms);
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8'); // acentos não quebram entre um pedaço e outro
    p.stdout.on('data', (d) => { saida += d; });
    p.stderr.on('data', (d) => { erro += d; });
    p.on('error', (e) => { if (!fim) { fim = true; clearTimeout(t); ok({ falhou: e.message, saida, erro }); } });
    p.on('close', (c) => { if (!fim) { fim = true; clearTimeout(t); ok({ codigo: c, saida, erro }); } });
  });
}
function json(r) {
  const s = String((r && r.saida) || '').trim();
  if (!s) return null;
  try { return JSON.parse(s.slice(s.search(/[[{]/))); } catch (_) { return null; }
}
function rodar(exe, args, ms = 20000) {
  return new Promise((ok) => {
    let saida = '';
    const p = spawn(exe, args, { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch (_) { /* já saiu */ } }, ms);
    p.stdout.on('data', (d) => { saida += d; });
    p.on('error', (e) => { clearTimeout(t); ok({ falhou: e.message }); });
    p.on('close', (codigo) => { clearTimeout(t); ok({ codigo, saida }); });
  });
}

/* ================= nomes amigáveis e processos protegidos ================= */
const NOMES = {
  chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', opera_gx: 'Opera GX', vivaldi: 'Vivaldi',
  spotify: 'Spotify', whatsapp: 'WhatsApp', 'whatsapp.root': 'WhatsApp', 'ms-teams': 'Microsoft Teams', teams: 'Microsoft Teams', zoom: 'Zoom',
  discord: 'Discord', telegram: 'Telegram', code: 'VS Code', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook', olk: 'Outlook',
  onenote: 'OneNote', notepad: 'Bloco de Notas', explorer: 'Explorador de Arquivos', msmpeng: 'Microsoft Defender (antivírus)', mpdefendercoreservice: 'Microsoft Defender (antivírus)',
  memcompression: 'Compressão de memória do Windows', dwm: 'Janelas do Windows', svchost: 'Serviços do Windows', searchhost: 'Pesquisa do Windows', searchapp: 'Pesquisa do Windows',
  steam: 'Steam', steamwebhelper: 'Steam', obs64: 'OBS Studio', capcut: 'CapCut', photoshop: 'Photoshop', afterfx: 'After Effects', 'adobe premiere pro': 'Premiere Pro',
  notion: 'Notion', figma: 'Figma', claude: 'Claude', onedrive: 'OneDrive', msedgewebview2: 'WebView do Windows (usado por apps)', vmmem: 'Máquinas virtuais (WSL/Docker)',
  vmmemwsl: 'WSL (Linux no Windows)', 'docker desktop': 'Docker Desktop', lumi: 'Lumi (eu)', electron: 'Lumi (eu)', calculatorapp: 'Calculadora', mspaint: 'Paint',
  epicgameslauncher: 'Epic Games', riotclientservices: 'Riot Client', leagueclient: 'League of Legends', valorant: 'Valorant', 'acrobat': 'Adobe Acrobat', acrord32: 'Adobe Reader',
  anydesk: 'AnyDesk', 'idea64': 'IntelliJ IDEA', 'canva': 'Canva', 'msteams': 'Microsoft Teams', 'skype': 'Skype', 'slack': 'Slack', 'vlc': 'VLC', 'winrar': 'WinRAR',
};
const PROTEGIDOS = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso', 'svchost', 'dwm', 'fontdrvhost',
  'memcompression', 'msmpeng', 'mpdefendercoreservice', 'nissrv', 'securityhealthservice', 'securityhealthsystray', 'sihost', 'ctfmon', 'explorer', 'taskhostw', 'spoolsv',
  'audiodg', 'lumi', 'electron', 'searchhost', 'searchindexer', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'conhost', 'runtimebroker', 'wudfhost',
  'smartscreen', 'dllhost', 'lsm', 'wmiprvse', 'powershell', 'msedgewebview2', 'applicationframehost', 'systemsettings', 'secure system', 'vmmem', 'vmmemwsl']);
const rotulo = (nome) => NOMES[String(nome).toLowerCase()] || String(nome);

// apelidos falados → nomes de processo
const APELIDOS = [
  [/^(?:o )?navegador(?:es)?$|^internet$/, ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'vivaldi']],
  [/chrome|google chrome/, ['chrome']], [/^edge$|microsoft edge/, ['msedge']], [/firefox/, ['firefox']], [/brave/, ['brave']], [/^opera/, ['opera', 'opera_gx']],
  [/whats|^zap$|zapzap/, ['whatsapp', 'whatsapp.root']], [/teams/, ['ms-teams', 'teams', 'msteams']], [/zoom/, ['zoom']], [/discord/, ['discord']], [/telegram/, ['telegram']],
  [/spotify/, ['spotify']], [/^word$/, ['winword']], [/excel|planilha/, ['excel']], [/power ?point|apresenta/, ['powerpnt']], [/outlook/, ['outlook', 'olk']],
  [/bloco de notas|notepad/, ['notepad']], [/vs ?code|visual studio code|^code$/, ['code']], [/calculadora/, ['calculatorapp', 'calc']], [/^obs/, ['obs64']],
  [/premiere/, ['adobe premiere pro']], [/photoshop/, ['photoshop']], [/after effects/, ['afterfx']], [/steam/, ['steam', 'steamwebhelper']], [/capcut/, ['capcut']],
  [/notion/, ['notion']], [/figma/, ['figma']], [/paint/, ['mspaint']], [/docker/, ['docker desktop']], [/^claude$/, ['claude']], [/slack/, ['slack']], [/vlc/, ['vlc']],
];

/**
 * Decide quais processos fechar para um pedido falado ("fecha o chrome", "fecha o documento relatório").
 * @param {string} alvo
 * @param {{nome:string,pid:number,titulo?:string}[]} lista  processos em execução
 * @returns {{nomes:string[], pids:number[], protegido?:string}}
 */
function escolherProcessos(alvo, lista) {
  const a = norm(alvo).replace(/^(?:o|a|os|as|meu|minha|programa|aplicativo|app)\s+/, '').replace(/\s+(?:pra mim|por favor|agora)$/, '').trim();
  if (!a) return { nomes: [], pids: [] };
  let nomes = [];
  const ap = APELIDOS.find(([re]) => re.test(a));
  if (ap) nomes = ap[1];
  else {
    const comNome = lista.filter((p) => { const n = norm(p.nome), r = norm(rotulo(p.nome)); return n === a || r === a || (` ${r} `).includes(` ${a} `) || (a.length >= 4 && n.startsWith(a)); });
    if (comNome.length) nomes = [...new Set(comNome.map((p) => p.nome.toLowerCase()))];
    else if (a.length >= 3) { // pelo título da janela ("fecha o relatório")
      const t = lista.filter((p) => p.titulo && (` ${norm(p.titulo)} `).includes(` ${a} `));
      if (t.length) {
        const prot = t.find((p) => PROTEGIDOS.has(p.nome.toLowerCase()));
        const ok = t.filter((p) => !PROTEGIDOS.has(p.nome.toLowerCase()));
        if (!ok.length && prot) return { nomes: [], pids: [], protegido: rotulo(prot.nome) };
        return { nomes: [...new Set(ok.map((p) => p.nome.toLowerCase()))], pids: ok.map((p) => p.pid), porTitulo: true };
      }
    }
  }
  const prot = nomes.find((n) => PROTEGIDOS.has(n));
  nomes = nomes.filter((n) => !PROTEGIDOS.has(n));
  const pids = lista.filter((p) => nomes.includes(p.nome.toLowerCase())).map((p) => p.pid);
  if (!pids.length && prot) return { nomes: [], pids: [], protegido: rotulo(prot) };
  return { nomes: [...new Set(lista.filter((p) => pids.includes(p.pid)).map((p) => p.nome.toLowerCase()))], pids };
}

/* ================= memória RAM e processador ================= */
const PS_MEMORIA = `
$n=[Environment]::ProcessorCount; $a=@{}
foreach ($p in Get-Process) { try { $a[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds } catch {} }
Start-Sleep -Milliseconds 800
$g = Get-Process | Group-Object ProcessName | ForEach-Object {
  $cpu=0; foreach ($p in $_.Group) { try { if ($a.ContainsKey($p.Id)) { $cpu += $p.TotalProcessorTime.TotalMilliseconds - $a[$p.Id] } } catch {} }
  $w = $_.Group | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
  [pscustomobject]@{ n=$_.Name; b=($_.Group | Measure-Object WorkingSet64 -Sum).Sum; q=$_.Count; c=[math]::Round($cpu/8/$n,1); t=$(if ($w) { $w.MainWindowTitle } else { '' }); g=$_.Group }
} | Sort-Object b -Descending | Select-Object -First 16
$s = foreach ($x in $g) { $d=''; try { $d=($x.g | Select-Object -First 1).Description } catch {}; [pscustomobject]@{ nome=$x.n; mb=[math]::Round($x.b/1MB); qtd=$x.q; cpu=$x.c; titulo=$x.t; desc=[string]$d } }
@($s) | ConvertTo-Json -Compress
`;

function resumoMemoria(apps, total, livre) {
  const usado = total - livre, pct = Math.round(usado / total * 100);
  const gb = (b) => (b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const mb = (m) => (m >= 1024 ? `${(m / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB` : `${m} MB`);
  const top = apps.filter((x) => !/^(?:Serviços|Compressão|Janelas) do Windows|Compressão de memória/.test(x.rotulo)).slice(0, 3);
  let texto = `Você está usando ${gb(usado)} de ${gb(total)} GB de memória (${pct}%).`;
  if (top.length) texto += ` Quem mais gasta: ${top.map((x) => `${x.rotulo} com ${mb(x.mb)}`).join(', ').replace(/, ([^,]*)$/, ' e $1')}.`;
  if (pct >= 85) texto += ' Está quase cheia: fechar um desses programas deixa o PC mais leve.';
  const cpu = apps.filter((x) => x.cpu >= 25).sort((x, y) => y.cpu - x.cpu)[0];
  if (cpu) texto += ` No processador, quem mais pesa agora é ${cpu.rotulo} (${Math.round(cpu.cpu)}%).`;
  return { texto, pct };
}

async function memoria() {
  const total = os.totalmem(), livre = os.freemem();
  let apps = [];
  if (WIN) {
    const r = json(await ps(PS_MEMORIA, {}, 30000));
    apps = (Array.isArray(r) ? r : r ? [r] : []).map((x) => ({ nome: x.nome, mb: x.mb, qtd: x.qtd, cpu: x.cpu || 0, titulo: x.titulo || '', desc: x.desc || '' }));
  } else {
    const r = await rodar('ps', ['-eo', 'comm=,rss=,pcpu=']);
    const m = new Map();
    for (const l of String(r.saida || '').split('\n')) {
      const p = l.trim().match(/^(.*\S)\s+(\d+)\s+([\d.]+)$/); if (!p) continue;
      const k = p[1]; const v = m.get(k) || { nome: k, mb: 0, qtd: 0, cpu: 0, titulo: '', desc: '' };
      v.mb += Number(p[2]) / 1024; v.qtd++; v.cpu += Number(p[3]); m.set(k, v);
    }
    apps = [...m.values()].map((v) => ({ ...v, mb: Math.round(v.mb), cpu: Math.round(v.cpu * 10) / 10 })).sort((a, b) => b.mb - a.mb).slice(0, 16);
  }
  apps = apps.map((x) => {
    const k = String(x.nome).toLowerCase();
    return { ...x, rotulo: NOMES[k] || (x.desc && x.desc.length < 40 ? x.desc : x.nome), protegido: PROTEGIDOS.has(k) };
  });
  return { total, livre, apps, ...resumoMemoria(apps, total, livre) };
}

/* ================= fechar e abrir apps ================= */
const PS_LISTA = `@(Get-Process | Select-Object @{n='nome';e={$_.ProcessName}}, @{n='pid';e={$_.Id}}, @{n='titulo';e={$_.MainWindowTitle}}) | ConvertTo-Json -Compress`;
async function processos() {
  if (WIN) { const r = json(await ps(PS_LISTA, {}, 20000)); return Array.isArray(r) ? r : r ? [r] : []; }
  const r = await rodar('ps', ['-eo', 'pid=,comm=']);
  return String(r.saida || '').split('\n').map((l) => l.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), nome: m[2], titulo: '' }));
}

const PS_FECHAR = `
$ids = $env:LUMI_PIDS -split ',' | ForEach-Object { [int]$_ }
foreach ($i in $ids) { $p = Get-Process -Id $i -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { [void]$p.CloseMainWindow() } }
if ($env:LUMI_FORCAR -eq '1') { Start-Sleep -Milliseconds 300; foreach ($i in $ids) { Stop-Process -Id $i -Force -ErrorAction SilentlyContinue } }
else { for ($k=0; $k -lt 16; $k++) { Start-Sleep -Milliseconds 250; if (-not (Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })) { break } } }
Start-Sleep -Milliseconds 400
@(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object @{n='nome';e={$_.ProcessName}}, @{n='pid';e={$_.Id}}, @{n='janela';e={$_.MainWindowHandle -ne 0}}) | ConvertTo-Json -Compress
`;
/** Fecha um app pelo nome falado (ou pelo nome do processo, vindo do botão "Fechar"). Primeiro pede para fechar (o app pode perguntar se quer salvar); `forcar` encerra. */
async function fechar(alvo, { forcar = false, processo = '' } = {}) {
  const lista = await processos();
  const e = processo ? (PROTEGIDOS.has(processo.toLowerCase()) ? { nomes: [], pids: [], protegido: rotulo(processo) }
    : { nomes: [processo.toLowerCase()], pids: lista.filter((p) => p.nome.toLowerCase() === processo.toLowerCase()).map((p) => p.pid) })
    : escolherProcessos(alvo, lista);
  if (e.protegido) return { protegido: e.protegido };
  if (!e.pids.length) return { naoAchei: true };
  const nomes = [...new Set(e.nomes.map(rotulo))];
  if (!WIN) {
    for (const pid of e.pids) { try { process.kill(pid, forcar ? 'SIGKILL' : 'SIGTERM'); } catch (_) { /* já saiu */ } }
    return { fechados: nomes, restantes: [] };
  }
  const r = json(await ps(PS_FECHAR, { LUMI_PIDS: e.pids.join(','), LUMI_FORCAR: forcar ? '1' : '0' }, 30000));
  const ficaram = (Array.isArray(r) ? r : r ? [r] : []);
  // processos de fundo (abas do Chrome etc.) saem sozinhos depois da janela; só conta o que ainda tem janela
  const restantes = [...new Set(ficaram.filter((p) => forcar || p.janela).map((p) => rotulo(p.nome)))];
  return { fechados: nomes.filter((n) => !restantes.includes(n)), restantes, processo: e.nomes[0] };
}

// apps do sistema que têm comando próprio
const COMANDOS = [
  [/^calculadora$/, 'calc.exe', 'Calculadora'], [/^(?:bloco de notas|notepad)$/, 'notepad.exe', 'Bloco de Notas'],
  [/^(?:explorador(?: de arquivos)?|arquivos|meus arquivos|pastas?)$/, 'explorer.exe', 'Explorador de Arquivos'], [/^paint$/, 'mspaint.exe', 'Paint'],
  [/^(?:gerenciador de tarefas|task manager)$/, 'taskmgr.exe', 'Gerenciador de Tarefas'], [/^(?:configura[cç](?:[oõ]es|ao)|ajustes do windows|painel de controle)$/, 'ms-settings:', 'Configurações'],
  [/^(?:seguran[cç]a do windows|antiv[ií]rus|defender|windows defender)$/, 'windowsdefender:', 'Segurança do Windows'],
];
const EVITAR_START = /desinstal|uninstall|leia-?me|readme|help|ajuda|documenta|manual|release notes|website|site da web/;
/** Escolhe o app do menu Iniciar que melhor combina com o nome falado. Exportada para testes. */
function escolherApp(alvo, apps) {
  const a = norm(alvo); if (!a) return null;
  let melhor = null, nota = 0;
  for (const app of apps) {
    const n = norm(app.nome); if (!n || EVITAR_START.test(n)) continue;
    let s = 0;
    if (n === a) s = 100;
    else if (n.startsWith(a + ' ')) s = 80;
    else if ((` ${n} `).includes(` ${a} `)) s = 60;
    else if (a.length >= 4 && n.replace(/ /g, '').includes(a.replace(/ /g, ''))) s = 40;
    if (s) s -= Math.min(20, n.length / 4); // prefere nomes curtos ("Word" a "Word Mobile Viewer")
    if (s > nota) { nota = s; melhor = app; }
  }
  return melhor;
}
let cacheStart = { t: 0, apps: [] };
async function appsIniciar() {
  if (Date.now() - cacheStart.t < 10 * 60000 && cacheStart.apps.length) return cacheStart.apps;
  const r = json(await ps('@(Get-StartApps | Select-Object @{n="nome";e={$_.Name}}, @{n="id";e={$_.AppID}}) | ConvertTo-Json -Compress', {}, 20000));
  const apps = Array.isArray(r) ? r : r ? [r] : [];
  if (apps.length) cacheStart = { t: Date.now(), apps };
  return apps;
}
function lancar(exe, args = []) {
  try { const p = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false }); p.on('error', () => {}); p.unref(); return true; } catch (_) { return false; }
}
/** Abre um app instalado pelo nome falado. Devolve { ok, nome } ou { naoAchei }. `abrirUrl` abre protocolos (spotify:, ms-settings:…). */
async function abrir(alvo, abrirUrl) {
  if (!WIN) return { indisponivel: true };
  const a = norm(alvo).replace(/^(?:o|a|meu|minha|programa|aplicativo|app)\s+/, '').trim();
  const cmd = COMANDOS.find(([re]) => re.test(a));
  const app = escolherApp(a, await appsIniciar());
  if (app && (!cmd || norm(app.nome) === a)) { lancar('explorer.exe', ['shell:AppsFolder\\' + app.id]); return { ok: true, nome: app.nome }; }
  if (cmd) {
    if (/:$/.test(cmd[1])) { try { await abrirUrl(cmd[1]); return { ok: true, nome: cmd[2] }; } catch (_) { return { naoAchei: true }; } }
    return lancar(cmd[1]) ? { ok: true, nome: cmd[2] } : { naoAchei: true };
  }
  return { naoAchei: true };
}

/* ================= janelas: ligação e WhatsApp ================= */
const PS_JANELAS = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class LumiJan {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$l = New-Object System.Collections.ArrayList
[LumiJan]::EnumWindows({ param($h, $x) if ([LumiJan]::IsWindowVisible($h)) { $s = New-Object System.Text.StringBuilder 512; [void][LumiJan]::GetWindowText($h, $s, 512); if ($s.Length) { [uint32]$p = 0; [void][LumiJan]::GetWindowThreadProcessId($h, [ref]$p); $n = ''; try { $n = (Get-Process -Id $p).ProcessName } catch {}; [void]$l.Add(@{ h = $h.ToInt64(); pid = [int]$p; proc = $n; titulo = $s.ToString() }) } }; $true }, [IntPtr]::Zero) | Out-Null
@($l) | ConvertTo-Json -Compress
`;
const PS_FOCAR_E_TECLAR = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class LumiFoco {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
Add-Type -AssemblyName System.Windows.Forms
$h = [IntPtr][int64]$env:LUMI_JANELA
if ($h -ne [IntPtr]::Zero) {
  if ([LumiFoco]::IsIconic($h)) { [void][LumiFoco]::ShowWindow($h, 9) }
  [LumiFoco]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [LumiFoco]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)  # Alt solto: o Windows deixa trocar a janela da frente
  [void][LumiFoco]::SetForegroundWindow($h)
  if ($env:LUMI_PID) { [void](New-Object -ComObject WScript.Shell).AppActivate([int]$env:LUMI_PID) }
  Start-Sleep -Milliseconds 500
}
foreach ($passo in ($env:LUMI_TECLAS -split '\\|\\|')) {
  if ($passo -match '^espera:(\\d+)$') { Start-Sleep -Milliseconds ([int]$matches[1]) }
  elseif ($passo -eq 'texto') { [System.Windows.Forms.SendKeys]::SendWait($env:LUMI_TEXTO) }
  elseif ($passo) { [System.Windows.Forms.SendKeys]::SendWait($passo) }
}
'ok'
`;
async function janelas() { const r = json(await ps(PS_JANELAS, {}, 25000)); return Array.isArray(r) ? r : r ? [r] : []; }
async function focarETeclar(janela, teclas, texto = '') {
  return ps(PS_FOCAR_E_TECLAR, { LUMI_JANELA: String((janela && janela.h) || 0), LUMI_PID: janela && janela.pid ? String(janela.pid) : '', LUMI_TECLAS: teclas.join('||'), LUMI_TEXTO: texto }, 20000);
}
const NAVEGADORES = /^(?:chrome|msedge|firefox|brave|opera|opera_gx|vivaldi|arc)$/i;
/**
 * Acha a ligação aberta e o atalho de sair dela. Exportada para testes.
 * Google Meet (aba do navegador): fecha a aba · Zoom: Alt+Q e Enter · Teams: Ctrl+Shift+H. WhatsApp e Discord não têm atalho padrão para desligar.
 */
function escolherLigacao(lista) {
  const meet = lista.find((j) => NAVEGADORES.test(j.proc) && /(?:^|\s)Meet\s*[-–:]|meet\.google|Google Meet/i.test(j.titulo));
  if (meet) return { app: 'Google Meet', janela: meet, teclas: ['^w'] };
  const zoom = lista.find((j) => /^zoom$/i.test(j.proc) && /reuni[aã]o|meeting|webinar/i.test(j.titulo)) || lista.find((j) => /^zoom$/i.test(j.proc) && /^Zoom$/i.test(j.titulo));
  if (zoom) return { app: 'Zoom', janela: zoom, teclas: ['%q', 'espera:900', '{ENTER}'] };
  const teams = lista.find((j) => /teams/i.test(j.proc) && /reuni[aã]o|meeting|chamada|call|\bcom\b|\bwith\b/i.test(j.titulo) && !/^Microsoft Teams$/i.test(j.titulo))
    || lista.find((j) => /teams/i.test(j.proc));
  if (teams) return { app: 'Microsoft Teams', janela: teams, teclas: ['^+h'] };
  return null;
}
async function sairLigacao() {
  if (!WIN) return { indisponivel: true };
  const l = escolherLigacao(await janelas());
  if (!l) return { nenhuma: true };
  await focarETeclar(l.janela, l.teclas);
  return { app: l.app };
}

// SendKeys trata + ^ % ~ ( ) { } [ ] como comandos: escapa tudo
const escaparTeclas = (t) => String(t || '').replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);
/** Abre a conversa com alguém no WhatsApp do computador: pelo número (whatsapp://send) ou pela busca de conversas. */
async function conversa(contato, abrirUrl) {
  const c = String(contato || '').replace(/\s+(?:no|pelo)\s+(?:whatsapp|whats|zap)$/i, '').trim();
  const digitos = c.replace(/\D/g, '');
  if (digitos.length >= 10 && digitos.length / c.replace(/\s/g, '').length > 0.7) {
    const numero = digitos.length <= 11 ? '55' + digitos : digitos;
    try { await abrirUrl((WIN && (await appsIniciar()).some((a) => /whatsapp/i.test(a.nome)) ? 'whatsapp://send?phone=' : 'https://wa.me/') + numero); return { ok: true, por: 'numero', contato: c }; } catch (_) { return { semWhatsapp: true }; }
  }
  if (!WIN) return { indisponivel: true };
  if (!(await appsIniciar()).some((a) => /whatsapp/i.test(a.nome))) return { semWhatsapp: true };
  try { await abrirUrl('whatsapp:'); } catch (_) { return { semWhatsapp: true }; }
  let jan = null;
  for (let i = 0; i < 12 && !jan; i++) { await new Promise((r) => setTimeout(r, 700)); jan = (await janelas()).find((j) => /^whatsapp/i.test(j.proc)); }
  if (!jan) return { semWhatsapp: true };
  await focarETeclar(jan, ['espera:600', '^f', 'espera:500', '^a', 'texto', 'espera:1500', '{ENTER}'], escaparTeclas(c));
  return { ok: true, por: 'busca', contato: c };
}

/* ================= energia (com senha) ================= */
const SENHA_PADRAO = 'sabado';
const normSenha = (t) => norm(t).replace(/\s+/g, ' ');
const hash = (sal, t) => crypto.createHash('sha256').update(sal + ':' + normSenha(t)).digest('hex');
function lerSeguranca(pasta) {
  try { const d = JSON.parse(fs.readFileSync(path.join(pasta, 'seguranca.json'), 'utf8')); if (d && d.sal && d.hash) return d; } catch (_) { /* ainda não tem */ }
  const sal = crypto.randomBytes(8).toString('hex');
  return { sal, hash: hash(sal, SENHA_PADRAO), padrao: true };
}
/** A senha vale dita sozinha ou dentro da frase ("a senha é sábado"); sem acento e sem diferença de maiúsculas. */
function confereSenha(dito, seg) {
  const d = normSenha(dito); if (!d) return false;
  const p = d.split(' ');
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j <= Math.min(p.length, i + 4); j++) if (hash(seg.sal, p.slice(i, j).join(' ')) === seg.hash) return true;
  return false;
}
function trocarSenha(pasta, atual, nova) {
  const seg = lerSeguranca(pasta);
  if (!confereSenha(atual, seg)) return { erro: 'A senha atual não confere.' };
  if (normSenha(nova).length < 3) return { erro: 'A senha nova precisa ter pelo menos 3 letras.' };
  const sal = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'seguranca.json'), JSON.stringify({ sal, hash: hash(sal, nova) }), 'utf8');
  return { ok: true };
}
const tentativas = [];
async function energia(acao, senha, pasta, nome = 'A assistente', segundos = 30) {
  const seg = Math.min(86400, Math.max(30, Math.round(Number(segundos) || 30)));
  if (acao === 'cancelar') { if (!WIN) return { indisponivel: true }; const r = await rodar('shutdown.exe', ['/a']); return { ok: r.codigo === 0, nadaAgendado: r.codigo !== 0 }; }
  if (acao === 'bloquear') { if (!WIN) return { indisponivel: true }; lancar('rundll32.exe', ['user32.dll,LockWorkStation']); return { ok: true }; }
  if (acao !== 'desligar' && acao !== 'reiniciar') return { erro: 'ação desconhecida' };
  const agora = Date.now(); while (tentativas.length && agora - tentativas[0] > 10 * 60000) tentativas.shift();
  if (tentativas.length >= 5) return { bloqueado: true };
  if (!confereSenha(senha, lerSeguranca(pasta))) { tentativas.push(agora); return { senhaErrada: true }; }
  if (!WIN) return { indisponivel: true, senhaOk: true };
  const quando = seg < 120 ? `${seg} segundos` : `${Math.round(seg / 60)} minutos`;
  const msg = `${nome} vai ${acao === 'desligar' ? 'desligar' : 'reiniciar'} o computador em ${quando}. Salve o que estiver aberto.`;
  const r = await rodar('shutdown.exe', [acao === 'desligar' ? '/s' : '/r', '/t', String(seg), '/c', msg]);
  return r.codigo === 0 ? { ok: true, segundos: seg } : { erro: 'O Windows não aceitou o pedido de ' + acao + '.' };
}

/* ================= antivírus (Microsoft Defender) e saúde do PC ================= */
const PS_PROTECAO = `
$r=@{}
try { $s = Get-MpComputerStatus -ErrorAction Stop
  $r.servico=[bool]$s.AMServiceEnabled; $r.ativo=[bool]$s.AntivirusEnabled; $r.tempoReal=[bool]$s.RealTimeProtectionEnabled; $r.modo=[string]$s.AMRunningMode
  $r.adulteracao=[bool]$s.IsTamperProtected; $r.idadeAssinatura=$s.AntivirusSignatureAge
  if ($s.AntivirusSignatureLastUpdated) { $r.assinaturas=$s.AntivirusSignatureLastUpdated.ToString('o') }
  if ($s.QuickScanEndTime) { $r.rapida=$s.QuickScanEndTime.ToString('o') }
  if ($s.FullScanEndTime) { $r.completa=$s.FullScanEndTime.ToString('o') }
} catch { $r.erroDefender = $_.Exception.Message }
try { $r.produtos = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct -ErrorAction Stop | ForEach-Object { $_.displayName }) } catch {}
try { $r.ameacas = @(Get-MpThreatDetection -ErrorAction Stop | Sort-Object InitialDetectionTime -Descending | Select-Object -First 8 | ForEach-Object {
  $t = Get-MpThreat -ThreatID $_.ThreatID -ErrorAction SilentlyContinue
  @{ nome = $(if ($t) { $t.ThreatName } else { [string]$_.ThreatID }); quando = $_.InitialDetectionTime.ToString('o'); resolvida = [bool]$_.ActionSuccess; ativa = $(if ($t) { [bool]$t.IsActive } else { $false }); arquivos = @($_.Resources | Select-Object -First 2) } }) } catch { $r.erroHistorico = $_.Exception.Message }
try { $r.firewall = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { @{ nome = [string]$_.Name; ligado = [bool]$_.Enabled } }) } catch {}
try { $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"; $r.discoLivre=[int64]$d.FreeSpace; $r.discoTotal=[int64]$d.Size } catch {}
try { $r.ligadoDesde = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o') } catch {}
$r | ConvertTo-Json -Compress -Depth 4
`;
async function protecao() {
  if (!WIN) return { indisponivel: true };
  const r = json(await ps(PS_PROTECAO, {}, 45000)) || { erroDefender: 'Não consegui ler o estado do antivírus.' };
  return { ...r, resumo: resumoProtecao(r) };
}

/** Frase curta sobre a proteção, para a assistente falar. Exportada para testes. */
function resumoProtecao(p, agora = Date.now()) {
  if (!p || p.indisponivel) return 'A verificação do antivírus só funciona no Windows.';
  const outros = (p.produtos || []).filter((x) => !/defender/i.test(x));
  const partes = [];
  if (p.erroDefender && !outros.length) return 'Não consegui ler o Microsoft Defender. ' + String(p.erroDefender).slice(0, 120);
  if (outros.length && (!p.ativo || /passiv/i.test(p.modo || ''))) partes.push(`O antivírus principal é o ${outros.join(' e ')}; o Defender fica de reserva.`);
  else if (p.ativo && p.tempoReal) partes.push('O Microsoft Defender está ligado, com proteção em tempo real.');
  else if (p.ativo) partes.push('O Defender está ligado, mas a proteção em tempo real está DESLIGADA.');
  else partes.push('Atenção: o antivírus parece desligado.');
  if (p.idadeAssinatura > 3) partes.push(`As definições de vírus estão desatualizadas há ${p.idadeAssinatura} dias.`);
  const ativas = (p.ameacas || []).filter((a) => a.ativa || !a.resolvida);
  const recentes = (p.ameacas || []).filter((a) => agora - Date.parse(a.quando) < 30 * 864e5);
  if (ativas.length) partes.push(`Tem ${ativas.length} ameaça${ativas.length > 1 ? 's' : ''} ainda não resolvida${ativas.length > 1 ? 's' : ''}: ${ativas.slice(0, 2).map((a) => a.nome).join(', ')}.`);
  else if (recentes.length) partes.push(`Ele bloqueou ${recentes.length} ameaça${recentes.length > 1 ? 's' : ''} no último mês, todas resolvidas.`);
  else partes.push('Nenhuma ameaça encontrada.');
  if (p.firewall && p.firewall.length && p.firewall.some((f) => !f.ligado)) partes.push('O firewall está desligado em algum perfil de rede.');
  if (p.discoTotal && p.discoLivre / p.discoTotal < 0.1) partes.push(`O disco C está quase cheio: só ${Math.round(p.discoLivre / 1024 ** 3)} GB livres.`);
  if (p.rapida) { const d = Math.floor((agora - Date.parse(p.rapida)) / 864e5); if (d > 7) partes.push(`A última verificação rápida foi há ${d} dias.`); }
  return partes.join(' ');
}

let verificando = null;
const PS_VERIFICAR = `
$ini = Get-Date
try {
  if ($env:LUMI_TIPO -eq 'pasta') { Start-MpScan -ScanType CustomScan -ScanPath $env:LUMI_PASTA -ErrorAction Stop }
  elseif ($env:LUMI_TIPO -eq 'completa') { Start-MpScan -ScanType FullScan -ErrorAction Stop }
  else { Start-MpScan -ScanType QuickScan -ErrorAction Stop }
  $a = @()
  try { $a = @(Get-MpThreatDetection -ErrorAction Stop | Where-Object { $_.InitialDetectionTime -ge $ini.AddMinutes(-1) } | ForEach-Object { $t = Get-MpThreat -ThreatID $_.ThreatID -ErrorAction SilentlyContinue; @{ nome = $(if ($t) { $t.ThreatName } else { [string]$_.ThreatID }); resolvida = [bool]$_.ActionSuccess; arquivos = @($_.Resources | Select-Object -First 2) } }) } catch {}
  @{ ok = $true; ameacas = $a; segundos = [int]((Get-Date) - $ini).TotalSeconds } | ConvertTo-Json -Compress -Depth 4
} catch { @{ erro = $_.Exception.Message } | ConvertTo-Json -Compress }
`;
/** Roda uma verificação do Defender: 'rapida', 'pasta' (Downloads) ou 'completa'. Só uma por vez. */
function verificar(tipo, pastaDownloads) {
  if (!WIN) return Promise.resolve({ indisponivel: true });
  if (verificando) return Promise.resolve({ jaRodando: verificando.tipo });
  const t = ['rapida', 'pasta', 'completa'].includes(tipo) ? tipo : 'rapida';
  const p = ps(PS_VERIFICAR, { LUMI_TIPO: t, LUMI_PASTA: pastaDownloads || '' }, t === 'completa' ? 6 * 3600e3 : 45 * 60e3).then((r) => {
    verificando = null;
    if (r.tempoEsgotado) return { erro: 'A verificação demorou demais e eu parei de esperar (ela pode continuar no Windows).' };
    return json(r) || { erro: String(r.erro || r.falhou || 'sem resposta do Defender').trim().slice(0, 200) };
  });
  verificando = { tipo: t, inicio: Date.now() };
  return p;
}
const estadoVerificacao = () => verificando;

async function atualizarProtecao() {
  if (!WIN) return { indisponivel: true };
  const r = await ps('try { Update-MpSignature -ErrorAction Stop; "ok" } catch { "erro: " + $_.Exception.Message }', {}, 10 * 60e3);
  const s = String(r.saida || '').trim();
  return /^ok/.test(s) ? { ok: true } : { erro: s.replace(/^erro:\s*/, '').slice(0, 200) || 'não consegui atualizar' };
}

module.exports = {
  memoria, fechar, abrir, conversa, sairLigacao, energia, trocarSenha, protecao, verificar, estadoVerificacao, atualizarProtecao,
  // para testes
  escolherProcessos, escolherApp, escolherLigacao, confereSenha, lerSeguranca, resumoProtecao, resumoMemoria, escaparTeclas, rotulo, PROTEGIDOS,
};
