// Testes da voz do Google AI Studio (sem rede: o fetch é simulado).
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/voz-google.js');

const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
const b64 = Buffer.from(pcm).toString('base64');
const resposta = (item) => ({ steps: [{ type: 'user_input', content: [] }, { type: 'model_output', content: [item] }] });

test('acha o áudio na resposta da API', () => {
  assert.equal(V.extrairAudio(resposta({ type: 'audio', mime_type: 'audio/wav', data: 'AAA' })).data, 'AAA');
  assert.equal(V.extrairAudio({ steps: [] }), null);
});

test('PCM vira WAV de 24 kHz, mono, 16 bits', () => {
  const wav = new DataView(V.pcmParaWav(pcm));
  assert.equal(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), 'RIFF');
  assert.equal(wav.getUint32(24, true), 24000); assert.equal(wav.getUint16(22, true), 1); assert.equal(wav.getUint16(34, true), 16);
  assert.equal(wav.byteLength, 44 + pcm.length);
});

test('monta o pedido certo e devolve WAV', async () => {
  let pedido;
  global.fetch = async (url, op) => { pedido = { url, op, corpo: JSON.parse(op.body) }; return { ok: true, status: 200, json: async () => resposta({ type: 'audio', mime_type: 'audio/l16;rate=24000', data: b64 }) }; };
  const wav = await V.sintetizar({ chave: 'k', modelo: 'gemini-3.8-flash-tts', voz: 'Leda', texto: 'Oi!', estilo: 'alegre' });
  assert.equal(pedido.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(pedido.op.headers['x-goog-api-key'], 'k');
  assert.deepEqual(pedido.corpo.generation_config, { speech_config: [{ voice: 'Leda' }] });
  assert.deepEqual(pedido.corpo.input[0].content[0], { type: 'text', text: 'Oi!', annotations: [{ type: 'speech_metadata', style: 'alegre' }] });
  assert.equal(new DataView(wav).getUint32(40, true), pcm.length);
});

test('erros viram mensagens em português', async () => {
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });
  await assert.rejects(V.sintetizar({ chave: 'x', modelo: 'm', voz: 'Leda', texto: 'oi' }), /chave do Google AI Studio não foi aceita/);
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(V.sintetizar({ chave: 'x', modelo: 'm', voz: 'Leda', texto: 'oi' }), /limite de uso/);
});

test('entende o erro do Google mesmo dentro de uma lista', async () => {
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }]) });
  await assert.rejects(V.sintetizar({ chave: 'x', modelo: 'm', voz: 'Leda', texto: 'oi' }), /chave do Google AI Studio não foi aceita/);
});
