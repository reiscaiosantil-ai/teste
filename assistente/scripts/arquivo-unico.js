// Gera Lumi.html: o app inteiro (HTML, CSS, JS e ícone) num único arquivo,
// para abrir com dois cliques sem precisar das pastas css/ e js/.
// Uso: node scripts/arquivo-unico.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

let html = ler('index.html');
const icone = 'data:image/svg+xml;base64,' + Buffer.from(ler('icone.svg')).toString('base64');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${icone}" type="image/svg+xml">`)
  .replace(/<link rel="stylesheet" href="css\/estilo\.css">/, () => `<style>\n${ler('css/estilo.css')}</style>`)
  .replace(/<script src="(js\/[\w.]+)"><\/script>/g, (_m, f) => {
    const js = ler(f);
    if (/<\/script/i.test(js)) throw new Error(`${f} contém "</script", não dá para embutir`);
    return `<script>\n${js}</script>`;
  });
if (/(?:href|src)="(?:css|js)\//.test(html)) throw new Error('sobrou referência a arquivo externo');
fs.writeFileSync(path.join(raiz, 'Lumi.html'), html);
console.log(`Lumi.html gerado (${Math.round(html.length / 1024)} KB)`);
