// Testes das utilidades puras do Lumi (js/util.js). Rode com: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/util.js');

test('formatação de tempo, tamanho e listas', () => {
  assert.equal(U.mmss(65), '01:05');
  assert.equal(U.mmss(3725), '1:02:05');
  assert.equal(U.mmss(-3), '00:00');
  assert.equal(U.tamanho(512), '512 MB');
  assert.equal(U.tamanho(1536), '1,5 GB');
  assert.equal(U.listaE(['arroz', 'feijão', 'ovo']), 'arroz, feijão e ovo');
  assert.equal(U.listaE(['só']), 'só');
  assert.equal(U.listaE([]), '');
  assert.equal(U.cap('lumi'), 'Lumi');
  assert.equal(U.hojeStr(new Date(2026, 10, 19)), '2026-11-19');
});

test('esc protege HTML', () => {
  assert.equal(U.esc('<b>"oi" & \'tchau\'</b>'), '&lt;b&gt;&quot;oi&quot; &amp; &#39;tchau&#39;&lt;/b&gt;');
  assert.equal(U.esc(null), '');
});

test('embaralhar mantém os mesmos itens', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(U.embaralhar(a).sort(), a);
  assert.deepEqual(a, [1, 2, 3, 4, 5]); // não mexe no original
});

test('texto falável tira emoji, HTML e link', () => {
  assert.equal(U.textoFalavel('Pronto! 🎉 <b>Veja</b> https://exemplo.com/x aqui'), 'Pronto! Veja o link aqui');
});

test('fatiar fala em pedaços curtos sem cortar frases', () => {
  const longo = 'Primeira frase aqui. ' + 'a'.repeat(150) + '. Terceira.';
  const partes = U.fatiarFala(longo);
  assert.ok(partes.length >= 2);
  assert.equal(partes.join(' '), longo.trim());
  assert.deepEqual(U.fatiarFala('Oi. Tudo bem?'), ['Oi. Tudo bem?']);
});

test('distância e semelhança entre palavras', () => {
  assert.equal(U.distancia('gato', 'pato'), 1);
  assert.equal(U.distancia('', 'abc'), 3);
  assert.equal(U.similar('casa', 'casa'), 1);
  assert.equal(U.similar('', 'x'), 0);
  assert.equal(U.basePalavra('Ação, Já!'), 'acao ja');
});

test('tira o chamado da frase, mesmo com hífen e erro de uma letra', () => {
  assert.equal(U.tirarChamado('Ei, Sexta-feira, que horas são?', 'Sexta-feira'), 'que horas são?');
  assert.equal(U.tirarChamado('ei sexta feira abre o spotify', 'Sexta-feira'), 'abre o spotify');
  assert.equal(U.tirarChamado('Lumy, toca música', 'Lumi'), 'toca música');
  assert.equal(U.tirarChamado('que horas são', 'Lumi'), null);
  assert.equal(U.tirarChamado('oi', ''), null);
});

test('acha correção aprendida parecida', () => {
  const lista = [{ de: 'abre o zap', para: 'abrir whatsapp' }];
  assert.deepEqual(U.acharAprendido(lista, 'Abre o zap!'), { ap: lista[0], exato: true });
  assert.equal(U.acharAprendido(lista, 'abre o zapi').exato, false);
  assert.equal(U.acharAprendido(lista, 'toca uma música'), null);
  assert.equal(U.acharAprendido([], 'qualquer'), null);
});

test('clima: descrição e lua à noite', () => {
  assert.deepEqual(U.descTempo(0, 1), ['céu limpo', '☀️']);
  assert.deepEqual(U.descTempo(0, 0), ['céu limpo', '🌙']);
  assert.deepEqual(U.descTempo(12345), ['tempo variável', '🌡️']);
});

test('agenda: eventos do dia e texto', () => {
  const dia = new Date(2026, 10, 19, 12).getTime();
  const h = (d, hh, mm = 0) => new Date(2026, 10, d, hh, mm).getTime();
  const ev = [
    { titulo: 'Aula', inicio: h(19, 19), fim: h(19, 21) },
    { titulo: 'Ontem', inicio: h(18, 10), fim: h(18, 11) },
    { titulo: 'Feriado', inicio: h(19, 0), fim: h(20, 0), diaInteiro: true },
  ];
  assert.deepEqual(U.doDia(ev, dia).map((e) => e.titulo), ['Aula', 'Feriado']);
  assert.equal(U.eventoTxt(ev[0]), '19:00 Aula');
  assert.equal(U.eventoTxt(ev[2]), 'Feriado (o dia todo)');
});
