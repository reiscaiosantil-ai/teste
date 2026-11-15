/* Lumi — cérebro local: entende pedidos em português do dia a dia e devolve uma ação.
   Sem DOM e sem rede: as ações são executadas pelo app.js. Também roda no Node (testes). */
(function (raiz) {
  'use strict';

  const UNIDADES = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  };
  const DEZENAS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
  const B = '(^|[^\\p{L}\\d])', F = '(?=$|[^\\p{L}\\d])';

  /** Converte números por extenso ("vinte e cinco", "meia hora") em algarismos.
      Com `restrito`, só converte quando o número vem antes de uma unidade ("cinco minutos")
      ou depois de "às" ("às sete"), para não estragar textos como "fazer uma ligação". */
  function numeros(s, restrito) {
    const ok = (str, ini, fim) => !restrito
      || /^(?:\s+e\s+meia)?\s+(?:segundos?|seg|minutos?|mins?|horas?|h|copos?|garrafas?|dias?|semanas?)(?=$|[^\p{L}])/u.test(str.slice(fim))
      || /(?:^|\s)(?:[àa]s?|pras?|para as|at[eé] as)\s$/u.test(str.slice(0, ini));
    let t = ' ' + s + ' ';
    const dz = Object.keys(DEZENAS).join('|'), un = Object.keys(UNIDADES).join('|');
    t = t.replace(new RegExp(B + '(' + dz + ') e (' + un + ')' + F, 'giu'), (m, a, d, u, o, str) =>
      ok(str, o + a.length, o + m.length) ? a + (DEZENAS[d.toLowerCase()] + UNIDADES[u.toLowerCase()]) : m);
    t = t.replace(new RegExp(B + '(' + dz + '|cem)' + F, 'giu'), (m, a, d, o, str) =>
      ok(str, o + a.length, o + m.length) ? a + (d.toLowerCase() === 'cem' ? 100 : DEZENAS[d.toLowerCase()]) : m);
    t = t.replace(new RegExp(B + 'meia hora' + F, 'giu'), (m, a) => a + '30 minutos');
    t = t.replace(new RegExp(B + '(' + un + ')' + F, 'giu'), (m, a, u, o, str) =>
      ok(str, o + a.length, o + m.length) ? a + UNIDADES[u.toLowerCase()] : m);
    return t.trim().replace(/\s+/g, ' ');
  }

  function normalizar(texto) {
    return String(texto || '').normalize('NFC').toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '').trim();
  }

  const num = (x) => parseFloat(String(x).replace(',', '.'));

  /** Durações: "10 minutos", "1 hora e meia", "30s", "2h30". Retorna { segundos, trechos }. */
  function duracao(n) {
    let seg = 0; const trechos = [];
    const re = /(\d+(?:[.,]\d+)?)\s*(segundos?|seg|s|minutos?|mins?|m|horas?|hs?)(?:\s*e\s*meia)?(?=$|[^\p{L}\d])/giu;
    let m;
    while ((m = re.exec(n))) {
      const v = num(m[1]), u = m[2].toLowerCase();
      const mult = /^h/.test(u) ? 3600 : /^m/.test(u) ? 60 : 1;
      seg += v * mult; if (/e\s*meia$/.test(m[0])) seg += mult === 3600 ? 1800 : 30;
      trechos.push(m[0]);
    }
    const hm = /(\d{1,2})h(\d{2})(?=$|[^\p{L}\d])/u.exec(n);
    if (!seg && hm) { seg = num(hm[1]) * 3600 + num(hm[2]) * 60; trechos.push(hm[0]); }
    return { segundos: Math.round(seg), trechos };
  }

  /** Horário do dia: "às 15h", "as 7:30 da manhã", "meio-dia", "amanhã às 9". Retorna { quando, trechos } ou null. */
  function horario(n, agora) {
    const base = new Date(agora);
    let h = null, mi = 0; const trechos = [];
    let m = /(?:(?:para |pra |até )?(?:[àa]s?|ao)\s+)?(meio[- ]dia|meia[- ]noite)/u.exec(n);
    if (m) { h = /meio/.test(m[1]) ? 12 : 0; trechos.push(m[0]); }
    if (h === null) {
      m = /(?:(?:para |pra )?[àa]s?\s+)(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:h(?:oras?)?|horas?)?(?:\s+(?:e\s+(\d{1,2})|da\s+(manh[ãa]|tarde|noite)|e meia))*/u.exec(n)
        || /(?:^|\s)(\d{1,2})[:h](\d{2})(?=$|\s)/u.exec(n);
      if (m) {
        h = parseInt(m[1], 10); mi = m[2] ? parseInt(m[2], 10) : m[3] ? parseInt(m[3], 10) : 0;
        if (/e meia/.test(m[0])) mi = 30;
        const periodo = m[4] || (/da\s+(manh[ãa]|tarde|noite)/u.exec(m[0]) || [])[1];
        if (periodo && /tarde|noite/.test(periodo) && h < 12) h += 12;
        if (periodo && /manh/.test(periodo) && h === 12) h = 0;
        trechos.push(m[0]);
      }
    }
    if (h === null || h > 23 || mi > 59) return null;
    const d = new Date(base); d.setSeconds(0, 0); d.setHours(h, mi);
    const amanha = /amanh[ãa]/u.exec(n);
    if (amanha) { d.setDate(d.getDate() + 1); trechos.push(amanha[0]); }
    else if (/(?:^|\s)hoje(?=$|\s)/.test(n)) trechos.push('hoje');
    if (!amanha && d.getTime() <= agora) {
      // "às 3" à tarde provavelmente quer dizer 15h; senão, amanhã
      if (h < 12 && !/manh/.test(n) && d.getTime() + 12 * 3600e3 > agora) d.setHours(h + 12);
      else d.setDate(d.getDate() + 1);
    }
    return { quando: d.getTime(), trechos };
  }

  function tirar(texto, trechos) {
    let t = ' ' + texto + ' ';
    for (const tr of trechos) if (tr) t = t.replace(tr, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  function limparPonta(t) {
    return t.replace(/^(?:de|para|pra|pro|que|a|o|em|daqui a|daqui|às|as|e|:|,|-)\s+/i, '')
      .replace(/\s+(?:em|daqui a|daqui|às|as|de|para|pra|pro|e|,)$/i, '').trim();
  }
  function limparTudo(t) { let a; do { a = t; t = limparPonta(t); } while (a !== t); return /^(?:de|para|pra|pro|que|a|o|em|e|às|as|daqui)$/i.test(t) ? '' : t; }
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  /* ===== calculadora segura (sem eval) ===== */
  function calcular(expr) {
    const s = expr.replace(/\s+/g, '');
    let i = 0;
    const olha = () => s[i];
    function numero() {
      const m = /^\d+(?:\.\d+)?/.exec(s.slice(i)); if (!m) throw new Error('número');
      i += m[0].length; return parseFloat(m[0]);
    }
    function fator() {
      if (olha() === '-') { i++; return -fator(); }
      if (olha() === '+') { i++; return fator(); }
      if (s.startsWith('sqrt(', i)) { i += 5; const v = soma(); if (olha() !== ')') throw new Error(')'); i++; return Math.sqrt(v); }
      let v;
      if (olha() === '(') { i++; v = soma(); if (olha() !== ')') throw new Error(')'); i++; } else v = numero();
      if (olha() === '%') { i++; v = v / 100; }
      if (olha() === '^') { i++; v = Math.pow(v, fator()); }
      return v;
    }
    function produto() { let v = fator(); while (olha() === '*' || olha() === '/') { const o = s[i++]; const d = fator(); v = o === '*' ? v * d : v / d; } return v; }
    function soma() { let v = produto(); while (olha() === '+' || olha() === '-') { const o = s[i++]; const d = produto(); v = o === '+' ? v + d : v - d; } return v; }
    const r = soma(); if (i !== s.length || !isFinite(r)) throw new Error('expressão');
    return r;
  }
  function expressao(n) {
    let e = n.replace(/raiz(?: quadrada)? de (\d+(?:[.,]\d+)?)/g, 'sqrt($1)')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/\bmais\b/g, '+').replace(/\bmenos\b/g, '-')
      .replace(/\b(?:vezes|multiplicado por)\b|×/g, '*').replace(/(\d)\s*x\s*(\d)/g, '$1*$2')
      .replace(/\bdividido por\b|÷/g, '/').replace(/\belevado a\b/g, '^').replace(/\bao quadrado\b/g, '^2').replace(/\bao cubo\b/g, '^3')
      .replace(/\bpor cento\b/g, '%');
    if (!/^[\d\s+\-*/^().%sqrt]+$/.test(e) || !/\d/.test(e)) return null;
    try { return calcular(e); } catch (_) { return null; }
  }
  const fmtNum = (v) => (Math.round(v * 1e6) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 6 });

  /* ===== datas especiais ===== */
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }
  function diasAte(alvo, agora) {
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
    const fazer = (ano) => {
      if (alvo === 'natal') return new Date(ano, 11, 25);
      if (alvo === 'ano novo') return new Date(ano + 1, 0, 1);
      if (alvo === 'carnaval') { const p = pascoa(ano); p.setDate(p.getDate() - 47); return p; }
      if (alvo === 'pascoa') return pascoa(ano);
      if (alvo === 'dia das criancas') return new Date(ano, 9, 12);
      const m = /^(\d{1,2})\/(\d{1,2})$/.exec(alvo); if (m) return new Date(ano, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      return null;
    };
    let d = fazer(hoje.getFullYear()); if (!d) return null;
    if (alvo === 'ano novo') d = new Date(hoje.getFullYear() + 1, 0, 1);
    else if (d < hoje) d = fazer(hoje.getFullYear() + 1);
    return { dias: Math.round((d - hoje) / 864e5), data: d.getTime() };
  }

  /* ===== tabelas ===== */
  const IDIOMAS = { 'inglês': 'en', ingles: 'en', espanhol: 'es', 'francês': 'fr', frances: 'fr', italiano: 'it', 'alemão': 'de', alemao: 'de', 'japonês': 'ja', japones: 'ja', 'chinês': 'zh-CN', chines: 'zh-CN', russo: 'ru', coreano: 'ko', 'português': 'pt-BR', portugues: 'pt-BR', 'árabe': 'ar', arabe: 'ar', holandês: 'nl', holandes: 'nl' };
  const MOEDAS = [[/d[oó]lar/, 'USD', 'dólar'], [/euro/, 'EUR', 'euro'], [/bitcoin|btc/, 'BTC', 'bitcoin'], [/libra/, 'GBP', 'libra'], [/peso argentino/, 'ARS', 'peso argentino'], [/iene/, 'JPY', 'iene'], [/ethereum|eth\b/, 'ETH', 'ethereum']];
  const SITES = {
    youtube: 'https://www.youtube.com', gmail: 'https://mail.google.com', 'e-mail': 'https://mail.google.com', email: 'https://mail.google.com', whatsapp: 'https://web.whatsapp.com', zap: 'https://web.whatsapp.com',
    instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com', twitter: 'https://x.com', netflix: 'https://www.netflix.com', spotify: 'https://open.spotify.com',
    agenda: 'https://calendar.google.com', 'calendário': 'https://calendar.google.com', calendario: 'https://calendar.google.com', mapa: 'https://maps.google.com', mapas: 'https://maps.google.com', maps: 'https://maps.google.com',
    drive: 'https://drive.google.com', linkedin: 'https://www.linkedin.com', github: 'https://github.com', tiktok: 'https://www.tiktok.com', claude: 'https://claude.ai', google: 'https://www.google.com',
    tradutor: 'https://translate.google.com', 'notícias': 'https://news.google.com/?hl=pt-BR&gl=BR&ceid=BR:pt-419', noticias: 'https://news.google.com/?hl=pt-BR&gl=BR&ceid=BR:pt-419',
  };
  const ACESSORIOS_FALA = [
    [/chap[eé]u de festa|festa/, 'festa'], [/coroa/, 'coroa'], [/fones?/, 'fones'], [/la[cç]o|lacinho/, 'laco'], [/gorro de natal|touca de natal|natal/, 'natal'], [/gorro|touca/, 'gorro'],
    [/bon[eé]/, 'bone'], [/[oó]culos/, 'oculos'], [/aur[eé]ola|anjinho/, 'aureola'], [/chifr/, 'chifres'], [/flor/, 'flor'], [/cartola/, 'cartola'],
  ];
  const CORES_FALA = [[/branc|nuvem/, 0], [/verde[- ]?[aá]gua|[aá]gua|turquesa|menta/, 1], [/coral|laranja|p[eê]ssego/, 2], [/lavanda|roxo|lil[aá]s/, 3], [/lim[aã]o|amarel/, 4], [/azul|c[eé]u/, 5], [/rosa/, 6], [/preto|cinza|escur|noite|grafite/, 7], [/dourad|ouro|mel/, 8], [/verde/, 1]];

  const PIADAS = [
    'Por que o livro de matemática ficou triste? Porque tinha muitos problemas.',
    'O que o zero disse para o oito? Que cinto bonito!',
    'Por que a plantinha não foi atendida no hospital? Porque só tinha médico de plantão.',
    'Qual é o café mais perigoso do mundo? O ex-presso.',
    'O que o pato disse para a pata? Vem quá!',
    'Por que o computador foi ao médico? Porque estava com vírus.',
    'Qual é o contrário de volátil? Vem cá, sobrinho.',
    'Por que o esqueleto não brigou? Porque não tinha estômago pra isso.',
    'O que é um pontinho amarelo no céu? Um yellowcóptero.',
    'Sabe por que o mar não seca? Porque não tem toalha grande o suficiente.',
    'Como o elétron atende o telefone? Próton!',
    'Por que a vaca foi pro espaço? Pra se encontrar com a Via Láctea.',
  ];

  /* ===== interpretação ===== */
  /**
   * @param {string} texto  frase do usuário
   * @param {{agora?:number, nome?:string}} ctx
   * @returns {object} ação, sempre com `tipo`
   */
  function interpretar(texto, ctx = {}) {
    const agora = ctx.agora || Date.now();
    const nome = normalizar(ctx.nome || 'lumi');
    let s = normalizar(texto);
    // tira o chamado ("ei, lumi", "lumi,")
    s = s.replace(new RegExp('^(?:(?:ei|oi|ô|o|hey|e aí)[,\\s]+)?' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,!\\s]*', 'u'), '').trim();
    if (!s) return /^(?:oi|ol[aá]|e a[ií]|bom dia|boa tarde|boa noite)/u.test(normalizar(texto)) ? { tipo: 'saudacao', s: normalizar(texto) } : { tipo: 'chamado' };
    const n = numeros(s), nt = numeros(s, true);
    const temHora = /(?:^|\s)[àa]s?\s+(?:\d|[a-zà-ú]+\s*(?:h|horas?|da|e meia|$))|meio[- ]dia|meia[- ]noite|(?:^|\s)\d{1,2}:\d{2}/u.test(nt);

    // parar / silêncio
    if (/^(?:para|pare|chega|cancela|cancelar|sil[eê]ncio|cala a boca|fica quieto|quieto|shh+|psiu|stop)$/u.test(s)) return { tipo: 'parar' };

    // ajuda
    if (/^(?:ajuda|socorro|comandos)$|o que (?:voc[eê] |vc )?(?:faz|sabe fazer|pode fazer|consegue fazer)|como (?:eu )?(?:te )?uso/u.test(s)) return { tipo: 'ajuda' };

    // coisas que só um app de desktop com permissões faz
    if (/(?:desliga|desligar|reinicia|reiniciar|hiberna|suspende)\s+(?:o\s+)?(?:pc|computador|notebook|m[aá]quina)|organiza\s+(?:a\s+)?(?:minha\s+)?[aá]rea de trabalho|(?:procura|acha|encontra)\s+(?:o\s+|um\s+)?arquivo|fecha\s+(?:o\s+)?(?:programa|aplicativo|app|chrome)|(?:cria|criar)\s+(?:uma\s+)?pasta|abre\s+(?:a\s+)?pasta/u.test(s)) {
      return { tipo: 'desktop', pedido: s };
    }

    // cancelar timers
    if (/(?:cancela|cancelar|para|parar|apaga|remove|desliga)\s+(?:o\s+|os\s+|todos os\s+)?(?:timers?|temporizador(?:es)?)/u.test(s)) return { tipo: 'timer_cancelar' };

    // cronômetro (sem duração)
    if (/cron[oô]metro/u.test(s) && !duracao(nt).segundos) {
      if (/(?:para|pausa|pare|pausar|parar)/u.test(s)) return { tipo: 'crono', acao: 'pausar' };
      if (/(?:zera|zerar|reinicia|reset)/u.test(s)) return { tipo: 'crono', acao: 'zerar' };
      return { tipo: 'crono', acao: 'iniciar' };
    }

    // modo foco / pausa (pomodoro)
    if (/modo (?:foco|estudo|concentra[cç][aã]o|trabalho)|pomodoro|hora de (?:estudar|focar)/u.test(s)) {
      const d = duracao(nt).segundos; return { tipo: 'timer', segundos: d || 25 * 60, nome: 'Foco' };
    }
    if (/modo (?:pausa|descanso)|hora do intervalo/u.test(s)) { const d = duracao(nt).segundos; return { tipo: 'timer', segundos: d || 5 * 60, nome: 'Pausa' }; }

    // alarme
    if (/alarme|despertador|me acorda/u.test(s)) {
      const h = horario(nt, agora);
      if (/(?:cancela|apaga|desliga|remove)/u.test(s)) return { tipo: 'alarme_cancelar' };
      if (!h) { const d = duracao(nt); if (d.segundos) return { tipo: 'alarme', quando: agora + d.segundos * 1000, texto: 'Alarme' }; return { tipo: 'pergunta', texto: 'Pra que horas eu coloco o alarme? Diga, por exemplo, "alarme às 7h".' }; }
      return { tipo: 'alarme', quando: h.quando, texto: 'Alarme' };
    }

    // timer
    if (/(?:^|\s)(?:timer|temporizador|timers)(?:\s|$)|cronometra|^me avisa (?:em|daqui)|^avisa (?:em|daqui)/u.test(s)) {
      const d = duracao(nt);
      if (!d.segundos) return { tipo: 'pergunta', texto: 'De quanto tempo? Diga, por exemplo, "timer de 10 minutos".' };
      let resto = tirar(nt, d.trechos).replace(/(?:^|\s)(?:coloca|cria|inicia|liga|bota|põe|poe|faz|faça|um|uma|o|timer|temporizador|cronometra|me avisa|avisa)(?=\s|$)/gu, ' ');
      resto = limparTudo(resto.replace(/\s+/g, ' ').trim()).replace(/^(?:o|a|os|as)\s+/, '');
      return { tipo: 'timer', segundos: d.segundos, nome: cap(resto) || 'Timer' };
    }

    // lembrete
    if (/(?:me\s+)?lembr[ae]r?\b|lembrete|me avisa (?:de|que|para|pra)|n[aã]o me deixa esquecer/u.test(s)) {
      const h = temHora ? horario(nt, agora) : null; const d = h ? { segundos: 0, trechos: [] } : duracao(nt);
      const quando = d.segundos ? agora + d.segundos * 1000 : h ? h.quando : null;
      let resto = tirar(nt, d.segundos ? d.trechos.concat(['daqui a', 'daqui']) : h ? h.trechos : []);
      resto = resto.replace(/^(?:cria|coloca|adiciona|bota|põe)?\s*(?:um\s+)?(?:lembrete|me\s+lembr[ae]r?|n[aã]o me deixa esquecer|me avisa)\s*/u, '');
      resto = limparTudo(resto);
      if (!resto) return { tipo: 'pergunta', texto: 'Do que eu devo te lembrar?' };
      if (!quando) return { tipo: 'pergunta', texto: `Quando eu te lembro de "${resto}"? Diga "em 30 minutos" ou "às 15h".`, pendente: { tipo: 'lembrete', texto: cap(resto) } };
      return { tipo: 'lembrete', texto: cap(resto), quando };
    }

    // tarefas
    if (/^(?:quais s[aã]o |ver |lista |listar |mostra |me mostra |l[eê] )?(?:as )?(?:minhas )?tarefas(?: de hoje| pendentes)?$|o que (?:eu )?tenho (?:pra|para) (?:hoje|fazer)|minha lista/u.test(s)) return { tipo: 'tarefas_listar' };
    let m = /^(?:conclui|concluir|terminei|marca|marcar|finaliza|finalizar|fiz)\s+(?:a\s+)?(?:tarefa\s+)?(?:de\s+)?(.+?)(?:\s+como\s+(?:feita|conclu[ií]da))?$/u.exec(s);
    if (m && /tarefa|como (?:feita|conclu)|^terminei|^conclui/u.test(s)) return { tipo: 'tarefa_concluir', busca: m[1].replace(/^tarefa\s+/, '') };
    m = /^(?:cria|criar|crie|adiciona|adicionar|adicione|nova|novo|coloca|bota|põe|poe|anota|registra|inclui)\s+(?:uma\s+|a\s+)?(?:nova\s+)?tarefas?\s*(?:de|:|para|pra|que|na lista)?\s*(.*)$|^tarefa\s*:?\s+(.+)$/u.exec(s);
    if (m) {
      const bruto = (m[1] || m[2] || '').trim();
      if (!bruto) return { tipo: 'pergunta', texto: 'Qual é a tarefa?' };
      const nb = numeros(bruto, true); const h = horario(nb, agora);
      const t = limparTudo(h ? tirar(nb, h.trechos) : bruto).replace(/\s+(?:hoje|amanh[ãa])$/u, '');
      return { tipo: 'tarefa', texto: cap(t || bruto), quando: h ? h.quando : null };
    }

    // notas
    if (/^(?:minhas |as |ver |l[eê] |mostra )*(?:minhas )?(?:notas|anota[cç][oõ]es)$/u.test(s)) return { tipo: 'notas_listar' };
    m = /^(?:anota|anotar|anote|toma nota|salva|guarda)\s*(?:uma nota|um lembrete|isso|a[ií])?\s*(?:que|:|de que)?\s+(.+)$|^nota\s*:\s*(.+)$/u.exec(s);
    if (m) return { tipo: 'nota', texto: cap((m[1] || m[2]).trim()) };

    // hábitos
    if (/(?:bebi|tomei|acabei de beber)\b.*[aá]gua|[aá]gua.*(?:bebi|tomei)|^mais um copo/u.test(s)) {
      const q = /(\d+)\s*(?:copos?|garrafas?)/.exec(n); return { tipo: 'habito', habito: 'agua', qtd: q ? Math.min(8, parseInt(q[1], 10)) : 1 };
    }
    if (/(?:fiz|terminei|acabei)\s+(?:o\s+|a\s+|meu\s+|minha\s+)?(?:exerc[ií]cio|academia|treino|caminhada|corrida|alongamento)/u.test(s)) return { tipo: 'habito', habito: 'exercicio', qtd: 1 };
    if (/(?:^li\b|terminei de ler|fiz (?:a\s+)?(?:minha\s+)?leitura|li um cap[ií]tulo)/u.test(s)) return { tipo: 'habito', habito: 'leitura', qtd: 1 };
    if (/quanta [aá]gua|quantos copos/u.test(s)) return { tipo: 'habitos_ver' };

    // música
    if (/o que (?:est[aá]|t[aá]) tocando|que m[uú]sica (?:[eé] essa|[eé] esta|t[aá] tocando|est[aá] tocando)|qual (?:[eé] )?(?:a |essa |esta )?m[uú]sica|quem (?:canta|t[aá] cantando|est[aá] cantando)/u.test(s)) return { tipo: 'musica_atual' };
    if (/^(?:pausa|pausar|pause|para a m[uú]sica|para de tocar|para o som|pausa a m[uú]sica)$/u.test(s)) return { tipo: 'musica', acao: 'pausar' };
    if (/^(?:continua|continuar|despausa|volta a tocar|retoma|play|solta o som)$/u.test(s)) return { tipo: 'musica', acao: 'continuar' };
    if (/^(?:pr[oó]xima|pula|pular|avan[cç]a|passa)(?: (?:a )?m[uú]sica| essa)?$|^pr[oó]xima m[uú]sica$/u.test(s)) return { tipo: 'musica', acao: 'proxima' };
    if (/^(?:anterior|volta|voltar)(?: (?:a )?m[uú]sica)?$|^m[uú]sica anterior$/u.test(s)) return { tipo: 'musica', acao: 'anterior' };
    m = /volume\s+(?:em|para|pra|no|a)?\s*(\d{1,3})/u.exec(n);
    if (m) return { tipo: 'volume', valor: Math.max(0, Math.min(100, parseInt(m[1], 10))) };
    if (/(?:aumenta|sobe|aumentar|mais alto|subir)\s*(?:o\s+)?(?:volume|som)?|volume (?:mais )?alto/u.test(s) && /volume|som|alto/u.test(s)) return { tipo: 'volume', delta: 15 };
    if (/(?:diminui|abaixa|baixa|diminuir|abaixar|mais baixo)\s*(?:o\s+)?(?:volume|som)?/u.test(s) && /volume|som|baixo/u.test(s)) return { tipo: 'volume', delta: -15 };
    if (/^(?:muta|mutar|silencia|sem som|tira o som|mudo)$/u.test(s)) return { tipo: 'volume', valor: 0 };
    m = /^(toca|tocar|toque|coloca|bota|põe|poe|p[oõ]e pra tocar|quero ouvir|play)\s+(.*)$/u.exec(s);
    if (m && /^(?:coloca|bota|põe|poe)$/u.test(m[1]) && ACESSORIOS_FALA.some(([re]) => re.test(m[2]))) m = null;
    if (m) m = [m[0], m[2]];
    if (m && !/tarefa|lembrete|timer|alarme/u.test(m[1])) {
      let q = m[1].replace(/(?:^|\s+)(?:na|no)\s+(?:caixa|sala|quarto|celular|pc|spotify|youtube).*$/u, '')
        .replace(/^(?:uma|um|a|o|as|os|algumas?)\s+/u, '').replace(/^(?:m[uú]sicas?|can[cç][aã]o|som|playlist)\s*(?:d[oae]s?\s+)?/u, '').trim();
      const ondeYt = /youtube/.test(m[1]);
      if (/^(?:algo|alguma coisa|qualquer coisa|qualquer uma)$/.test(q)) q = '';
      return { tipo: 'musica', acao: 'tocar', busca: q, youtube: ondeYt };
    }
    if (/^(?:m[uú]sica|toca|tocar|play)$/u.test(s)) return { tipo: 'musica', acao: 'tocar', busca: '' };

    // clima
    if (/clima|vai chover|chover|chuva|temperatura|previs[aã]o|guarda[- ]chuva|faz(?:endo)? (?:frio|calor)|como (?:est[aá]|t[aá]) o tempo|tempo (?:hoje|amanh[ãa]|agora|l[aá] fora)/u.test(s)) {
      const c = /(?:em|no|na|de)\s+([a-zà-ú][a-zà-ú\s'-]{2,})$/u.exec(s.replace(/\b(?:hoje|amanh[ãa]|agora|l[aá] fora)\b/gu, '').trim());
      const cidade = c && !/^(?:hoje|amanh|agora|tempo|clima)/u.test(c[1]) ? c[1].trim() : '';
      return { tipo: 'clima', amanha: /amanh[ãa]/u.test(s), cidade, chuva: /chov|chuva|guarda/u.test(s) };
    }

    // cotação
    for (const [re, cod, rot] of MOEDAS) if (re.test(s) && (/quanto|cota[cç][aã]o|pre[cç]o|valor|t[aá] |est[aá]|hoje|^(?:o\s+)?\S+$/u.test(s) || /^(?:e o|e a)\s/.test(s))) {
      const q = /(\d+(?:[.,]\d+)?)\s*(?:d[oó]lares|d[oó]lar|euros?|bitcoins?|libras?)/u.exec(n);
      return { tipo: 'cotacao', moeda: cod, rotulo: rot, qtd: q ? num(q[1]) : 1 };
    }

    // porcentagem e contas
    m = /(\d+(?:[.,]\d+)?)\s*(?:%|por cento)\s*(?:de|sobre|do|da)\s*(\d+(?:[.,]\d+)?)/u.exec(n);
    if (m) { const v = num(m[1]) / 100 * num(m[2]); return { tipo: 'conta', expr: `${m[1]}% de ${m[2]}`, resultado: v, texto: fmtNum(v) }; }
    m = /^(?:quanto (?:[eé]|da|d[aá]|fica)|calcula|calcule|conta|quantos? (?:[eé]|s[aã]o))\s+(.+)$/u.exec(n) || (/^[\d\s+\-*/x×÷^().,%]+$/.test(n) && /\d\s*[+\-*/x×÷^]\s*\d/.test(n) ? [n, n] : null);
    if (m) { const v = expressao(m[1].replace(/^(?:a conta|o resultado de|a|o)\s+/, '')); if (v !== null) return { tipo: 'conta', expr: m[1], resultado: v, texto: fmtNum(v) }; }

    // tradução
    m = /^(?:traduz|traduza|traduzir|tradu[cç][aã]o)\s+(?:isso\s+|essa frase\s+|a frase\s+)?(?:para|pro|pra|em)\s+(?:o\s+)?([a-zà-ú]+)\s*[:,]?\s+(.+)$/u.exec(s)
      || (() => { const r = /^(?:traduz|traduza|traduzir)\s+(.+?)\s+(?:para|pro|pra|em)\s+(?:o\s+)?([a-zà-ú]+)$/u.exec(s); return r ? [r[0], r[2], r[1]] : null; })()
      || (() => { const r = /^como (?:[eé] que )?(?:se )?(?:diz|fala|escreve)\s+(.+?)\s+em\s+([a-zà-ú]+)$/u.exec(s); return r ? [r[0], r[2], r[1]] : null; })();
    if (m && IDIOMAS[m[1]]) return { tipo: 'traduzir', para: IDIOMAS[m[1]], idioma: m[1], texto: m[2].replace(/^["']|["']$/g, '') };

    // notícias
    if (/not[ií]cias?|o que (?:est[aá]|t[aá]) acontecendo|manchetes/u.test(s)) {
      const t = /not[ií]cias?\s+(?:de|sobre|do|da)\s+(.+)$/u.exec(s);
      return { tipo: 'noticias', assunto: t ? t[1].replace(/^hoje$/, '') : '' };
    }

    // utilidades
    m = /(?:gera|gerar|cria|criar|faz|me d[aá]|inventa|nova)\s+(?:(?:uma|1)\s+)?senha(?:\s+(?:forte\s+)?(?:de|com)\s+(\d+))?/u.exec(n);
    if (m || /^senha(?: de (\d+))?$/.test(n)) { const t = m && m[1] ? parseInt(m[1], 10) : (/(\d+)/.exec(n) || [])[1]; return { tipo: 'senha', tamanho: Math.max(8, Math.min(64, parseInt(t || 16, 10))) }; }
    if (/(?:copia|copiar|copie|cola|manda|qual [eé])\s+(?:o\s+)?(?:meu\s+)?pix|^meu pix$|chave pix/u.test(s)) return { tipo: 'pix' };
    if (/cara ou coroa|joga (?:uma )?moeda/u.test(s)) return { tipo: 'moeda' };
    if (/(?:joga|rola|lan[cç]a|jogar|rolar)\s+(?:um\s+|o\s+)?dado/u.test(s)) return { tipo: 'dado' };
    m = /(?:sorteia|sortear|escolhe|escolha|n[uú]mero aleat[oó]rio|(?:um|1) n[uú]mero)\s*(?:(?:um|1) n[uú]mero\s*)?(?:aleat[oó]rio\s*)?(?:de|entre)\s+(\d+)\s+(?:a|e|at[eé])\s+(\d+)/u.exec(n);
    if (m) return { tipo: 'sorteio', de: parseInt(m[1], 10), ate: parseInt(m[2], 10) };
    if (/piada|me faz rir|algo engra[cç]ado|conta uma boa/u.test(s)) return { tipo: 'piada', indice: Math.floor((agora / 1000) % PIADAS.length) };
    m = /quantos dias (?:faltam|falta|at[eé]|pra|para)\s*(?:o\s+|a\s+|pro\s+|pra\s+|para o\s+|para a\s+|at[eé] o\s+|at[eé] a\s+)?(natal|ano novo|r[eé]veillon|carnaval|p[aá]scoa|dia das crian[cç]as|(\d{1,2})\/(\d{1,2}))/u.exec(s);
    if (m) {
      const alvo = m[2] ? `${m[2]}/${m[3]}` : m[1].replace(/r[eé]veillon/, 'ano novo').replace(/p[aá]scoa/, 'pascoa').replace(/crian[cç]as/, 'criancas');
      const r = diasAte(alvo, agora); if (r) return { tipo: 'dias', alvo: m[1], ...r };
    }
    if (/que horas (?:s[aã]o|[eé])|^horas$|me diz as horas|^que horas$/u.test(s)) return { tipo: 'hora' };
    if (/que dia (?:[eé] )?hoje|qual (?:[eé] )?a data|que data [eé] hoje|dia da semana/u.test(s)) return { tipo: 'data' };
    if (/como (?:est[aá]|t[aá]|anda) (?:o\s+)?(?:meu\s+)?(?:pc|computador|notebook|sistema)|bateria|status do (?:pc|sistema)/u.test(s)) return { tipo: 'pc' };

    // pesquisa e sites
    m = /^(?:pesquisa|pesquisar|pesquise|procura|procurar|busca|buscar|googla|joga no google)\s+(?:no google\s+|na internet\s+)?(?:por\s+|sobre\s+)?(.+)$/u.exec(s);
    if (m) return { tipo: 'pesquisar', busca: m[1] };
    m = /^(?:abre|abrir|abra|entra no|entra na|vai no|vai na|acessa)\s+(?:o\s+|a\s+|meu\s+|minha\s+)?(.+)$/u.exec(s);
    if (m) {
      const alvo = m[1].trim();
      const chave = Object.keys(SITES).find((k) => alvo === k || alvo.startsWith(k + ' ') || alvo.endsWith(' ' + k));
      if (chave) return { tipo: 'abrir', url: SITES[chave], nome: chave };
      if (/^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/.test(alvo)) return { tipo: 'abrir', url: 'https://' + alvo, nome: alvo };
      return { tipo: 'desktop', pedido: s };
    }

    // personalização
    m = /(?:muda|mudar|troca|trocar|fica|deixa)\s+(?:a\s+)?(?:sua\s+)?(?:cor\s+)?(?:para|pra|de|em)?\s*(?:a\s+cor\s+)?([a-zà-ú\s-]+)$/u.exec(s);
    if (m && /cor/.test(s)) { const c = CORES_FALA.find(([re]) => re.test(m[1])); if (c) return { tipo: 'visual', corpo: c[1] }; }
    if (/(?:tira|tirar|remove)\s+(?:o\s+|a\s+|os\s+|seu\s+|sua\s+)?(?:acess[oó]rio|chap[eé]u|coroa|fones?|la[cç]o|gorro|bon[eé]|[oó]culos|aur[eé]ola|chifr|flor|cartola)/u.test(s)) return { tipo: 'visual', acessorio: 'nenhum' };
    m = /(?:coloca|colocar|p[oõ]e|bota|usa|veste|vestir|quero (?:ver )?voc[eê] de)\s+(?:o\s+|a\s+|um\s+|uma\s+|seu\s+|sua\s+)?(.+)$/u.exec(s);
    if (m) { const a = ACESSORIOS_FALA.find(([re]) => re.test(m[1])); if (a) return { tipo: 'visual', acessorio: a[1] }; }
    m = /(?:seu nome (?:agora )?(?:[eé]|vai ser|ser[aá])|vou te chamar de|te chamar de|teu nome [eé])\s+([a-zà-ú]+)/u.exec(s);
    if (m) return { tipo: 'renomear', nome: cap(m[1]) };
    m = /(?:meu nome [eé]|me chamo|pode me chamar de|me chama de|eu sou o|eu sou a)\s+([a-zà-ú]+(?:\s+[a-zà-ú]+)?)$/u.exec(s);
    if (m) return { tipo: 'usuario', nome: m[1].split(' ').map(cap).join(' ') };

    // humor e papo
    if (/^(?:vai )?dorm(?:e|ir)|vai descansar|boa noite,? (?:lumi|fofo)?$|^tira um cochilo/u.test(s)) return { tipo: 'dormir' };
    if (/^(?:acorda|acordar)$/u.test(s)) return { tipo: 'acordar' };
    if (/^(?:oi+|ol[aá]|e a[ií]|eai|opa|hey|bom dia|boa tarde|boa noite|salve|fala a[ií])\b/u.test(s)) return { tipo: 'saudacao', s };
    if (/tudo (?:bem|bom|certo|joia|tranquilo)|como (?:voc[eê] |vc )?(?:est[aá]|t[aá]|vai)/u.test(s)) return { tipo: 'como_vai' };
    if (/obrigad|valeu|brigad|agrade[cç]o|muito bom|mandou bem|show de bola/u.test(s)) return { tipo: 'obrigado' };
    if (/quem [eé] voc[eê]|qual (?:[eé] )?(?:o )?seu nome|como voc[eê] se chama|voc[eê] [eé] (?:um )?rob[oô]/u.test(s)) return { tipo: 'quem' };
    if (/te amo|gosto (?:muito )?de voc[eê]|voc[eê] [eé] (?:fofo|lindo|demais|incr[ií]vel|o melhor)/u.test(s)) return { tipo: 'carinho' };
    if (/voc[eê] [eé] (?:chato|burro|feio|in[uú]til|ruim)|te odeio/u.test(s)) return { tipo: 'ofensa' };

    return { tipo: 'desconhecido', texto: s };
  }

  const api = { interpretar, numeros, duracao, horario, expressao, diasAte, normalizar, PIADAS, IDIOMAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.CEREBRO = api;
})(typeof window !== 'undefined' ? window : globalThis);
