/* Lumi — reconhecimento de fala preciso com o Whisper (OpenAI, licença MIT), rodando offline no computador
   pelo transformers.js + onnxruntime. O Vosk continua só esperando o chamado; a frase do pedido vem para cá.
   O modelo é baixado do Hugging Face na primeira vez e fica guardado na pasta do app. */
const path = require('path');

const MODELOS = {
  base: { id: 'onnx-community/whisper-base', dtype: 'q8', tamanho: '80 MB' },
  small: { id: 'onnx-community/whisper-small', dtype: 'q8', tamanho: '240 MB' },
  turbo: { id: 'onnx-community/whisper-large-v3-turbo', dtype: 'q4', tamanho: '730 MB' },
};
// frases que o Whisper "inventa" quando ouve ruído
const ALUCINACOES = /amara\.org|legendas? (pela|por)|obrigad[oa] por assistir|inscreva-se|se inscreva|ativ[ea] o sininho|\[m[uú]sica\]|♪/i;

let asr = null, nomeAtual = null, carregando = null, estado = { pronto: false, baixando: false, progresso: 0, modelo: null, erro: null };

function iniciarCache(env, pastaApp) {
  env.cacheDir = process.env.LUMI_MODELOS || path.join(pastaApp, 'modelos');
  env.allowLocalModels = false;
}

/** Carrega (e baixa, se preciso) o modelo. aoProgresso({baixando, progresso, pronto}) é chamado durante o download. */
function carregar(nome, pastaApp, aoProgresso) {
  const m = MODELOS[nome] ? nome : 'small';
  if (asr && nomeAtual === m) return Promise.resolve(asr);
  if (carregando && carregando.nome === m) return carregando.p;
  const p = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    iniciarCache(env, pastaApp);
    estado = { pronto: false, baixando: true, progresso: 0, modelo: m, erro: null }; aoProgresso && aoProgresso(estado);
    const arquivos = {};
    const novo = await pipeline('automatic-speech-recognition', MODELOS[m].id, {
      dtype: MODELOS[m].dtype, device: 'cpu',
      progress_callback: (x) => {
        if (x.status === 'progress' && x.file) {
          arquivos[x.file] = { carregado: x.loaded || 0, total: x.total || 0 };
          const t = Object.values(arquivos).reduce((a, b) => ({ c: a.c + b.carregado, t: a.t + b.total }), { c: 0, t: 0 });
          const pct = t.t ? Math.round((t.c / t.t) * 100) : 0;
          if (pct !== estado.progresso) { estado = { ...estado, progresso: pct }; aoProgresso && aoProgresso(estado); }
        }
      },
    });
    asr = novo; nomeAtual = m; carregando = null;
    estado = { pronto: true, baixando: false, progresso: 100, modelo: m, erro: null }; aoProgresso && aoProgresso(estado);
    return asr;
  })().catch((e) => {
    carregando = null;
    estado = { pronto: false, baixando: false, progresso: 0, modelo: m, erro: String(e && e.message ? e.message : e).slice(0, 200) };
    aoProgresso && aoProgresso(estado);
    throw e;
  });
  carregando = { nome: m, p };
  return p;
}

/**
 * Transcreve áudio 16 kHz mono (Float32Array). Devolve o texto, ou '' quando o Whisper só "alucinou".
 */
async function transcrever(audio, nome, pastaApp, aoProgresso) {
  const modelo = await carregar(nome, pastaApp, aoProgresso);
  const pad = 6400; // 0,4 s de silêncio nas pontas: o Whisper engole menos o começo
  const a = new Float32Array(audio.length + pad * 2); a.set(audio, pad);
  const r = await modelo(a, { language: 'portuguese', task: 'transcribe' });
  const texto = String((r && r.text) || '').replace(/\s+/g, ' ').trim();
  return limpar(texto, audio.length / 16000);
}

/** Tira pontuação final e descarta alucinações típicas. Exportada para testes. */
function limpar(texto, segundos) {
  const t = String(texto || '').trim();
  if (!t || (ALUCINACOES.test(t) && segundos < 8)) return '';
  return t.replace(/^[\s.,!?-]+|[\s.!?]+$/g, '').trim();
}

module.exports = { carregar, transcrever, limpar, estado: () => estado, MODELOS };
