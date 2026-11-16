/* Testes das funções de trabalho: agenda (.ics), busca de arquivos e volume. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../desktop/agenda.js');
const F = require('../desktop/arquivos.js');
const S = require('../desktop/sistema.js');

const ics = (...ev) => ['BEGIN:VCALENDAR', ...ev.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const sp = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const INI = Date.parse('2026-11-15T00:00:00-03:00'), FIM = Date.parse('2026-11-22T00:00:00-03:00');

test('agenda: evento com fuso, link do Zoom e evento de dia inteiro', () => {
  const l = A.lerIcs(ics(
    ['UID:b2', 'DTSTART:20261117T180000Z', 'DTEND:20261117T190000Z', 'SUMMARY:Reunião com cliente', 'LOCATION:https://us02web.zoom.us/j/123456789?pwd=x'],
    ['UID:c3', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121', 'SUMMARY:Black Friday'],
    ['UID:d4', 'DTSTART;TZID=America/Sao_Paulo:20261118T090000', 'DTEND;TZID=America/Sao_Paulo:20261118T100000', 'SUMMARY:Aula de ROV', 'DESCRIPTION:Link: https://meet.google.com/abc-defg-hij\\nAté lá'],
  ), INI, FIM);
  assert.deepEqual(l.map((e) => e.titulo), ['Reunião com cliente', 'Aula de ROV', 'Black Friday']);
  assert.equal(sp(l[0].inicio), 'ter., 17, 15:00');
  assert.equal(l[0].link, 'https://us02web.zoom.us/j/123456789?pwd=x');
  assert.equal(sp(l[1].inicio), 'qua., 18, 09:00');
  assert.equal(l[1].link, 'https://meet.google.com/abc-defg-hij');
  assert.equal(l[2].diaInteiro, true);
});

test('agenda: repetição semanal com exceção e reunião remarcada', () => {
  const l = A.lerIcs(ics(
    ['UID:a1', 'DTSTART;TZID=America/Sao_Paulo:20261102T100000', 'DTEND;TZID=America/Sao_Paulo:20261102T103000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR', 'EXDATE;TZID=America/Sao_Paulo:20261118T100000', 'SUMMARY:Daily'],
    ['UID:a1', 'RECURRENCE-ID;TZID=America/Sao_Paulo:20261116T100000', 'DTSTART;TZID=America/Sao_Paulo:20261116T140000', 'DTEND;TZID=America/Sao_Paulo:20261116T143000', 'SUMMARY:Daily (remarcada)'],
    ['UID:e5', 'DTSTART:20261101T120000Z', 'DTEND:20261101T130000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Só 3 dias'],
    ['UID:f6', 'DTSTART:20261116T120000Z', 'DTEND:20261116T130000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelada'],
  ), INI, FIM);
  assert.deepEqual(l.map((e) => `${sp(e.inicio)} ${e.titulo}`), ['seg., 16, 14:00 Daily (remarcada)', 'sex., 20, 10:00 Daily']);
});

test('agenda: repetição mensal e diária com UNTIL', () => {
  const l = A.lerIcs(ics(
    ['UID:m1', 'DTSTART;TZID=America/Sao_Paulo:20260917T080000', 'DTEND;TZID=America/Sao_Paulo:20260917T083000', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Pagar contador'],
    ['UID:u1', 'DTSTART;TZID=America/Sao_Paulo:20261114T070000', 'RRULE:FREQ=DAILY;UNTIL=20261116T235959Z', 'SUMMARY:Caminhada'],
  ), INI, FIM);
  assert.deepEqual(l.map((e) => `${sp(e.inicio)} ${e.titulo}`), ['dom., 15, 07:00 Caminhada', 'seg., 16, 07:00 Caminhada', 'ter., 17, 08:00 Pagar contador']);
});

test('arquivos: entende o pedido e acha pelo nome', () => {
  assert.deepEqual(F.entenderBusca('a planilha de vendas de outubro'), { termos: ['vendas', 'outubro'], extensoes: ['.xlsx', '.xls', '.xlsm', '.csv', '.ods'] });
  assert.deepEqual(F.entenderBusca('arquivo relatório Bernardo').termos, ['relatorio', 'bernardo']);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-arq-'));
  fs.mkdirSync(path.join(raiz, 'Trabalho', '2026'), { recursive: true });
  for (const f of ['Vendas Outubro.xlsx', 'vendas setembro.xlsx', 'Trabalho/2026/Relatório Bernardo semana 3.docx', 'Trabalho/vendas outubro.pdf', 'node_modules_x.txt']) fs.writeFileSync(path.join(raiz, f), 'x');
  assert.deepEqual(F.procurar('a planilha de vendas de outubro', { pastas: [raiz] }).map((a) => a.nome), ['Vendas Outubro.xlsx']);
  assert.deepEqual(F.procurar('vendas de outubro', { pastas: [raiz] }).map((a) => a.nome).sort(), ['Vendas Outubro.xlsx', 'vendas outubro.pdf']);
  assert.deepEqual(F.procurar('o relatório do bernardo', { pastas: [raiz] }).map((a) => a.nome), ['Relatório Bernardo semana 3.docx']);
  assert.deepEqual(F.procurar('a apresentação do curso', { pastas: [raiz] }), []);
  const velha = path.join(raiz, 'antigo.zip'); fs.writeFileSync(velha, 'x'); const t = (Date.now() - 40 * 864e5) / 1000; fs.utimesSync(velha, t, t);
  const v = F.downloadsVelhos(30, raiz);
  assert.deepEqual(v.arquivos.map((a) => a.nome), ['antigo.zip']); // só a raiz e só os antigos
  assert.equal(F.ultimosDownloads(1, raiz)[0].nome !== 'antigo.zip', true);
});

test('volume do PC pelas teclas de volume', () => {
  assert.equal(S.sequenciaVolume({ valor: 30 }), 'AE*50,AF*15');
  assert.equal(S.sequenciaVolume({ delta: 10 }), 'AF*5');
  assert.equal(S.sequenciaVolume({ delta: -20 }), 'AE*10');
  assert.equal(S.sequenciaVolume({ mudo: true }), 'AD*1');
});
