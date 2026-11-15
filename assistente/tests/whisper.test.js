// Testes do filtro do Whisper (sem carregar o modelo).
const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../desktop/whisper.js');
test('limpa pontuação e descarta alucinações do Whisper', () => {
  assert.equal(w.limpar('Qual é a capital da Austrália?', 2), 'Qual é a capital da Austrália');
  assert.equal(w.limpar('Legendas pela comunidade Amara.org', 2), '');
  assert.equal(w.limpar('Obrigado por assistir!', 1.5), '');
  assert.equal(w.limpar('  ', 1), '');
  assert.ok(w.MODELOS.small && w.MODELOS.base && w.MODELOS.turbo);
});
