/* Lumi — organizador: lista de compras, controle de gastos e modo estudo (pomodoro).
   Entende as frases e faz as contas; quem guarda e desenha é o app.js.
   Sem DOM e sem rede, para rodar também no Node (testes). */
(function (raiz) {
  'use strict';
  const C = raiz.CEREBRO || (typeof require === 'function' ? require('./cerebro.js') : null);
  const DIA = 864e5;
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  /* ================= números e períodos ================= */
  /** "25,90" → 25.9 · "1.200,50" → 1200.5 · "1.200" → 1200 · "25.90" → 25.9 */
  function valorBR(s) {
    s = String(s || '').replace(/\s+/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(',', '.');
    const v = parseFloat(s);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }
  /** Lê "hoje", "ontem", "essa semana", "esse mês", "mês passado" no texto. */
  function lerPeriodo(t, padrao) {
    const s = semAcento(t);
    if (/\bontem\b/.test(s)) return 'ontem';
    if (/\bhoje\b/.test(s)) return 'hoje';
    if (/semana passada/.test(s)) return 'semana_passada';
    if (/\bsemana\b/.test(s)) return 'semana';
    if (/mes passado/.test(s)) return 'mes_passado';
    if (/\bmes\b/.test(s)) return 'mes';
    return padrao;
  }
  /** [início, fim) do período em milissegundos. A semana começa na segunda-feira. */
  function intervalo(periodo, agora = Date.now()) {
    const h = new Date(agora); h.setHours(0, 0, 0, 0);
    const hoje = h.getTime();
    const seg = hoje - ((h.getDay() + 6) % 7) * DIA;
    const m1 = new Date(h.getFullYear(), h.getMonth(), 1).getTime();
    switch (periodo) {
      case 'hoje': return [hoje, hoje + DIA];
      case 'ontem': return [hoje - DIA, hoje];
      case 'semana': return [seg, seg + 7 * DIA];
      case 'semana_passada': return [seg - 7 * DIA, seg];
      case 'mes_passado': return [new Date(h.getFullYear(), h.getMonth() - 1, 1).getTime(), m1];
      default: return [m1, new Date(h.getFullYear(), h.getMonth() + 1, 1).getTime()];
    }
  }
  const NOME_PERIODO = { hoje: 'hoje', ontem: 'ontem', semana: 'nesta semana', semana_passada: 'na semana passada', mes: 'neste mês', mes_passado: 'no mês passado' };

  /* ================= gastos ================= */
  const CATEGORIAS = [
    ['Mercado', '🛒', /mercado|supermercado|padaria|feira|acougue|hortifruti|atacad|assai|carrefour|compras/],
    ['Comida', '🍔', /ifood|lanche|restaurante|pizza|almoco|jantar|cafe|hamburguer|acai|sorvete|delivery|marmita|bar\b|cerveja|comida/],
    ['Transporte', '🚗', /uber|\b99\b|gasolina|combustivel|onibus|metro|estacionamento|pedagio|taxi|passagem|oficina|carro|moto/],
    ['Contas', '🧾', /luz|energia|agua|internet|aluguel|condominio|celular|telefone|boleto|fatura|conta\b|conta de|gas\b/],
    ['Saúde', '💊', /farmacia|remedio|medico|consulta|dentista|exame|academia|plano de saude/],
    ['Estudo', '📚', /faculdade|curso|livro|mensalidade|apostila|escola|unicesumar|material/],
    ['Lazer', '🎮', /jogo|steam|cinema|netflix|spotify|show|ingresso|passeio|viagem|game|psn|xbox|assinatura/],
    ['Casa', '🏠', /casa|movel|moveis|limpeza|ferramenta|reforma|eletro/],
    ['Roupas', '👕', /roupa|tenis|camisa|calca|sapato|loja/],
  ];
  /** Categoria pelo que foi dito ("uber" → Transporte). */
  function categoria(desc) {
    const s = semAcento(desc);
    for (const [n, , re] of CATEGORIAS) if (re.test(s)) return n;
    return 'Outros';
  }
  const iconeCategoria = (n) => (CATEGORIAS.find((c) => c[0] === n) || [, '💸'])[1];
  /** Soma dos gastos no período, com o total por categoria (maior primeiro). */
  function resumoGastos(gastos, periodo, agora = Date.now(), cat) {
    const [a, b] = intervalo(periodo, agora);
    const doPeriodo = (gastos || []).filter((g) => g.ts >= a && g.ts < b && (!cat || g.cat === cat));
    const por = {};
    for (const g of doPeriodo) por[g.cat] = Math.round(((por[g.cat] || 0) + g.valor) * 100) / 100;
    const total = Math.round(doPeriodo.reduce((s, g) => s + g.valor, 0) * 100) / 100;
    return { total, qtd: doPeriodo.length, categorias: Object.entries(por).sort((x, y) => y[1] - x[1]), itens: doPeriodo };
  }

  /* ================= estudo ================= */
  /** Minutos estudados no período, por matéria (maior primeiro). */
  function resumoEstudo(sessoes, periodo, agora = Date.now()) {
    const [a, b] = intervalo(periodo, agora);
    const por = {};
    let total = 0;
    for (const s of sessoes || []) if (s.ts >= a && s.ts < b) { por[s.materia] = (por[s.materia] || 0) + s.min; total += s.min; }
    return { total, materias: Object.entries(por).sort((x, y) => y[1] - x[1]) };
  }
  /** 90 → "1h30", 45 → "45 min", 120 → "2h". */
  const horasTxt = (min) => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`; };
  /** Dias seguidos (até hoje ou ontem) com pelo menos uma sessão. */
  function sequenciaEstudo(sessoes, agora = Date.now()) {
    const dias = new Set((sessoes || []).map((s) => { const d = new Date(s.ts); d.setHours(0, 0, 0, 0); return d.getTime(); }));
    const h = new Date(agora); h.setHours(0, 0, 0, 0);
    let dia = h.getTime(); if (!dias.has(dia)) dia -= DIA;
    let n = 0; while (dias.has(dia)) { n++; dia = new Date(new Date(dia).setDate(new Date(dia).getDate() - 1)).getTime(); }
    return n;
  }
  /** Pausa depois do n-ésimo pomodoro: 15 min a cada 4, senão 5. */
  const pausaDepois = (ciclo) => (ciclo > 0 && ciclo % 4 === 0 ? 15 : 5);
  /** Tira a duração ("por 50 minutos", "de 1 hora") e devolve { minutos, resto }. */
  function tirarDuracao(t) {
    let minutos = null;
    const resto = t.replace(/\s*\b(?:por|durante|de)?\s*(\d+(?:[.,]\d+)?)\s*(minutos?|mins?|min|horas?|h)\b/u, (_m, n, u) => {
      const v = parseFloat(n.replace(',', '.')); minutos = /^h/.test(u) ? Math.round(v * 60) : Math.round(v); return ' ';
    }).replace(/\s*e meia\b/, () => { if (minutos) minutos += 30; return ' '; });
    return { minutos, resto: resto.replace(/\s+/g, ' ').trim() };
  }
  const limparMateria = (t) => cap(String(t || '').replace(/^(?:um pouco|um tempo)\s+/, '').replace(/^(?:de|sobre|pra|para|a|o)\s+(?:a\s+)?(?:prova\s+de\s+|mat[eé]ria\s+(?:de\s+)?)?/, '').replace(/\s+(?:agora|ent[aã]o|a[ií])$/, '').trim()) || '';

  /* ================= lista de compras ================= */
  /** "leite, pão e 2 ovos" → ["Leite", "Pão", "2 ovos"] */
  const itens = (t) => String(t).split(/\s*,\s*|\s+e\s+/u).map((x) => x.replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/, '').trim()).filter(Boolean).map(cap);
  /** Acha na lista o item com esse nome (ignora acento e plural simples). */
  function acharItem(lista, nome) {
    const n = semAcento(nome).replace(/s$/, '');
    if (!n) return null;
    const palavras = (t) => semAcento(t).split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/s$/, ''));
    const contem = (a, b) => b.length > 0 && b.every((w) => a.includes(w)); // todas as palavras de b estão em a
    const q = palavras(nome);
    return (lista || []).find((i) => semAcento(i.t).replace(/s$/, '') === n)
      || (lista || []).find((i) => { const x = palavras(i.t); return contem(x, q) || contem(q, x); }) || null;
  }
  /** Texto pronto para mandar no WhatsApp. */
  function listaTexto(lista) {
    const falta = (lista || []).filter((i) => !i.feito);
    return falta.length ? '🛒 Lista de compras:\n' + falta.map((i) => '• ' + i.t).join('\n') : '';
  }

  /* ================= entender a frase ================= */
  const LISTA = String.raw`(?:minha\s+)?lista(?:\s+de\s+compras?|\s+do\s+mercado)?`;
  /**
   * Devolve uma ação do organizador ou null (aí o cérebro normal decide).
   * op: { nome, compras } — o nome da assistente (para tirar "Lumi, …") e a lista atual
   * (para "comprei X" só valer quando X está na lista).
   */
  function interpretar(texto, op = {}) {
    let s = C.normalizar(texto);
    if (op.nome) {
      const nm = C.normalizar(op.nome).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`^(?:(?:ei|oi|ô|o|hey)\\s*,?\\s+)?${nm}\\s*[,:]?\\s+`, 'u'), '');
    }
    s = s.replace(/^(?:por favor\s*,?\s*)/, '').replace(/\s*,?\s*por favor$/, '');
    let m;

    /* ---- lista de compras ---- */
    if ((m = new RegExp(String.raw`^(?:adiciona|adicione|acrescenta|acrescente|coloca|coloque|p[oõ]e|ponha|bota|inclui|inclua|anota|bota)\s+(.+?)\s+(?:na|[aà])\s+${LISTA}$`, 'u').exec(s))) return { tipo: 'compras_add', itens: itens(m[1]) };
    if ((m = new RegExp(String.raw`^(?:na\s+)?${LISTA}\s*[:,]\s*(.+)$`, 'u').exec(s)) && !/^(?:o que|qual)/.test(m[1])) return { tipo: 'compras_add', itens: itens(m[1]) };
    if ((m = new RegExp(String.raw`^(?:tira|tire|remove|remova|retira|apaga)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+da\s+${LISTA}$`, 'u').exec(s))) return { tipo: 'compras_del', itens: itens(m[1]) };
    if ((m = new RegExp(String.raw`^(?:manda|mande|envia|envie|compartilha|passa)\s+(?:a\s+)?${LISTA}\s+(?:pro|pra|para\s+o|para\s+a|para|pelo whatsapp para|no whatsapp d[oa])\s+(.+)$`, 'u').exec(s))) return { tipo: 'compras_enviar', contato: m[1].split(' ').map(cap).join(' ') };
    if (new RegExp(String.raw`^(?:copia|copie)\s+(?:a\s+)?${LISTA}$`, 'u').test(s)) return { tipo: 'compras_copiar' };
    if ((m = new RegExp(String.raw`^(?:limpa|limpe|apaga|zera|esvazia)\s+(?:a\s+|os\s+)?(?:${LISTA}|(?:itens\s+)?comprados(?:\s+da\s+${LISTA})?)$`, 'u').exec(s))) return { tipo: 'compras_limpar', soComprados: /comprados/.test(s) };
    if (new RegExp(String.raw`^(?:(?:mostra|abre|ver|v[eê]|l[eê]|qual [eé]|como est[aá]|o que tem na|o que falta na)\s+(?:a\s+)?)?${LISTA}$|^o que (?:falta|tenho que|preciso) comprar$`, 'u').test(s) && /lista|comprar/.test(s)) return { tipo: 'compras_ver' };
    if ((m = /^(?:j[aá]\s+)?(?:comprei|peguei)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/u.exec(s))) {
      const its = itens(m[1]);
      if (its.length && its.every((i) => acharItem(op.compras, i))) return { tipo: 'compras_ok', itens: its };
    }

    /* ---- gastos ---- */
    const sn = C.numeros(s);
    const DINHEIRO = String.raw`(?:r\$\s*)?(\d[\d.,]*)\s*(?:reais|real|conto|contos|pila|r\$)?`;
    if ((m = new RegExp(String.raw`^(?:eu\s+)?(?:gastei|paguei|torrei|foram|deu)\s+${DINHEIRO}(?:\s+(?:no|na|nos|nas|em|com|de|do|da|dos|das|pro|pra|pelo|pela|num|numa)\s+(.+))?$`, 'u').exec(sn))
      || (m = new RegExp(String.raw`^(?:eu\s+)?(?:gastei|paguei)\s+(?:no|na|nos|nas|em|com|o|a)\s+(.+?)\s+${DINHEIRO}$`, 'u').exec(sn))) {
      const comValor = /^\d/.test(m[1]);
      const valor = valorBR(comValor ? m[1] : m[2]);
      const desc = cap(((comValor ? m[2] : m[1]) || '').trim());
      if (valor > 0) return { tipo: 'gasto_add', valor, desc: desc || 'Gasto', cat: categoria(desc) };
    }
    if (/^(?:apaga|apague|desfaz|desfa[cç]a|remove|cancela|tira)\s+(?:o\s+)?[uú]ltimo\s+gasto$/u.test(s)) return { tipo: 'gasto_desfazer' };
    if ((m = /^(?:quanto\s+(?:que\s+)?(?:eu\s+)?(?:j[aá]\s+)?gastei|(?:meus|os)\s+gastos|(?:mostra|ver|v[eê])\s+(?:os\s+)?(?:meus\s+)?gastos|resumo\s+(?:dos|de)\s+gastos|como\s+(?:est[aã]o|t[aã]o)\s+(?:os\s+)?(?:meus\s+)?gastos)(.*)$/u.exec(s))) {
      const resto = m[1] || '';
      const c = /\b(?:com|no|na|de|em)\s+(.+?)(?:\s+(?:hoje|ontem|nesta|nessa|esta|essa|este|esse|neste|nesse|no|na|semana|m[eê]s).*)?$/u.exec(resto);
      const cat = c ? categoria(c[1]) : null;
      return { tipo: 'gastos_ver', periodo: lerPeriodo(resto, 'mes'), cat: cat && cat !== 'Outros' ? cat : null };
    }

    /* ---- estudo ---- */
    if (/^(?:para|pare|parar|encerra|encerre|termina|cancela|desliga|sai do)\s+(?:o\s+|de\s+)?(?:pomodoro|modo estudo|estudo|estudar)$|^(?:parei|terminei|acabei)\s+de\s+estudar$/u.test(s)) return { tipo: 'estudo_parar' };
    if (/^(?:continua|continue|continuar)(?:\s+(?:estudando|o estudo|o pomodoro))?$|^(?:mais um|bora mais um|outro)\s+pomodoro$|^volta(?:r)?\s+a\s+estudar$/u.test(s)) return { tipo: 'estudo_iniciar', continuar: true };
    if ((m = /^(?:quanto(?:\s+tempo)?\s+(?:que\s+)?(?:eu\s+)?(?:j[aá]\s+)?estudei|(?:meu|o)\s+tempo\s+de\s+estudo|(?:minhas\s+)?horas\s+de\s+estudo)(.*)$/u.exec(s))) return { tipo: 'estudo_ver', periodo: lerPeriodo(m[1], 'hoje') };
    if ((m = /^(?:eu\s+)?estudei\s+(.+)$/u.exec(s))) {
      const { minutos, resto } = tirarDuracao(C.numeros(m[1]));
      if (minutos) return { tipo: 'estudo_add', minutos, materia: limparMateria(resto) || 'Estudo' };
    }
    if ((m = /^(?:modo\s+estudo|(?:entra|entrar|liga|ativa)\s+(?:no\s+|o\s+)?modo\s+estudo|(?:vamos|vou|bora|quero|hora de)\s+estudar|come[cç]a(?:r)?\s+a\s+estudar|(?:come[cç]a|comece|inicia|inicie|liga|faz)\s+(?:um\s+)?pomodoro|pomodoro)(.*)$/u.exec(s))) {
      const { minutos, resto } = tirarDuracao(C.numeros(m[1]));
      return { tipo: 'estudo_iniciar', minutos: minutos ? Math.max(1, Math.min(180, minutos)) : null, materia: limparMateria(resto) || null };
    }
    return null;
  }

  const api = {
    interpretar, valorBR, lerPeriodo, intervalo, NOME_PERIODO, CATEGORIAS, categoria, iconeCategoria, resumoGastos,
    resumoEstudo, horasTxt, sequenciaEstudo, pausaDepois, itens, acharItem, listaTexto,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.LUMI_ORGANIZADOR = api;
})(typeof window !== 'undefined' ? window : globalThis);
