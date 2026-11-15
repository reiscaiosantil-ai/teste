// Testes do cérebro pelo Claude Code (sem chamar o Claude: só a leitura da resposta).
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('../desktop/claude-code.js');

test('lê a resposta do claude -p em JSON', () => {
  const ok = cc.interpretarSaida('{"type":"result","subtype":"success","is_error":false,"result":"**Canberra** é a capital.","session_id":"abc"}');
  assert.deepEqual(ok, { texto: 'Canberra é a capital.', sessao: 'abc' });
});
test('erros viram mensagens claras', () => {
  assert.equal(cc.interpretarSaida('{"is_error":true,"result":"Not logged in · Please run /login"}').erro, 'login');
  assert.equal(cc.interpretarSaida('{"is_error":true,"result":"Claude usage limit reached"}').erro, 'limite');
  assert.equal(cc.interpretarSaida('', 'algo quebrou').erro, 'saida');
});
test('só libera ferramentas seguras', () => {
  assert.ok(!cc.FERRAMENTAS.some((f) => /^Bash|^Write$|^Edit$/.test(f)));
  assert.ok(cc.FERRAMENTAS.includes('Write(Notas/**)'));
});
test('CLAUDE.md leva nome, usuário e personalidade', () => {
  const md = cc.claudeMd({ nome: 'Sexta-feira', usuario: 'Caio', personalidade: 'zen' });
  assert.match(md, /Você é Sexta-feira/); assert.match(md, /de Caio/); assert.match(md, /calma/); assert.match(md, /feminino/);
});
