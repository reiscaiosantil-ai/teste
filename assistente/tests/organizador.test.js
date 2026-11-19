// Testes do organizador do Lumi: lista de compras, gastos e modo estudo. Rode com: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/organizador.js');

const diz = (t, op = {}) => O.interpretar(t, { nome: 'Lumi', ...op });
const AGORA = new Date(2026, 10, 19, 15, 0).getTime(); // quinta-feira, 19/11/2026, 15:00
const em = (d, h = 12, mes = 10) => new Date(2026, mes, d, h).getTime();

test('lista de compras: adicionar de vários jeitos', () => {
  assert.deepEqual(diz('Adiciona leite na lista'), { tipo: 'compras_add', itens: ['Leite'] });
  assert.deepEqual(diz('Lumi, coloca leite, pão e 2 ovos na lista de compras').itens, ['Leite', 'Pão', '2 ovos']);
  assert.deepEqual(diz('põe o café na minha lista').itens, ['Café']);
  assert.deepEqual(diz('lista de compras: arroz e feijão').itens, ['Arroz', 'Feijão']);
});

test('lista de compras: ver, tirar, limpar, copiar e mandar', () => {
  assert.equal(diz('minha lista de compras').tipo, 'compras_ver');
  assert.equal(diz('o que falta comprar?').tipo, 'compras_ver');
  assert.equal(diz('mostra a lista do mercado').tipo, 'compras_ver');
  assert.deepEqual(diz('tira o leite da lista'), { tipo: 'compras_del', itens: ['Leite'] });
  assert.deepEqual(diz('limpa a lista de compras'), { tipo: 'compras_limpar', soComprados: false });
  assert.deepEqual(diz('limpa os comprados'), { tipo: 'compras_limpar', soComprados: true });
  assert.equal(diz('copia a lista').tipo, 'compras_copiar');
  assert.deepEqual(diz('manda a lista de compras pro bernardo'), { tipo: 'compras_enviar', contato: 'Bernardo' });
});

test('"comprei" só marca quando o item está na lista', () => {
  const compras = [{ t: 'Leite' }, { t: 'Ovos' }];
  assert.deepEqual(diz('comprei leite', { compras }), { tipo: 'compras_ok', itens: ['Leite'] });
  assert.deepEqual(diz('já comprei o ovo e o leite', { compras }).itens, ['Ovo', 'Leite']);
  assert.equal(diz('comprei um jogo novo', { compras }), null);
  assert.equal(diz('comprei leite'), null);
});

test('não rouba frases de outros recursos', () => {
  for (const t of ['cria uma tarefa comprar pão', 'que horas são', 'toca uma música', 'timer de 5 minutos', 'quanto é 15% de 230', 'anota que preciso comprar café'])
    assert.equal(diz(t), null, t);
});

test('valores em reais', () => {
  assert.equal(O.valorBR('25,90'), 25.9);
  assert.equal(O.valorBR('1.200,50'), 1200.5);
  assert.equal(O.valorBR('1.200'), 1200);
  assert.equal(O.valorBR('25.90'), 25.9);
  assert.equal(O.valorBR('30'), 30);
});

test('gastos: registrar com valor, descrição e categoria', () => {
  assert.deepEqual(diz('gastei 30 reais no mercado'), { tipo: 'gasto_add', valor: 30, desc: 'Mercado', cat: 'Mercado' });
  assert.deepEqual(diz('Gastei R$ 25,90 de Uber!'), { tipo: 'gasto_add', valor: 25.9, desc: 'Uber', cat: 'Transporte' });
  assert.deepEqual(diz('paguei 120 na conta de luz'), { tipo: 'gasto_add', valor: 120, desc: 'Conta de luz', cat: 'Contas' });
  assert.deepEqual(diz('gastei trinta e cinco reais com ifood'), { tipo: 'gasto_add', valor: 35, desc: 'Ifood', cat: 'Comida' });
  assert.deepEqual(diz('gastei no cinema 40 reais'), { tipo: 'gasto_add', valor: 40, desc: 'Cinema', cat: 'Lazer' });
  assert.deepEqual(diz('gastei 50'), { tipo: 'gasto_add', valor: 50, desc: 'Gasto', cat: 'Outros' });
  assert.equal(diz('gastei 0 reais'), null);
});

test('gastos: consultar e desfazer', () => {
  assert.deepEqual(diz('quanto eu gastei esse mês?'), { tipo: 'gastos_ver', periodo: 'mes', cat: null });
  assert.deepEqual(diz('quanto gastei hoje'), { tipo: 'gastos_ver', periodo: 'hoje', cat: null });
  assert.deepEqual(diz('quanto gastei com mercado essa semana'), { tipo: 'gastos_ver', periodo: 'semana', cat: 'Mercado' });
  assert.deepEqual(diz('meus gastos do mês passado'), { tipo: 'gastos_ver', periodo: 'mes_passado', cat: null });
  assert.equal(diz('apaga o último gasto').tipo, 'gasto_desfazer');
});

test('categoria pelo nome do gasto', () => {
  assert.equal(O.categoria('Farmácia'), 'Saúde');
  assert.equal(O.categoria('mensalidade da faculdade'), 'Estudo');
  assert.equal(O.categoria('Steam'), 'Lazer');
  assert.equal(O.categoria('presente da vó'), 'Outros');
  assert.equal(O.iconeCategoria('Mercado'), '🛒');
  assert.equal(O.iconeCategoria('Outros'), '💸');
});

test('períodos: hoje, semana (de segunda) e mês', () => {
  const [a, b] = O.intervalo('hoje', AGORA);
  assert.equal(new Date(a).getDate(), 19); assert.equal(b - a, 864e5);
  assert.equal(new Date(O.intervalo('semana', AGORA)[0]).getDate(), 16); // segunda, 16/11
  assert.equal(new Date(O.intervalo('mes', AGORA)[0]).getDate(), 1);
  assert.equal(new Date(O.intervalo('mes_passado', AGORA)[0]).getMonth(), 9);
  assert.equal(O.lerPeriodo('essa semana', 'mes'), 'semana');
  assert.equal(O.lerPeriodo('', 'mes'), 'mes');
});

test('resumo de gastos soma e agrupa', () => {
  const g = [
    { valor: 30, cat: 'Mercado', ts: em(19) }, { valor: 20.5, cat: 'Mercado', ts: em(17) },
    { valor: 15, cat: 'Comida', ts: em(19) }, { valor: 99, cat: 'Lazer', ts: em(3) },
    { valor: 500, cat: 'Contas', ts: em(30, 12, 9) }, // outubro
  ];
  const mes = O.resumoGastos(g, 'mes', AGORA);
  assert.equal(mes.total, 164.5); assert.equal(mes.qtd, 4);
  assert.deepEqual(mes.categorias[0], ['Lazer', 99]);
  assert.equal(O.resumoGastos(g, 'hoje', AGORA).total, 45);
  assert.equal(O.resumoGastos(g, 'semana', AGORA).total, 65.5);
  assert.equal(O.resumoGastos(g, 'mes', AGORA, 'Mercado').total, 50.5);
  assert.equal(O.resumoGastos([], 'mes', AGORA).total, 0);
});

test('estudo: começar, com matéria e duração', () => {
  assert.deepEqual(diz('modo estudo'), { tipo: 'estudo_iniciar', minutos: null, materia: null });
  assert.deepEqual(diz('vamos estudar matemática'), { tipo: 'estudo_iniciar', minutos: null, materia: 'Matemática' });
  assert.deepEqual(diz('começa um pomodoro'), { tipo: 'estudo_iniciar', minutos: null, materia: null });
  assert.deepEqual(diz('começa um pomodoro de 50 minutos de física'), { tipo: 'estudo_iniciar', minutos: 50, materia: 'Física' });
  assert.deepEqual(diz('vou estudar para a prova de cálculo por 1 hora'), { tipo: 'estudo_iniciar', minutos: 60, materia: 'Cálculo' });
  assert.deepEqual(diz('Lumi, vamos estudar vinte e cinco minutos de inglês'), { tipo: 'estudo_iniciar', minutos: 25, materia: 'Inglês' });
});

test('estudo: parar, continuar, registrar e consultar', () => {
  assert.equal(diz('para o pomodoro').tipo, 'estudo_parar');
  assert.equal(diz('terminei de estudar').tipo, 'estudo_parar');
  assert.deepEqual(diz('continua estudando'), { tipo: 'estudo_iniciar', continuar: true });
  assert.deepEqual(diz('mais um pomodoro'), { tipo: 'estudo_iniciar', continuar: true });
  assert.deepEqual(diz('estudei 2 horas de cálculo'), { tipo: 'estudo_add', minutos: 120, materia: 'Cálculo' });
  assert.deepEqual(diz('estudei 40 minutos'), { tipo: 'estudo_add', minutos: 40, materia: 'Estudo' });
  assert.equal(diz('estudei muito ontem'), null);
  assert.deepEqual(diz('quanto estudei hoje?'), { tipo: 'estudo_ver', periodo: 'hoje' });
  assert.deepEqual(diz('quanto tempo eu estudei essa semana'), { tipo: 'estudo_ver', periodo: 'semana' });
});

test('resumo de estudo, sequência de dias e pausas', () => {
  const s = [
    { materia: 'Cálculo', min: 25, ts: em(19, 9) }, { materia: 'Cálculo', min: 25, ts: em(19, 10) },
    { materia: 'Inglês', min: 50, ts: em(18) }, { materia: 'Física', min: 30, ts: em(17) }, { materia: 'Física', min: 30, ts: em(10) },
  ];
  assert.deepEqual(O.resumoEstudo(s, 'hoje', AGORA), { total: 50, materias: [['Cálculo', 50]] });
  assert.equal(O.resumoEstudo(s, 'semana', AGORA).total, 130);
  assert.equal(O.sequenciaEstudo(s, AGORA), 3);
  assert.equal(O.sequenciaEstudo(s.slice(2), AGORA), 2); // ainda não estudou hoje: conta até ontem
  assert.equal(O.sequenciaEstudo([], AGORA), 0);
  assert.equal(O.horasTxt(90), '1h30'); assert.equal(O.horasTxt(45), '45 min'); assert.equal(O.horasTxt(120), '2h');
  assert.equal(O.pausaDepois(1), 5); assert.equal(O.pausaDepois(4), 15); assert.equal(O.pausaDepois(8), 15);
});

test('itens da lista: achar e montar o texto', () => {
  const l = [{ t: 'Leite' }, { t: 'Ovos', feito: true }, { t: 'Pão de queijo' }];
  assert.equal(O.acharItem(l, 'leite').t, 'Leite');
  assert.equal(O.acharItem(l, 'ovo').t, 'Ovos');
  assert.equal(O.acharItem(l, 'pão').t, 'Pão de queijo');
  assert.equal(O.acharItem(l, 'carne'), null);
  assert.equal(O.listaTexto(l), '🛒 Lista de compras:\n• Leite\n• Pão de queijo');
  assert.equal(O.listaTexto([]), '');
});
