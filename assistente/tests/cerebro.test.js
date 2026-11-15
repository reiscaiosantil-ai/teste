// Testes do cérebro local do Lumi. Rode com: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/cerebro.js');
const M = require('../js/mascote.js');

const AGORA = new Date(2026, 10, 15, 10, 0, 0).getTime(); // domingo, 15/11/2026, 10:00 (horário local)
const diz = (t) => C.interpretar(t, { agora: AGORA, nome: 'Lumi' });
const hora = (ts) => { const d = new Date(ts); return [d.getDate(), d.getHours(), d.getMinutes()]; };

test('números por extenso', () => {
  assert.equal(C.numeros('vinte e cinco minutos'), '25 minutos');
  assert.equal(C.numeros('meia hora'), '30 minutos');
  assert.equal(C.numeros('fazer uma ligação', true), 'fazer uma ligação');
  assert.equal(C.numeros('em cinco minutos', true), 'em 5 minutos');
  assert.equal(C.numeros('às sete da noite', true), 'às 7 da noite');
});

test('chamado e saudação', () => {
  assert.equal(diz('Ei, Lumi').tipo, 'chamado');
  assert.equal(diz('oi lumi').tipo, 'saudacao');
  assert.equal(diz('Ei Lumi, vai chover hoje?').tipo, 'clima');
  assert.equal(diz('bom dia').tipo, 'saudacao');
});

test('timers', () => {
  assert.deepEqual(diz('timer de 10 minutos para a pizza'), { tipo: 'timer', segundos: 600, nome: 'Pizza' });
  assert.deepEqual(diz('timer de 1 minuto para o chá'), { tipo: 'timer', segundos: 60, nome: 'Chá' });
  assert.deepEqual(diz('me avisa em cinco minutos'), { tipo: 'timer', segundos: 300, nome: 'Timer' });
  assert.equal(diz('temporizador de uma hora e meia').segundos, 5400);
  assert.equal(diz('timer').tipo, 'pergunta');
  assert.equal(diz('cancela o timer').tipo, 'timer_cancelar');
  assert.equal(diz('modo estudo').segundos, 25 * 60);
});

test('lembretes com duração e com horário', () => {
  const a = diz('me lembra de ligar pro cliente em 30 minutos');
  assert.equal(a.tipo, 'lembrete'); assert.equal(a.texto, 'Ligar pro cliente'); assert.equal(a.quando, AGORA + 30 * 60e3);
  const b = diz('me lembra de fazer uma ligação às 15h');
  assert.equal(b.texto, 'Fazer uma ligação'); assert.deepEqual(hora(b.quando), [15, 15, 0]);
  const c = diz('me lembra em uma hora e meia de tirar o bolo');
  assert.equal(c.texto, 'Tirar o bolo'); assert.equal(c.quando, AGORA + 90 * 60e3);
  const d = diz('me lembra de pagar a conta amanhã às 9');
  assert.equal(d.texto, 'Pagar a conta'); assert.deepEqual(hora(d.quando), [16, 9, 0]);
  assert.equal(diz('me lembra de comprar pão').tipo, 'pergunta');
});

test('horários do dia', () => {
  assert.deepEqual(hora(diz('alarme às 7 da manhã').quando), [16, 7, 0]); // 7h já passou hoje → amanhã
  assert.deepEqual(hora(diz('alarme às 8 da noite').quando), [15, 20, 0]);
  assert.deepEqual(hora(diz('alarme às 3').quando), [15, 15, 0]); // "às 3" de manhã já passou → 15h
  assert.deepEqual(hora(diz('alarme às 10:30').quando), [15, 10, 30]);
  assert.deepEqual(hora(diz('me lembra de almoçar ao meio-dia').quando), [15, 12, 0]);
});

test('tarefas e notas', () => {
  const t = diz('cria uma tarefa ligar pra mãe amanhã às 10h');
  assert.equal(t.tipo, 'tarefa'); assert.equal(t.texto, 'Ligar pra mãe'); assert.deepEqual(hora(t.quando), [16, 10, 0]);
  assert.deepEqual(diz('adiciona tarefa comprar pão'), { tipo: 'tarefa', texto: 'Comprar pão', quando: null });
  assert.equal(diz('minhas tarefas').tipo, 'tarefas_listar');
  assert.equal(diz('o que eu tenho pra hoje').tipo, 'tarefas_listar');
  assert.deepEqual(diz('anota que preciso comprar café'), { tipo: 'nota', texto: 'Preciso comprar café' });
  assert.equal(diz('terminei a tarefa comprar pão').tipo, 'tarefa_concluir');
});

test('música e volume', () => {
  assert.deepEqual(diz('Ei, Lumi, toca Henrique e Juliano'), { tipo: 'musica', acao: 'tocar', busca: 'henrique e juliano', youtube: false });
  assert.equal(diz('toca uma música do Henrique e Juliano').busca, 'henrique e juliano');
  assert.equal(diz('toca uma música').busca, '');
  assert.equal(diz('toca na caixa da sala').busca, '');
  assert.equal(diz('pausa').acao, 'pausar');
  assert.equal(diz('próxima').acao, 'proxima');
  assert.deepEqual(diz('volume 40'), { tipo: 'volume', valor: 40 });
  assert.deepEqual(diz('aumenta o volume'), { tipo: 'volume', delta: 15 });
  assert.deepEqual(diz('abaixa o volume'), { tipo: 'volume', delta: -15 });
});

test('contas, cotações e traduções', () => {
  assert.equal(diz('quanto é 15% de 230').resultado, 34.5);
  assert.equal(diz('quanto é dois mais dois').resultado, 4);
  assert.equal(diz('quanto é a raiz de 81').resultado, 9);
  assert.equal(diz('calcula (2 + 3) vezes 4').resultado, 20);
  assert.equal(diz('quanto é 10 dividido por 4').resultado, 2.5);
  assert.equal(diz('2+2*3').resultado, 8);
  assert.equal(C.expressao('process.exit()'), null);
  assert.deepEqual(diz('quanto está o dólar?'), { tipo: 'cotacao', moeda: 'USD', rotulo: 'dólar', qtd: 1 });
  assert.equal(diz('cotação do euro').moeda, 'EUR');
  assert.deepEqual(diz('traduz para inglês bom dia'), { tipo: 'traduzir', para: 'en', idioma: 'inglês', texto: 'bom dia' });
  assert.equal(diz('como se diz obrigado em espanhol').para, 'es');
});

test('clima', () => {
  assert.deepEqual(diz('vai chover hoje?'), { tipo: 'clima', amanha: false, cidade: '', chuva: true });
  assert.equal(diz('como está o clima em São Paulo').cidade, 'são paulo');
  assert.equal(diz('previsão para amanhã').amanha, true);
});

test('utilidades', () => {
  assert.deepEqual(diz('gera uma senha de 20'), { tipo: 'senha', tamanho: 20 });
  assert.equal(diz('copia meu pix').tipo, 'pix');
  assert.equal(diz('cara ou coroa').tipo, 'moeda');
  assert.deepEqual(diz('sorteia um número de 1 a 10'), { tipo: 'sorteio', de: 1, ate: 10 });
  assert.equal(diz('conta uma piada').tipo, 'piada');
  assert.equal(diz('quantos dias faltam pro Natal?').dias, 40);
  assert.equal(diz('quantos dias faltam para o ano novo').dias, 47);
  assert.equal(diz('que horas são').tipo, 'hora');
  assert.equal(diz('como está meu PC?').tipo, 'pc');
  assert.equal(diz('notícias de hoje').tipo, 'noticias');
  assert.deepEqual(diz('pesquisa receita de bolo'), { tipo: 'pesquisar', busca: 'receita de bolo' });
  assert.equal(diz('abre o youtube').url, 'https://www.youtube.com');
});

test('pedidos de desktop são recusados com honestidade', () => {
  for (const f of ['organiza minha área de trabalho', 'desliga o PC em 30 minutos', 'procura o arquivo relatório', 'cria uma pasta Projetos']) assert.equal(diz(f).tipo, 'desktop', f);
});

test('personalização pela voz', () => {
  assert.deepEqual(diz('coloca a coroa'), { tipo: 'visual', acessorio: 'coroa' });
  assert.deepEqual(diz('muda sua cor para rosa'), { tipo: 'visual', corpo: 6 });
  assert.deepEqual(diz('tira o chapéu'), { tipo: 'visual', acessorio: 'nenhum' });
  assert.deepEqual(diz('seu nome agora é Bolota'), { tipo: 'renomear', nome: 'Bolota' });
  assert.deepEqual(diz('meu nome é caio'), { tipo: 'usuario', nome: 'Caio' });
  assert.equal(diz('qualquer coisa sem sentido xyz').tipo, 'desconhecido');
});

test('mascote: todos os humores, olhos e acessórios geram SVG', () => {
  for (const h of Object.keys(M.HUMORES)) for (const o of Object.keys(M.OLHOS)) for (const a of Object.keys(M.ACESSORIOS)) {
    const s = M.svg({ humor: h, estiloOlho: o, acessorio: a });
    assert.match(s, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(s, /undefined|NaN/);
  }
  assert.equal(Object.keys(M.HUMORES).length, 13);
  assert.ok(Object.keys(M.ACESSORIOS).length - 1 >= 17);
  assert.match(M.svg({ humor: 'idle', cilios: true, batom: true }), /lm-cilios/);
  assert.match(M.svg({ humor: 'idle', batom: true }), /#E0457B/);
});

test('chamado com nome composto, com ou sem hífen (como o reconhecimento de voz escreve)', () => {
  const d = (t) => C.interpretar(t, { agora: AGORA, nome: 'Sexta-feira' });
  assert.equal(d('sexta feira').tipo, 'chamado');
  assert.equal(d('e sexta feira que horas são').tipo, 'hora');
  assert.equal(d('Ei, Sexta-feira, conta uma piada').tipo, 'piada');
  assert.deepEqual(diz('cinco minutos'), { tipo: 'timer', segundos: 300, nome: 'Timer' });
  assert.equal(diz('coloca dez minutos').segundos, 600);
});

test('personalização feminina pela voz', () => {
  assert.deepEqual(diz('coloca a tiara'), { tipo: 'visual', acessorio: 'tiara' });
  assert.deepEqual(diz('coloca a coroa de flores'), { tipo: 'visual', acessorio: 'coroaflores' });
  assert.deepEqual(diz('coloca a coroa'), { tipo: 'visual', acessorio: 'coroa' });
  assert.deepEqual(diz('passa batom'), { tipo: 'visual', detalhe: 'batom', ligar: true });
  assert.deepEqual(diz('tira os cílios'), { tipo: 'visual', detalhe: 'cilios', ligar: false });
  assert.deepEqual(diz('muda sua cor para rosé'), { tipo: 'visual', corpo: 9 });
  assert.deepEqual(diz('muda sua cor para rosa'), { tipo: 'visual', corpo: 6 });
});

test('cabelo pela voz', () => {
  assert.deepEqual(diz('faz um coque'), { tipo: 'visual', cabelo: 'coque' });
  assert.deepEqual(diz('deixa o cabelo ruivo'), { tipo: 'visual', corCabelo: 3 });
  assert.deepEqual(diz('quero cabelo loiro com rabo de cavalo'), { tipo: 'visual', cabelo: 'rabo', corCabelo: 2 });
  assert.deepEqual(diz('solta o cabelo'), { tipo: 'visual', cabelo: 'longo' });
  assert.deepEqual(diz('tira o cabelo'), { tipo: 'visual', cabelo: 'nenhum' });
  for (const k of Object.keys(M.CABELOS)) assert.doesNotMatch(M.svg({ cabelo: k, corCabelo: '#7A4A2E' }), /undefined|NaN/);
});
