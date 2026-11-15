/* Lumi — enxerga e controla o aplicativo do Spotify instalado no computador.
   Sem login e sem chave:
   - Windows: lê o título da janela do Spotify ("Artista - Música" enquanto toca) e usa as teclas de mídia.
   - macOS: pergunta ao Spotify pelo AppleScript (osascript).
   Roda no processo principal do Electron; a página recebe só o estado já pronto. */
const { spawn, execFile } = require('child_process');

const VAZIO = { disponivel: true, aberto: false, tocando: false, musica: '', artista: '' };

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
  const [estado, musica = '', artista = ''] = t.split('|');
  return { ...VAZIO, aberto: true, tocando: estado === 'playing', musica: musica.trim(), artista: artista.trim() };
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

const MAC_ESTADO = 'if application "Spotify" is running then\n tell application "Spotify"\n  if player state is stopped then return "stopped||"\n  return (player state as string) & "|" & (name of current track) & "|" & (artist of current track)\n end tell\nelse\n return "fechado"\nend if';
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
  const publicar = (novo) => {
    if (JSON.stringify(novo) === JSON.stringify(estado)) return;
    estado = novo; try { aoMudar(estado); } catch (_) { /* página fechada */ }
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

module.exports = { iniciar, interpretarTituloWindows, interpretarSaidaMac };
