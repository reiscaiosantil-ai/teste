/* Lumi — achar e abrir arquivos do usuário (Área de Trabalho, Documentos, Downloads, OneDrive) e
   arrumar a pasta Downloads. Só lê nomes de arquivo; apagar é sempre mandar para a Lixeira, e só
   depois da confirmação, com a lista exata que foi mostrada. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const TIPOS = [
  [/planilha|excel|tabela/, ['.xlsx', '.xls', '.xlsm', '.csv', '.ods']], [/apresenta[cç][aã]o|slides?|power ?point/, ['.pptx', '.ppt', '.odp', '.key']],
  [/\bpdf\b/, ['.pdf']], [/documento|\bdoc\b|word|contrato|proposta|curr[ií]culo/, ['.docx', '.doc', '.pdf', '.odt', '.rtf', '.txt', '.md']],
  [/foto|imagem|print|figura/, ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif']], [/v[ií]deo|filmagem/, ['.mp4', '.mov', '.mkv', '.avi', '.webm']],
  [/m[uú]sica|[aá]udio/, ['.mp3', '.wav', '.m4a', '.ogg', '.flac']], [/\bzip\b|compactado|rar/, ['.zip', '.rar', '.7z']], [/instalador|programa|\bexe\b/, ['.exe', '.msi']],
];
const PALAVRAS_TIPO = /\b(?:a|o|as|os|minha|meu|minhas|meus|arquivo|arquivos|pasta|planilha|excel|tabela|apresenta[cç][aã]o|slides?|pdf|documento|doc|word|foto|imagem|print|v[ií]deo|m[uú]sica|[aá]udio|zip|de|do|da|dos|das|que|chamad[oa]|com nome|sobre)\b/g;

/** Entende "a planilha de vendas de outubro" → { termos: ['vendas','outubro'], extensoes: [...] }. Exportada para testes. */
function entenderBusca(texto) {
  const t = String(texto || '').toLowerCase();
  const tipo = TIPOS.find(([re]) => re.test(t));
  const termos = norm(semAcento(t).replace(PALAVRAS_TIPO, ' ')).split(' ').filter((x) => x.length > 1);
  return { termos, extensoes: tipo ? tipo[1] : null };
}
/** Nota de um arquivo para a busca (0 = não serve). Exportada para testes. */
function notaArquivo(nome, busca) {
  const ext = path.extname(nome).toLowerCase();
  if (busca.extensoes && !busca.extensoes.includes(ext)) return 0;
  const n = norm(path.basename(nome, ext));
  if (!busca.termos.length) return busca.extensoes ? 1 : 0;
  let pts = 0;
  for (const termo of busca.termos) {
    if ((` ${n} `).includes(` ${termo} `)) pts += 3;
    else if (n.includes(termo)) pts += 2;
    else if (termo.length >= 5 && n.includes(termo.slice(0, -1))) pts += 1; // plural/singular
    else return 0; // todos os termos precisam aparecer
  }
  return pts;
}

function pastasBusca() {
  const casa = os.homedir();
  return ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', path.join('OneDrive', 'Desktop'), path.join('OneDrive', 'Documents'), path.join('OneDrive', 'Área de Trabalho'), path.join('OneDrive', 'Documentos'), 'OneDrive']
    .map((p) => path.join(casa, p)).filter((p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } });
}
const PULAR = /^(?:node_modules|\.git|\.cache|AppData|\$RECYCLE\.BIN|System Volume Information|__pycache__|\.vscode|venv|\.venv)$/i;

/** Procura arquivos pelo nome falado. Devolve os melhores (mais pontos; empate: o mais recente). */
function procurar(texto, { limite = 6, pastas } = {}) {
  const busca = entenderBusca(texto);
  if (!busca.termos.length && !busca.extensoes) return [];
  const achados = [], vistos = new Set();
  let contados = 0;
  const andar = (dir, nivel) => {
    if (nivel > 5 || contados > 40000) return;
    let itens; try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const it of itens) {
      if (contados++ > 40000) return;
      if (it.name.startsWith('.') || PULAR.test(it.name)) continue;
      const p = path.join(dir, it.name);
      if (it.isDirectory()) { andar(p, nivel + 1); continue; }
      if (!it.isFile() || vistos.has(p)) continue;
      const pts = notaArquivo(it.name, busca); if (!pts) continue;
      vistos.add(p);
      let mtime = 0; try { mtime = fs.statSync(p).mtimeMs; } catch (_) { /* sumiu */ }
      achados.push({ nome: it.name, caminho: p, pasta: path.basename(dir), pts, mtime });
    }
  };
  for (const raiz of pastas || pastasBusca()) andar(raiz, 0);
  return achados.sort((a, b) => b.pts - a.pts || b.mtime - a.mtime).slice(0, limite);
}

const pastaDownloads = () => path.join(os.homedir(), 'Downloads');
function ultimosDownloads(n = 1, pasta = pastaDownloads()) {
  let itens = []; try { itens = fs.readdirSync(pasta, { withFileTypes: true }); } catch (_) { return []; }
  return itens.filter((i) => i.isFile() && !/\.(?:crdownload|part|tmp|download)$/i.test(i.name) && !i.name.startsWith('.') && !/^desktop\.ini$/i.test(i.name))
    .map((i) => { const p = path.join(pasta, i.name); let st = null; try { st = fs.statSync(p); } catch (_) { /* sumiu */ } return st ? { nome: i.name, caminho: p, mtime: st.mtimeMs, tamanho: st.size } : null; })
    .filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, n);
}
/** Arquivos (só na raiz de Downloads, nunca subpastas) com mais de `dias` dias. */
function downloadsVelhos(dias = 30, pasta = pastaDownloads()) {
  const limite = Date.now() - dias * 864e5;
  const l = ultimosDownloads(10000, pasta).filter((a) => a.mtime < limite);
  return { arquivos: l, total: l.reduce((s, a) => s + a.tamanho, 0) };
}

module.exports = { procurar, ultimosDownloads, downloadsVelhos, entenderBusca, notaArquivo, pastaDownloads };
