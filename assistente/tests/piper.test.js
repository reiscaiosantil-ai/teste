// Testes do motor Piper: fonemas em português e ids no formato do Piper oficial.
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../desktop/piper.js');
test('ids no formato do Piper: ^ _ (fonema _)* $', () => {
  const mapa = { '^': [1], '_': [0], '$': [2], a: [14], 'ˈ': [120], i: [21] };
  assert.deepEqual(p.paraIds('aˈi', mapa), [1, 0, 14, 0, 120, 0, 21, 0, 2]);
  assert.deepEqual(p.paraIds('a?', mapa), [1, 0, 14, 0, 2]); // símbolo desconhecido é ignorado
});
test('fonemiza português do Brasil com acentos (eSpeak em WebAssembly)', async () => {
  const f = await p.fonemizar('Oi, Caio! Amanhã vai chover.');
  assert.equal(f.length, 2);
  assert.match(f[0], /^ˈoɪ, k/);
  assert.match(f[1], /mɐ̃ɲˈɐ̃/); // "amanhã" pronunciado certo
});
