/* Testes do controle do computador: achar o app, a ligação, conferir a senha e resumir o antivírus. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../desktop/sistema.js');

const PROC = [
  { nome: 'chrome', pid: 10, titulo: 'YouTube - Google Chrome' }, { nome: 'chrome', pid: 11, titulo: '' },
  { nome: 'WINWORD', pid: 20, titulo: 'Relatório final.docx - Word' }, { nome: 'Spotify', pid: 30, titulo: 'Evidências' },
  { nome: 'explorer', pid: 40, titulo: 'Downloads' }, { nome: 'svchost', pid: 50, titulo: '' }, { nome: 'ms-teams', pid: 60, titulo: 'Reunião | Microsoft Teams' },
];

test('acha o app para fechar pelo nome falado, pelo apelido ou pelo título da janela', () => {
  assert.deepEqual(S.escolherProcessos('chrome', PROC).pids, [10, 11]);
  assert.deepEqual(S.escolherProcessos('o Google Chrome', PROC).pids, [10, 11]);
  assert.deepEqual(S.escolherProcessos('navegador', PROC).pids, [10, 11]);
  assert.deepEqual(S.escolherProcessos('word', PROC).pids, [20]);
  assert.deepEqual(S.escolherProcessos('spotify', PROC).pids, [30]);
  assert.deepEqual(S.escolherProcessos('teams', PROC).pids, [60]);
  assert.deepEqual(S.escolherProcessos('relatório final', PROC).pids, [20]);
  assert.deepEqual(S.escolherProcessos('excel', PROC).pids, []);
});

test('nunca fecha partes do Windows', () => {
  assert.equal(S.escolherProcessos('explorador de arquivos', PROC).pids.length, 0);
  assert.ok(S.escolherProcessos('svchost', PROC).protegido);
  assert.ok(S.escolherProcessos('downloads', PROC).protegido); // título de uma janela do Explorer
  assert.ok(S.PROTEGIDOS.has('lumi') && S.PROTEGIDOS.has('lsass'));
});

test('escolhe o app do menu Iniciar', () => {
  const apps = [{ nome: 'Word', id: 'w' }, { nome: 'Word Mobile', id: 'wm' }, { nome: 'Spotify', id: 's' }, { nome: 'Desinstalar Spotify', id: 'x' }, { nome: 'Visual Studio Code', id: 'c' }, { nome: 'WhatsApp', id: 'z' }];
  assert.equal(S.escolherApp('word', apps).id, 'w');
  assert.equal(S.escolherApp('spotify', apps).id, 's');
  assert.equal(S.escolherApp('visual studio', apps).id, 'c');
  assert.equal(S.escolherApp('whatsapp', apps).id, 'z');
  assert.equal(S.escolherApp('photoshop', apps), null);
});

test('acha a ligação e o atalho certo para sair', () => {
  const j = (proc, titulo) => ({ h: 1, pid: 1, proc, titulo });
  assert.equal(S.escolherLigacao([j('chrome', 'Meet - abc-defg-hij - Google Chrome')]).teclas[0], '^w');
  assert.equal(S.escolherLigacao([j('chrome', 'YouTube'), j('Zoom', 'Reunião Zoom')]).app, 'Zoom');
  assert.equal(S.escolherLigacao([j('ms-teams', 'Microsoft Teams'), j('ms-teams', 'Reunião com Ana | Microsoft Teams')]).janela.titulo, 'Reunião com Ana | Microsoft Teams');
  assert.equal(S.escolherLigacao([j('chrome', 'Gmail'), j('Spotify', 'Evidências')]), null);
});

test('senha para desligar: padrão "Sabado", sem acento e dentro da frase', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-seg-'));
  const seg = S.lerSeguranca(pasta);
  assert.ok(seg.padrao);
  for (const ok of ['Sabado', 'sábado', 'Sábado.', 'a senha é sábado', 'SÁBADO!']) assert.ok(S.confereSenha(ok, seg), ok);
  for (const ruim of ['domingo', 'sab', '', 'sexta-feira']) assert.ok(!S.confereSenha(ruim, seg), ruim);
  assert.ok(S.trocarSenha(pasta, 'errada', 'nova senha').erro);
  assert.ok(S.trocarSenha(pasta, 'sábado', 'Lua Cheia').ok);
  const nova = S.lerSeguranca(pasta);
  assert.ok(!nova.padrao && S.confereSenha('lua cheia', nova) && !S.confereSenha('sabado', nova));
});

test('desligar sem a senha certa não faz nada', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-seg-'));
  assert.ok((await S.energia('desligar', 'domingo', pasta)).senhaErrada);
  const certo = await S.energia('desligar', 'sábado', pasta);
  if (process.platform !== 'win32') assert.deepEqual(certo, { indisponivel: true, senhaOk: true });
});

test('resumo do antivírus fala o que importa', () => {
  const agora = Date.parse('2026-11-16T12:00:00Z');
  assert.match(S.resumoProtecao({ ativo: true, tempoReal: true, idadeAssinatura: 0, ameacas: [] }, agora), /ligado.*tempo real.*Nenhuma ameaça/);
  assert.match(S.resumoProtecao({ ativo: true, tempoReal: false, idadeAssinatura: 9, ameacas: [] }, agora), /DESLIGADA.*9 dias/);
  assert.match(S.resumoProtecao({ ativo: true, tempoReal: true, ameacas: [{ nome: 'Trojan:Win32/X', quando: '2026-11-10T00:00:00Z', resolvida: false, ativa: true }] }, agora), /1 ameaça ainda não resolvida: Trojan/);
  assert.match(S.resumoProtecao({ ativo: false, modo: 'Passive Mode', produtos: ['Windows Defender', 'Avast Antivirus'] }, agora), /Avast/);
});

test('resumo da memória e teclas escapadas', () => {
  const apps = [{ rotulo: 'Google Chrome', mb: 3200, cpu: 4 }, { rotulo: 'Microsoft Teams', mb: 1200, cpu: 40 }, { rotulo: 'VS Code', mb: 900, cpu: 1 }];
  const r = S.resumoMemoria(apps, 16 * 1024 ** 3, 2 * 1024 ** 3);
  assert.equal(r.pct, 88);
  assert.match(r.texto, /14 de 16 GB.*Google Chrome com 3,1 GB, Microsoft Teams com 1,2 GB e VS Code com 900 MB.*quase cheia.*Microsoft Teams \(40%\)/);
  assert.equal(S.escaparTeclas('Ana (trabalho) 50%+'), 'Ana {(}trabalho{)} 50{%}{+}');
});
