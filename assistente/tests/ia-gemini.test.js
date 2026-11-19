// Testes do cérebro Gemini do Lumi (js/ia-gemini.js), com fetch simulado. Rode com: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/ia-gemini.js');

const URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const SISTEMA = 'Você é a Sexta-feira.';
const HIST = [{ role: 'user', content: 'me conta uma curiosidade' }];
const ok = (texto) => ({ steps: [{ type: 'user_input' }, { type: 'model_output', content: [{ type: 'text', text: texto }] }] });

/** fetch falso: devolve as respostas na ordem e grava cada requisição. */
function falso(...respostas) {
  const pedidos = [];
  const f = async (url, op) => {
    pedidos.push({ url, headers: op.headers, body: JSON.parse(op.body) });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo };
  };
  f.pedidos = pedidos;
  return f;
}
const pergunta = (fetch, extra = {}) => G.perguntar({ chave: 'AIza123', sistema: SISTEMA, historico: HIST, nome: 'Sexta-feira', fetch, ...extra });

test('montarEntrada com histórico', () => {
  const t = G.montarEntrada([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Oi! Tudo bem?' }, { role: 'user', content: 'me conta uma curiosidade' }], 'Sexta-feira');
  assert.ok(t.includes('Usuário: oi'));
  assert.ok(t.includes('Sexta-feira: Oi! Tudo bem?'));
  assert.ok(t.endsWith('Mensagem nova: me conta uma curiosidade'));
  assert.equal(G.montarEntrada([{ role: 'user', content: 'oi' }], 'Sexta-feira'), 'oi');
});

test('resposta ok', async () => {
  const f = falso({ status: 200, corpo: ok('Polvos têm três corações.') });
  const r = await pergunta(f);
  assert.deepEqual(r, { texto: 'Polvos têm três corações.', modelo: 'gemini-3.8-flash' });
  const p = f.pedidos[0];
  assert.equal(p.url, URL);
  assert.equal(p.headers['x-goog-api-key'], 'AIza123');
  assert.equal(p.body.model, 'gemini-3.8-flash');
  assert.equal(p.body.store, false);
  assert.equal(p.body.system_instruction, SISTEMA);
  assert.equal(p.body.input[0].type, 'user_input');
  assert.equal(p.body.input[0].content[0].text, 'me conta uma curiosidade');
});

test('output_text', async () => {
  const r = await pergunta(falso({ status: 200, corpo: { output_text: 'Oi!' } }));
  assert.equal(r.texto, 'Oi!');
});

test('cota no primeiro modelo', async () => {
  const f = falso({ status: 429, corpo: {} }, { status: 200, corpo: ok('Oi!') });
  const r = await pergunta(f);
  assert.equal(f.pedidos[1].body.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(r, { texto: 'Oi!', modelo: 'gemini-3.5-flash-lite' });
});

test('cota nos dois modelos', async () => {
  const r = await pergunta(falso({ status: 429, corpo: {} }, { status: 429, corpo: {} }));
  assert.equal(r.erro, true); assert.equal(r.cota, true);
  assert.ok(r.texto.includes('acabou'), r.texto);
});

test('chave inválida', async () => {
  const f = falso({ status: 400, corpo: { error: { message: 'API key not valid. Please pass a valid API key.' } } });
  const r = await pergunta(f);
  assert.equal(r.erro, true); assert.equal(r.chaveInvalida, true);
  assert.ok(r.texto.includes('não foi aceita'), r.texto);
  assert.equal(f.pedidos.length, 1);
});

test('chave com espaços', async () => {
  const f = falso({ status: 200, corpo: ok('Oi!') });
  await pergunta(f, { chave: '  AIza123 \n' });
  assert.equal(f.pedidos[0].headers['x-goog-api-key'], 'AIza123');
});

test('sem conexão', async () => {
  const r = await pergunta(falso(new TypeError('Failed to fetch')));
  assert.equal(r.erro, true); assert.equal(r.semRede, true);
  assert.ok(r.texto.includes('sem internet'), r.texto);
});

test('resposta sem texto', async () => {
  const r = await pergunta(falso({ status: 200, corpo: { steps: [] } }));
  assert.equal(r.erro, true);
  assert.ok(r.texto.length > 0);
  assert.ok(!r.texto.includes('undefined'));
});

test('erro do servidor', async () => {
  const f = falso({ status: 500, corpo: { error: { message: 'Internal error' } } });
  const r = await pergunta(f);
  assert.equal(r.erro, true);
  assert.ok(/[ãçéó]|erro|Google/.test(r.texto), r.texto);
  assert.equal(f.pedidos.length, 1);
});
