/* Lumi — voz natural offline com o Supertonic 3 (Supertone, licença OpenRAIL-M): fala português do Brasil
   com vozes femininas prontas (F1 a F5), sem internet e sem placa de vídeo, pelo onnxruntime.
   O modelo (~400 MB) é baixado do Hugging Face uma vez só e fica na pasta do app.
   Etapas: duração → codificador de texto → estimador de vetores (alguns passos) → vocoder (44,1 kHz). */
const fs = require('fs');
const path = require('path');

const BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main/';
// [caminho, tamanho em bytes] — o tamanho confere se o download terminou
const ARQUIVOS = [
  ['onnx/tts.json', 8253], ['onnx/unicode_indexer.json', 277676], ['onnx/duration_predictor.onnx', 3700147], ['onnx/text_encoder.onnx', 36416150],
  ['onnx/vocoder.onnx', 101424195], ['onnx/vector_estimator.onnx', 256534781],
  ['voice_styles/F1.json', 292046], ['voice_styles/F2.json', 292423], ['voice_styles/F3.json', 290794], ['voice_styles/F4.json', 291808], ['voice_styles/F5.json', 291479],
];
const VOZES = ['F1', 'F2', 'F3', 'F4', 'F5'];
const TOTAL = ARQUIVOS.reduce((s, a) => s + a[1], 0);

let estado = { pronto: false, baixando: false, progresso: 0, erro: null };
let baixando = null, motor = null, carregando = null;
const estilos = new Map();

const pastaModelo = (pastaApp) => path.join(process.env.LUMI_MODELOS || path.join(pastaApp, 'modelos'), 'supertonic-3');
const completo = (dir) => ARQUIVOS.every(([a, t]) => { try { return fs.statSync(path.join(dir, a)).size === t; } catch (_) { return false; } });
function lerEstado(pastaApp) { if (!estado.baixando) estado = { ...estado, pronto: completo(pastaModelo(pastaApp)) }; return estado; }

/** Baixa o que faltar (um arquivo por vez, gravando em .parte e renomeando no fim). aoProgresso(estado) avisa a página. */
function baixar(pastaApp, aoProgresso) {
  const dir = pastaModelo(pastaApp);
  if (completo(dir)) { estado = { pronto: true, baixando: false, progresso: 100, erro: null }; return Promise.resolve(estado); }
  if (baixando) return baixando;
  const avisar = () => { try { aoProgresso && aoProgresso(estado); } catch (_) { /* página fechou */ } };
  baixando = (async () => {
    estado = { pronto: false, baixando: true, progresso: 0, erro: null }; avisar();
    let feito = 0;
    for (const [arq, tam] of ARQUIVOS) {
      const destino = path.join(dir, arq);
      try { if (fs.statSync(destino).size === tam) { feito += tam; continue; } } catch (_) { /* ainda não tem */ }
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const r = await fetch(BASE + arq);
      if (!r.ok || !r.body) throw new Error(`não consegui baixar ${arq} (HTTP ${r.status})`);
      const parte = destino + '.parte', saida = fs.createWriteStream(parte);
      let recebido = 0;
      for await (const pedaco of r.body) {
        if (!saida.write(pedaco)) await new Promise((ok) => saida.once('drain', ok));
        recebido += pedaco.length;
        const pct = Math.floor((feito + recebido) / TOTAL * 100);
        if (pct !== estado.progresso) { estado = { ...estado, progresso: pct }; avisar(); }
      }
      await new Promise((ok, erro) => { saida.on('error', erro); saida.end(ok); });
      if (recebido !== tam) { fs.rmSync(parte, { force: true }); throw new Error(`download incompleto de ${arq}`); }
      fs.renameSync(parte, destino); feito += tam;
    }
    estado = { pronto: true, baixando: false, progresso: 100, erro: null }; avisar();
    return estado;
  })().catch((e) => {
    estado = { pronto: false, baixando: false, progresso: 0, erro: String(e && e.message ? e.message : e).slice(0, 200) }; avisar();
    return estado;
  }).finally(() => { baixando = null; });
  return baixando;
}

/* ================= texto ================= */
const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
/** Número inteiro por extenso, em português (até 999 milhões). Exportada para testes. */
function porExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n < 20) return UNIDADES[n];
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ' e ' + UNIDADES[n % 10] : '');
  if (n === 100) return 'cem';
  if (n < 1000) return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ' e ' + porExtenso(n % 100) : '');
  if (n < 1e6) { const m = Math.floor(n / 1000), r = n % 1000; return (m === 1 ? 'mil' : porExtenso(m) + ' mil') + (r ? (r < 100 || r % 100 === 0 ? ' e ' : ' ') + porExtenso(r) : ''); }
  if (n < 1e9) { const m = Math.floor(n / 1e6), r = n % 1e6; return porExtenso(m) + (m === 1 ? ' milhão' : ' milhões') + (r ? (r < 100 || (r < 1000 && r % 100 === 0) || (r % 1000 === 0 && r / 1000 < 100) ? ' e ' : ' ') + porExtenso(r) : ''); }
  return String(n);
}
const feminino = (t) => t.replace(/\bum$/, 'uma').replace(/\bdois$/, 'duas');
/** Deixa o texto do jeito que se fala: horas, dinheiro, porcentagem, graus e números por extenso. Exportada para testes. */
function prepararTexto(texto) {
  let t = String(texto || '');
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => { const H = +h, M = +m; return `${feminino(porExtenso(H))} ${H === 1 ? 'hora' : 'horas'}${M ? ' e ' + porExtenso(M) : ''}`; });
  t = t.replace(/R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g, (_, r, c) => {
    const R = parseInt(r.replace(/\./g, ''), 10), C = c ? parseInt(c.padEnd(2, '0'), 10) : 0;
    const reais = R ? `${porExtenso(R)} ${R === 1 ? 'real' : 'reais'}` : '', cent = C ? `${porExtenso(C)} ${C === 1 ? 'centavo' : 'centavos'}` : '';
    return reais && cent ? `${reais} e ${cent}` : reais || cent || 'zero reais';
  });
  t = t.replace(/(\d+(?:,\d+)?)\s?%/g, '$1 por cento').replace(/(\d+)\s?°\s?C\b/g, '$1 graus').replace(/(\d+)\s?°/g, '$1 graus');
  t = t.replace(/\b(\d+)\s?(GB|MB|ms|km|kg)\b/g, (_, n, u) => `${n} ${{ GB: 'gigas', MB: 'megas', ms: 'milissegundos', km: 'quilômetros', kg: 'quilos' }[u]}`);
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (m) => m.replace(/\./g, ''));
  t = t.replace(/\b(\d+),(\d+)\b/g, (_, a, b) => `${porExtenso(+a)} vírgula ${b.length > 2 ? b.split('').map((d) => UNIDADES[+d]).join(' ') : porExtenso(+b)}`);
  t = t.replace(/\b\d+\b/g, (m) => (m.length > 9 ? m.split('').map((d) => UNIDADES[+d]).join(' ') : porExtenso(+m)));
  return t.replace(/\s+/g, ' ').trim();
}
/** Limpeza do próprio Supertonic (acentos decompostos, símbolos) + marca do idioma. */
function marcarTexto(texto, idioma = 'pt') {
  let t = String(texto).normalize('NFKD').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+/gu, '');
  t = t.replace(/[–‑—]/g, '-').replace(/[_[\]|/#→←]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’´`]/g, "'").replace(/[♥☆♡©\\]/g, '').replace(/@/g, ' arroba ');
  t = t.replace(/ ([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'")\]}…]$/.test(t)) t += '.';
  return `<${idioma}>${t}</${idioma}>`;
}
/** Quebra textos longos em pedaços de até `max` caracteres, em fim de frase. Exportada para testes. */
function fatiar(texto, max = 280) {
  const frases = String(texto).split(/(?<=[.!?…])\s+/).filter(Boolean), out = [];
  let atual = '';
  for (let f of frases) {
    while (f.length > max) { const i = f.lastIndexOf(',', max) > 40 ? f.lastIndexOf(',', max) + 1 : f.lastIndexOf(' ', max) > 0 ? f.lastIndexOf(' ', max) : max; if (atual) { out.push(atual); atual = ''; } out.push(f.slice(0, i).trim()); f = f.slice(i).trim(); }
    if ((atual + ' ' + f).trim().length <= max) atual = (atual + ' ' + f).trim(); else { if (atual) out.push(atual); atual = f; }
  }
  if (atual) out.push(atual);
  return out;
}

/* ================= síntese ================= */
async function carregarMotor(dir) {
  if (motor && motor.dir === dir) return motor;
  if (carregando) return carregando;
  carregando = (async () => {
    const ort = require('onnxruntime-node');
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'onnx', 'tts.json'), 'utf8'));
    const indice = JSON.parse(fs.readFileSync(path.join(dir, 'onnx', 'unicode_indexer.json'), 'utf8'));
    const abrir = (n) => ort.InferenceSession.create(path.join(dir, 'onnx', n));
    const [dp, enc, vet, voc] = await Promise.all([abrir('duration_predictor.onnx'), abrir('text_encoder.onnx'), abrir('vector_estimator.onnx'), abrir('vocoder.onnx')]);
    motor = { dir, ort, indice, dp, enc, vet, voc, taxa: cfg.ae.sample_rate, bloco: cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor, dim: cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor };
    estilos.clear();
    return motor;
  })().finally(() => { carregando = null; });
  return carregando;
}
function carregarEstilo(m, voz) {
  const v = VOZES.includes(voz) ? voz : 'F1';
  if (estilos.has(v)) return estilos.get(v);
  const j = JSON.parse(fs.readFileSync(path.join(m.dir, 'voice_styles', v + '.json'), 'utf8'));
  const t = (x) => new m.ort.Tensor('float32', Float32Array.from(x.data.flat(Infinity)), x.dims);
  const e = { ttl: t(j.style_ttl), dp: t(j.style_dp) };
  estilos.set(v, e);
  return e;
}
function normal() { const u = Math.max(1e-10, Math.random()), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

async function sintetizarTrecho(m, estilo, trecho, passos, velocidade) {
  const { ort } = m;
  const marcado = marcarTexto(trecho);
  const ids = Array.from(marcado, (c) => { const i = m.indice[c.charCodeAt(0)]; return BigInt(i === undefined || i < 0 ? 0 : i); });
  const n = ids.length;
  const textIds = new ort.Tensor('int64', BigInt64Array.from(ids), [1, n]);
  const textMask = new ort.Tensor('float32', new Float32Array(n).fill(1), [1, 1, n]);
  const dur = (await m.dp.run({ text_ids: textIds, style_dp: estilo.dp, text_mask: textMask })).duration.data[0] / velocidade;
  const emb = (await m.enc.run({ text_ids: textIds, style_ttl: estilo.ttl, text_mask: textMask })).text_emb;
  const amostras = Math.floor(dur * m.taxa), len = Math.max(1, Math.floor((amostras + m.bloco - 1) / m.bloco));
  let latente = new Float32Array(m.dim * len); for (let i = 0; i < latente.length; i++) latente[i] = normal();
  const mascara = new ort.Tensor('float32', new Float32Array(len).fill(1), [1, 1, len]);
  const total = new ort.Tensor('float32', Float32Array.from([passos]), [1]);
  for (let p = 0; p < passos; p++) {
    const r = await m.vet.run({ noisy_latent: new ort.Tensor('float32', latente, [1, m.dim, len]), text_emb: emb, style_ttl: estilo.ttl, text_mask: textMask, latent_mask: mascara, total_step: total, current_step: new ort.Tensor('float32', Float32Array.from([p]), [1]) });
    latente = Float32Array.from(r.denoised_latent.data);
  }
  const wav = (await m.voc.run({ latent: new ort.Tensor('float32', latente, [1, m.dim, len]) })).wav_tts.data;
  return wav.subarray(0, Math.min(wav.length, amostras));
}

function wav16(pedacos, taxa, pausa = 0.25) {
  const sil = Math.floor(pausa * taxa), n = pedacos.reduce((s, p) => s + p.length, 0) + sil * Math.max(0, pedacos.length - 1);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(taxa, 24); buf.writeUInt32LE(taxa * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  pedacos.forEach((p, k) => { for (let i = 0; i < p.length; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p[i])) * 32767), o); o += 2; } if (k < pedacos.length - 1) o += sil * 2; });
  return buf;
}

/**
 * Texto → WAV (Buffer, 44,1 kHz mono). `voz`: F1 a F5; `passos`: 2 a 12 (mais = mais qualidade, mais lento); `velocidade`: 0,8 a 1,4.
 */
async function sintetizar(texto, pastaApp, { voz = 'F1', passos = 6, velocidade = 1.05 } = {}) {
  const dir = pastaModelo(pastaApp);
  if (!completo(dir)) throw new Error('a voz natural ainda não foi baixada');
  const m = await carregarMotor(dir), estilo = carregarEstilo(m, voz);
  const p = Math.max(2, Math.min(12, Math.round(passos) || 6)), v = Math.max(0.8, Math.min(1.4, Number(velocidade) || 1.05));
  const pedacos = [];
  for (const trecho of fatiar(prepararTexto(texto))) pedacos.push(await sintetizarTrecho(m, estilo, trecho, p, v));
  if (!pedacos.length) throw new Error('texto vazio');
  return wav16(pedacos, m.taxa);
}

/** Carrega o modelo em segundo plano, para a primeira fala não demorar. */
function aquecer(pastaApp) { const dir = pastaModelo(pastaApp); if (completo(dir)) carregarMotor(dir).catch(() => {}); }

module.exports = { aquecer, sintetizar, baixar, lerEstado, VOZES, pastaModelo, porExtenso, prepararTexto, marcarTexto, fatiar, ARQUIVOS };
