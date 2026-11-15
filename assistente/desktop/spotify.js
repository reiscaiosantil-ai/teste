/* Lumi — enxerga e controla o aplicativo do Spotify instalado no computador.
   Sem login e sem chave:
   - Windows: lê o título da janela do Spotify ("Artista - Música" enquanto toca) e usa as teclas de mídia.
   - macOS: pergunta ao Spotify pelo AppleScript (osascript).
   Roda no processo principal do Electron; a página recebe só o estado já pronto. */
const { spawn, execFile } = require('child_process');

const VAZIO = { disponivel: true, aberto: false, tocando: false, musica: '', artista: '' };

/* ---------- capa do álbum: Deezer e, se não achar, Apple (iTunes). Grátis e sem chave. ---------- */
const capas = new Map();
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/ - .*(remaster|ao vivo|live|version|vers[aã]o).*$/, ' ')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Nota de 0 a 4: 2 pelo artista certo, 2 pelo nome da música. Exportada para testes. */
function pontuar(cand, musica, artista) {
  const a = norm(artista), m = norm(musica), ca = norm(cand.artista), cm = norm(cand.musica);
  let p = 0;
  if (a && ca) { const pa = a.split(' ').filter((w) => w.length > 2); if (pa.length && pa.filter((w) => ca.includes(w)).length >= Math.ceil(pa.length / 2)) p += 2; }
  if (m && cm) { if (cm === m || cm.startsWith(m) || m.startsWith(cm)) p += 2; else if (cm.includes(m) || m.includes(cm)) p += 1; }
  return p;
}
async function pegarJson(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function buscarCapa(musica, artista) {
  if (!norm(musica)) return null;
  const chave = norm(artista) + '|' + norm(musica);
  if (capas.has(chave)) return capas.get(chave);
  const termo = `${artista || ''} ${musica}`.replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
  const precisa = norm(artista) ? 3 : 2;
  let melhor = null, nota = 0;
  try {
    const d = await pegarJson('https://api.deezer.com/search?limit=6&q=' + encodeURIComponent(termo));
    for (const r of (d && d.data) || []) {
      const p = pontuar({ artista: r.artist && r.artist.name, musica: r.title }, musica, artista);
      const img = r.album && (r.album.cover_big || r.album.cover_xl || r.album.cover_medium);
      if (img && p > nota) { nota = p; melhor = img; }
    }
  } catch (_) { /* sem rede ou fora do ar: tenta a Apple */ }
  if (nota < precisa) {
    try {
      const d = await pegarJson('https://itunes.apple.com/search?entity=song&limit=6&country=BR&term=' + encodeURIComponent(termo));
      for (const r of (d && d.results) || []) {
        const p = pontuar({ artista: r.artistName, musica: r.trackName }, musica, artista);
        if (r.artworkUrl100 && p > nota) { nota = p; melhor = r.artworkUrl100.replace('100x100bb', '600x600bb'); }
      }
    } catch (_) { /* sem capa */ }
  }
  const url = nota >= precisa ? melhor : null;
  capas.set(chave, url); if (capas.size > 300) capas.delete(capas.keys().next().value);
  return url;
}

/** Título da janela no Windows → estado. "Spotify", "Spotify Free" e "Spotify Premium" = aberto e pausado. */
function interpretarTituloWindows(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return { ...VAZIO };
  if (/^spotify(?: free| premium)?$/i.test(t)) return { ...VAZIO, aberto: true };
  if (/^(?:advertisement|an[uú]ncio|spotify advertisement)$/i.test(t)) return { ...VAZIO, aberto: true, tocando: true, musica: 'Anúncio' };
  const i = t.indexOf(' - ');
  if (i < 0) return { ...VAZIO, aberto: true, tocando: true, musica: t };
  return { ...VAZIO, aberto: true, tocando: true, artista: t.slice(0, i).trim(), musica: t.slice(i + 3).trim() };
}

/** Saída do AppleScript no macOS ("estado|música|artista") → estado. */
function interpretarSaidaMac(saida) {
  const t = String(saida || '').trim();
  if (!t || t === 'fechado') return { ...VAZIO };
  const [estado, musica = '', artista = '', capa = ''] = t.split('|');
  const r = { ...VAZIO, aberto: true, tocando: estado === 'playing', musica: musica.trim(), artista: artista.trim() };
  if (/^https:\/\//.test(capa.trim())) r.capa = capa.trim();
  return r;
}

// fica de olho na janela do Spotify e escreve o título sempre que ele muda (1 processo só, leve)
const SCRIPT_WINDOWS = `
$ErrorActionPreference = 'SilentlyContinue'
$ultimo = '<inicio>'
while ($true) {
  $p = Get-Process -Name Spotify | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
  $t = if ($p) { $p.MainWindowTitle } else { '' }
  if ($t -ne $ultimo) { [Console]::Out.WriteLine('T:' + $t); [Console]::Out.Flush(); $ultimo = $t }
  Start-Sleep -Milliseconds 1000
}`;

// teclas de mídia do Windows: tocar/pausar, próxima, anterior
const TECLAS = { alternar: 0xB3, proxima: 0xB0, anterior: 0xB1 };
const scriptTecla = (vk) => `$k = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);' -Name Teclas -Namespace Lumi -PassThru
$k::keybd_event(${vk}, 0, 1, [UIntPtr]::Zero); $k::keybd_event(${vk}, 0, 3, [UIntPtr]::Zero)`;

const MAC_ESTADO = 'if application "Spotify" is running then\n tell application "Spotify"\n  if player state is stopped then return "stopped||"\n  return (player state as string) & "|" & (name of current track) & "|" & (artist of current track) & "|" & (artwork url of current track)\n end tell\nelse\n return "fechado"\nend if';
const MAC_COMANDO = { alternar: 'playpause', proxima: 'next track', anterior: 'previous track' };

const powershell = (script) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];

/**
 * Começa a acompanhar o Spotify.
 * @param {(estado: object) => void} aoMudar chamado sempre que a música ou o estado mudam
 * @returns {{ estado: () => object, comando: (acao: string) => Promise<boolean>, parar: () => void }}
 */
function iniciar(aoMudar) {
  let estado = { ...VAZIO, disponivel: process.platform === 'win32' || process.platform === 'darwin' };
  let proc = null, timer = null, parado = false, falhas = 0;
  const enviar = (novo) => {
    if (JSON.stringify(novo) === JSON.stringify(estado)) return;
    estado = novo; try { aoMudar(estado); } catch (_) { /* página fechada */ }
  };
  // junta a capa do álbum: a que o Spotify deu (Mac), a já conhecida, ou busca e manda quando chegar
  const publicar = (novo) => {
    if (novo.musica && !novo.capa) {
      const chave = norm(novo.artista) + '|' + norm(novo.musica);
      if (capas.has(chave)) novo = { ...novo, capa: capas.get(chave) || undefined };
      else {
        buscarCapa(novo.musica, novo.artista).then((url) => {
          if (url && estado.musica === novo.musica && estado.artista === novo.artista) enviar({ ...estado, capa: url });
        });
      }
      if (!novo.capa) delete novo.capa;
    }
    enviar(novo);
  };

  if (process.platform === 'win32') {
    const vigiar = () => {
      if (parado) return;
      let resto = '';
      proc = spawn('powershell.exe', powershell(SCRIPT_WINDOWS), { windowsHide: true });
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (d) => {
        resto += d; const linhas = resto.split(/\r?\n/); resto = linhas.pop();
        for (const l of linhas) if (l.startsWith('T:')) { falhas = 0; publicar(interpretarTituloWindows(l.slice(2))); }
      });
      proc.on('error', () => { publicar({ ...VAZIO, disponivel: false }); });
      proc.on('exit', () => { proc = null; if (!parado && ++falhas < 20) setTimeout(vigiar, 5000); });
    };
    vigiar();
  } else if (process.platform === 'darwin') {
    const perguntar = () => execFile('osascript', ['-e', MAC_ESTADO], { timeout: 4000 }, (err, out) => { if (!err) publicar(interpretarSaidaMac(out)); });
    perguntar(); timer = setInterval(perguntar, 2000);
  }

  function comando(acao) {
    return new Promise((ok) => {
      if (process.platform === 'win32' && TECLAS[acao]) {
        execFile('powershell.exe', powershell(scriptTecla(TECLAS[acao])), { windowsHide: true, timeout: 8000 }, (err) => ok(!err));
      } else if (process.platform === 'darwin' && MAC_COMANDO[acao]) {
        execFile('osascript', ['-e', `tell application "Spotify" to ${MAC_COMANDO[acao]}`], { timeout: 4000 }, (err) => ok(!err));
      } else ok(false);
    });
  }

  return {
    estado: () => estado,
    comando,
    parar: () => { parado = true; if (timer) clearInterval(timer); if (proc) try { proc.kill(); } catch (_) { /* já saiu */ } },
  };
}

module.exports = { iniciar, interpretarTituloWindows, interpretarSaidaMac, buscarCapa, pontuar };
