/* Testes da voz natural (Supertonic): texto do jeito que se fala, números por extenso e fatias. Sem baixar o modelo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../desktop/supertonic.js');

test('números por extenso em português', () => {
  const casos = { 0: 'zero', 7: 'sete', 16: 'dezesseis', 21: 'vinte e um', 100: 'cem', 101: 'cento e um', 274: 'duzentos e setenta e quatro', 1000: 'mil', 1250: 'mil duzentos e cinquenta', 2026: 'dois mil e vinte e seis', 1100: 'mil e cem', 15000: 'quinze mil', 1000000: 'um milhão', 2500000: 'dois milhões quinhentos mil' };
  for (const [n, t] of Object.entries(casos)) assert.equal(V.porExtenso(Number(n)), t, n);
});

test('prepara o texto para a fala: horas, dinheiro, porcentagem e graus', () => {
  assert.equal(V.prepararTexto('Agora são 14:30.'), 'Agora são quatorze horas e trinta.');
  assert.equal(V.prepararTexto('Alarme às 01:00 e às 21:05'), 'Alarme às uma hora e às vinte e uma horas e cinco');
  assert.equal(V.prepararTexto('O dólar está em R$ 5,62.'), 'O dólar está em cinco reais e sessenta e dois centavos.');
  assert.equal(V.prepararTexto('Custa R$ 1.274,50'), 'Custa mil duzentos e setenta e quatro reais e cinquenta centavos');
  assert.equal(V.prepararTexto('R$ 1,00 e R$ 0,05'), 'um real e cinco centavos');
  assert.equal(V.prepararTexto('35% de desconto, 28°C, memória em 91%'), 'trinta e cinco por cento de desconto, vinte e oito graus, memória em noventa e um por cento');
  assert.equal(V.prepararTexto('Chrome com 3,1 GB e ping de 12 ms'), 'Chrome com três vírgula um gigas e ping de doze milissegundos');
  assert.equal(V.prepararTexto('Você tem 3 tarefas e 1.250 arquivos'), 'Você tem três tarefas e mil duzentos e cinquenta arquivos');
});

test('marca o idioma e tira o que não se fala', () => {
  assert.equal(V.marcarTexto('Oi, senhor! 😄'), '<pt>Oi, senhor!</pt>');
  assert.equal(V.marcarTexto('Bom dia'), '<pt>Bom dia.</pt>');
  assert.ok(V.marcarTexto('ação').includes('ã')); // acentos decompostos, como o modelo espera
});

test('fatia textos longos em fim de frase', () => {
  const longo = Array.from({ length: 12 }, (_, i) => `Esta é a frase número ${i + 1} do texto.`).join(' ');
  const f = V.fatiar(longo, 120);
  assert.ok(f.length >= 3 && f.every((x) => x.length <= 120));
  assert.equal(f.join(' '), longo);
  assert.deepEqual(V.fatiar('Curta.'), ['Curta.']);
});
