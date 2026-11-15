// Baixa o modelo de voz offline em português (Vosk, ~31 MB, licença Apache 2.0) e guarda em voz/modelo-pt.tar.gz,
// o formato que o vosk-browser lê. Uso: npm run voz   (ou LUMI_VOZ_ZIP=caminho/do.zip para usar um zip já baixado)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const URL_MODELO = 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip';
const PASTA = 'vosk-model-small-pt-0.3';
const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'voz', 'modelo-pt.tar.gz');

(async () => {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 20e6) { console.log('Modelo de voz já está em', destino); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-voz-'));
  let zip = process.env.LUMI_VOZ_ZIP;
  if (!zip) {
    zip = path.join(tmp, 'modelo.zip');
    console.log('Baixando', URL_MODELO);
    const r = await fetch(URL_MODELO);
    if (!r.ok) throw new Error('download falhou: HTTP ' + r.status);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  }
  // Windows: o tar do sistema abre .zip; Linux/Mac: unzip
  const tarWin = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : null;
  if (tarWin) execFileSync(tarWin, ['-xf', zip, '-C', tmp], { stdio: 'inherit' });
  else execFileSync('unzip', ['-q', '-o', zip, '-d', tmp], { stdio: 'inherit' });
  if (!fs.existsSync(path.join(tmp, PASTA, 'final.mdl'))) throw new Error('o zip não tem o modelo esperado');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync(tarWin || 'tar', ['-czf', destino, '-C', tmp, PASTA], { stdio: 'inherit' });
  console.log('Modelo de voz pronto:', destino, Math.round(fs.statSync(destino).size / 1e6) + ' MB');
})().catch((e) => { console.error(e.message); process.exit(1); });
