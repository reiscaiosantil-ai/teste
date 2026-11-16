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

test('conta do Claude Code: lê o auth status e usa a chave só quando é uma chave', () => {
  const cc = require('../desktop/claude-code.js');
  const c = cc.interpretarConta('{"loggedIn":true,"authMethod":"claude.ai","email":"ana@exemplo.com","orgName":"Ana","subscriptionType":"pro"}', 0);
  assert.equal(c.logado, true); assert.equal(c.email, 'ana@exemplo.com'); assert.equal(c.plano, 'pro');
  assert.equal(cc.interpretarConta('{"loggedIn":false,"authMethod":"none"}', 1).logado, false);
  assert.equal(cc.ambiente({ chave: 'sk-ant-api03-abcdefghijkl' }).ANTHROPIC_API_KEY, 'sk-ant-api03-abcdefghijkl');
  process.env.ANTHROPIC_API_KEY = 'sk-ant-esquecida-no-sistema';
  assert.equal(cc.ambiente({ chave: 'qualquer coisa' }).ANTHROPIC_API_KEY, undefined);
  delete process.env.ANTHROPIC_API_KEY;
  assert.ok(cc.ambiente({ contaPropria: true }).CLAUDE_CONFIG_DIR);
  const s = cc.scriptTerminal('entrar-console', 'C:\\Users\\Ana\\.local\\bin\\claude.exe', {});
  assert.match(s, /& 'C:\\Users\\Ana\\\.local\\bin\\claude\.exe' auth login --console/);
  assert.match(cc.scriptTerminal('instalar', null, {}), /irm https:\/\/claude\.ai\/install\.ps1 \| iex/);
});
