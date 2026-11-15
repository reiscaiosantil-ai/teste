// Testes da leitura do Spotify do computador (sem abrir o Spotify de verdade).
const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretarTituloWindows: w, interpretarSaidaMac: mac } = require('../desktop/spotify.js');

test('Windows: título da janela vira música e artista', () => {
  assert.deepEqual(w('Henrique & Juliano - Liberdade Provisória'), { disponivel: true, aberto: true, tocando: true, artista: 'Henrique & Juliano', musica: 'Liberdade Provisória' });
  assert.equal(w('Arctic Monkeys - Do I Wanna Know? - Live').musica, 'Do I Wanna Know? - Live');
});
test('Windows: pausado, fechado e anúncio', () => {
  for (const t of ['Spotify', 'Spotify Premium', 'Spotify Free']) assert.deepEqual(w(t), { disponivel: true, aberto: true, tocando: false, musica: '', artista: '' });
  assert.deepEqual(w(''), { disponivel: true, aberto: false, tocando: false, musica: '', artista: '' });
  assert.equal(w('Advertisement').musica, 'Anúncio');
});
test('macOS: resposta do AppleScript', () => {
  assert.deepEqual(mac('playing|Evidências|Chitãozinho & Xororó\n'), { disponivel: true, aberto: true, tocando: true, musica: 'Evidências', artista: 'Chitãozinho & Xororó' });
  assert.equal(mac('paused|Evidências|Chitãozinho & Xororó').tocando, false);
  assert.equal(mac('fechado').aberto, false);
});
