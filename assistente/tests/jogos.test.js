/* Testes da parte de jogos: atalhos, bibliotecas da Steam/Epic, ping, placa de vídeo, Epic grátis e manchetes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../desktop/jogos.js');

test('atalhos viram códigos de tecla', () => {
  assert.deepEqual(J.codigosTeclas('win+alt+g'), [0x5B, 0x12, 0x47]);
  assert.deepEqual(J.codigosTeclas('Ctrl + Shift + M'), [0x11, 0x10, 0x4D]);
  assert.deepEqual(J.codigosTeclas('alt+f10'), [0x12, 0x79]);
  assert.equal(J.codigosTeclas('ctrl+banana'), null);
  assert.equal(J.codigosTeclas(''), null);
});

test('lê as bibliotecas e os jogos da Steam', () => {
  const vdf = '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t}\n}';
  assert.deepEqual(J.bibliotecasSteam(vdf), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
  assert.deepEqual(J.manifestoSteam('"AppState"\n{\n\t"appid"\t\t"730"\n\t"name"\t\t"Counter-Strike 2"\n}'), { id: '730', nome: 'Counter-Strike 2' });
  assert.equal(J.manifestoSteam('lixo'), null);
});

test('lê o manifesto da Epic e ignora o que não é jogo', () => {
  const j = J.manifestoEpic(JSON.stringify({ DisplayName: 'Fortnite', AppName: 'Fortnite', CatalogNamespace: 'fn', CatalogItemId: 'abc', AppCategories: ['public', 'games'] }));
  assert.equal(j.nome, 'Fortnite');
  assert.equal(j.url, 'com.epicgames.launcher://apps/fn%3Aabc%3AFortnite?action=launch&silent=true');
  assert.equal(J.manifestoEpic(JSON.stringify({ DisplayName: 'Unreal Engine', AppName: 'UE', AppCategories: ['engines'] })), null);
  assert.equal(J.manifestoEpic(JSON.stringify({ DisplayName: 'X', AppName: 'X', bIsIncompleteInstall: true })), null);
});

test('acha o jogo pelo nome falado ou pelo apelido', () => {
  const l = [{ nome: 'Counter-Strike 2' }, { nome: 'VALORANT' }, { nome: 'League of Legends' }, { nome: 'Grand Theft Auto V' }, { nome: 'Wordle Deluxe' }];
  assert.equal(J.escolherJogo('valorant', l).nome, 'VALORANT');
  assert.equal(J.escolherJogo('o cs', l).nome, 'Counter-Strike 2');
  assert.equal(J.escolherJogo('lol', l).nome, 'League of Legends');
  assert.equal(J.escolherJogo('gta', l).nome, 'Grand Theft Auto V');
  assert.equal(J.escolherJogo('word', l, 55), null); // "abre o word" não pode abrir um jogo
  assert.equal(J.escolherJogo('minecraft', l), null);
});

test('ping e placa de vídeo', () => {
  assert.equal(J.lerPing('Estatísticas do Ping para 1.1.1.1:\r\n    Mínimo = 11ms, Máximo = 15ms, Média = 12ms'), 12);
  assert.equal(J.lerPing('Minimum = 9ms, Maximum = 30ms, Average = 14ms'), 14);
  assert.equal(J.lerPing('rtt min/avg/max/mdev = 10.1/18.6/30.2/4.1 ms'), 19);
  assert.equal(J.lerPing('Esgotado o tempo limite do pedido.'), null);
  assert.deepEqual(J.lerNvidia('NVIDIA GeForce RTX 3060, 61, 87, 5120, 12288\n'), { nome: 'NVIDIA GeForce RTX 3060', temp: 61, uso: 87, memUsada: 5120, memTotal: 12288 });
  assert.equal(J.lerNvidia(''), null);
});

test('modo jogo sugere fechar só o que pesa e não é de jogo', () => {
  const s = J.sugerirFechar([{ nome: 'chrome', mb: 2100 }, { nome: 'Discord', mb: 600 }, { nome: 'Spotify', mb: 400 }, { nome: 'ms-teams', mb: 900 }, { nome: 'code', mb: 120 }, { nome: 'VALORANT-Win64-Shipping', mb: 3000 }]);
  assert.deepEqual(s.map((x) => x.nome), ['chrome', 'ms-teams']);
});

test('Epic: jogos de graça agora e em breve', () => {
  const oferta = (ini, fim, pct) => ({ promotionalOffers: [{ startDate: ini, endDate: fim, discountSetting: { discountPercentage: pct } }] });
  const d = { data: { Catalog: { searchStore: { elements: [
    { title: 'Knightica', offerMappings: [{ pageSlug: 'knightica-3be45c' }], promotions: { promotionalOffers: [oferta('2026-11-12T16:00:00Z', '2026-11-19T16:00:00Z', 0)], upcomingPromotionalOffers: [] } },
    { title: 'Mark of the Deep', promotions: { promotionalOffers: [], upcomingPromotionalOffers: [oferta('2026-11-19T16:00:00Z', '2026-11-26T16:00:00Z', 0)] } },
    { title: 'TerraScape', promotions: { promotionalOffers: [], upcomingPromotionalOffers: [oferta('2026-11-21T16:00:00Z', '2026-12-21T16:00:00Z', 70)] } },
    { title: 'Sem promo', promotions: null },
  ] } } } };
  const r = J.lerEpicGratis(d, Date.parse('2026-11-16T12:00:00Z'));
  assert.deepEqual(r.agora.map((x) => x.nome), ['Knightica']);
  assert.equal(r.agora[0].url, 'https://store.epicgames.com/pt-BR/p/knightica-3be45c');
  assert.deepEqual(r.depois.map((x) => x.nome), ['Mark of the Deep']);
});

test('manchetes do Google Notícias sem o nome do jornal', () => {
  const xml = '<rss><channel><title>Principais</title><item><title>Chuva forte atinge o litoral do RJ - G1</title></item><item><title><![CDATA[Dólar fecha em queda &amp; bolsa sobe - Valor]]></title></item></channel></rss>';
  assert.deepEqual(J.lerManchetes(xml), ['Chuva forte atinge o litoral do RJ', 'Dólar fecha em queda & bolsa sobe']);
});
