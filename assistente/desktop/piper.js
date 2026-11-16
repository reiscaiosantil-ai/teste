/* Lumi — voz offline com o Piper (modelos .onnx + .onnx.json), rodando no processo principal.
   Fonemas: eSpeak-NG em WebAssembly (mesmo eSpeak que o Piper usa). Inferência: onnxruntime-node.
   As vozes ficam na pasta "vozes" do app (uma voz = model.onnx + model.onnx.json). */
const fs = require('fs');
const path = require('path');

let ort = null, espeakMod = null;
const sessoes = new Map(); // caminho do .onnx → { sessao, config }

async function espeak() {
  if (!espeakMod) espeakMod = (await import('espeak-ng')).default;
  return espeakMod;
}

/** Texto → lista de frases, cada uma uma string de fonemas IPA (como o Piper faz). */
async function fonemizar(texto, voz = 'pt-br') {
  const ESpeakNg = await espeak();
  const frases = String(texto).replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*|[.!?…]+/g) || [];
  const saida = [];
  for (const f of frases.map((x) => x.trim()).filter(Boolean)) {
    const pont = f.match(/[,;:]|[.!?…]+$/g) || [];
    const es = await ESpeakNg({ arguments: ['--phonout', '/saida', '--sep=""', '-q', '-b', '1', '--ipa=3', '-v', voz, '-f', '/entrada'], preRun: [(M) => M.FS.writeFile('/entrada', f)] });
    const linhas = es.FS.readFile('/saida', { encoding: 'utf8' }).split('\n').map((l) => l.replace(/‍/g, '').trim()).filter(Boolean);
    saida.push(linhas.map((l, i) => l + (pont[i] ? pont[i].slice(0, 1) : '')).join(' '));
  }
  return saida;
}

/** Fonemas → ids no formato do Piper: ^ _ (fonema _)* $ */
function paraIds(fonemas, mapa) {
  const ids = [...mapa['^'], ...mapa['_']];
  for (const ch of Array.from(fonemas.normalize('NFD'))) {
    const m = mapa[ch]; if (!m) continue;
    ids.push(...m, ...mapa['_']);
  }
  ids.push(...mapa['$']);
  return ids;
}

async function carregar(modelo) {
  if (sessoes.has(modelo)) return sessoes.get(modelo);
  if (!ort) ort = require('onnxruntime-node');
  const config = JSON.parse(fs.readFileSync(modelo + '.json', 'utf8'));
  const sessao = await ort.InferenceSession.create(modelo, { intraOpNumThreads: Math.max(1, Math.min(4, require('os').cpus().length - 1)) });
  const v = { sessao, config };
  sessoes.set(modelo, v);
  return v;
}

function wav16(amostras, taxa) {
  const n = amostras.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(taxa, 24);
  buf.writeUInt32LE(taxa * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(amostras[i] * 32767))), 44 + i * 2);
  return buf;
}

/**
 * Fala o texto com a voz (caminho do .onnx). Devolve um WAV (Buffer).
 * @param {{velocidade?:number, expressividade?:number}} op  velocidade 1 = normal; expressividade 0..1 (variação de entonação)
 */
async function sintetizar(texto, modelo, op = {}) {
  const { sessao, config } = await carregar(modelo);
  const inf = config.inference || {}, taxa = (config.audio && config.audio.sample_rate) || 22050;
  const expr = op.expressividade === undefined ? 0.5 : op.expressividade;
  const ruido = (inf.noise_scale || 0.667) * (0.8 + expr * 0.5), ritmo = (inf.noise_w || 0.8) * (0.8 + expr * 0.5);
  const comprimento = (inf.length_scale || 1) / Math.max(0.5, Math.min(2, op.velocidade || 1));
  const pausa = new Float32Array(Math.round(taxa * 0.18));
  const partes = [];
  for (const f of await fonemizar(texto, (config.espeak && config.espeak.voice) || 'pt-br')) {
    const ids = paraIds(f, config.phoneme_id_map);
    const entrada = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([ruido, comprimento, ritmo]), [3]),
    };
    if (config.num_speakers > 1) entrada.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const r = await sessao.run(entrada);
    partes.push(r.output.data, pausa);
  }
  const total = partes.reduce((a, p) => a + p.length, 0), audio = new Float32Array(total);
  let o = 0; for (const p of partes) { audio.set(p, o); o += p.length; }
  return wav16(audio, taxa);
}

/** Vozes instaladas numa pasta: [{ nome, modelo }] (precisa do .onnx e do .onnx.json). */
function listar(pasta) {
  try {
    return fs.readdirSync(pasta).filter((f) => f.endsWith('.onnx') && fs.existsSync(path.join(pasta, f + '.json')))
      .map((f) => ({ nome: f.replace(/\.onnx$/, ''), modelo: path.join(pasta, f) }));
  } catch (_) { return []; }
}

module.exports = { sintetizar, fonemizar, paraIds, listar };
