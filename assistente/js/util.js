/* Lumi — utilidades puras usadas pelo app.js: formatação, texto falado, comparação de palavras,
   clima e agenda. Sem DOM e sem rede, para rodar também no Node (testes). */
(function (raiz) {
  'use strict';
  const C = raiz.CEREBRO || (typeof require === 'function' ? require('./cerebro.js') : null);

  /* ---------- básicos ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const hojeStr = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  /** Segundos em "mm:ss" (ou "h:mm:ss" a partir de uma hora). */
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v < 1 ? 4 : 2 });
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  /** Tamanho em MB em texto: "512 MB", "1,5 GB". */
  const tamanho = (mb) => (mb >= 1024 ? `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB` : `${mb} MB`);
  /** ["a","b","c"] → "a, b e c". */
  const listaE = (a) => a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : (a[0] || '');
  function embaralhar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

  /* ---------- texto para a voz ---------- */
  /** Tira HTML, emojis e links (vira "o link") para a voz não ler bobagem. */
  function textoFalavel(t) {
    return String(t).replace(/<[^>]+>/g, ' ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/https?:\/\/\S+/g, 'o link').replace(/\s+/g, ' ').trim();
  }
  /** Junta frases em pedaços de até ~160 letras, para a voz começar a falar logo. */
  function fatiarFala(t, max = 160) {
    const out = []; let atual = '';
    for (const f of String(t).split(/(?<=[.!?…])\s+/).filter(Boolean)) { if (atual && (atual + ' ' + f).length > max) { out.push(atual); atual = f; } else atual = (atual + ' ' + f).trim(); }
    if (atual) out.push(atual);
    return out;
  }

  /* ---------- comparar palavras (chamado e correções aprendidas) ---------- */
  const basePalavra = (t) => C.normalizar(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /** Distância de edição (Levenshtein). */
  function distancia(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function similar(a, b) { if (!a || !b) return 0; return 1 - distancia(a, b) / Math.max(a.length, b.length); }
  /** Acha o chamado ("ei, sexta-feira") na frase e devolve o resto; null se não chamaram. */
  function tirarChamado(frase, nomeAssistente) {
    const nome = basePalavra(nomeAssistente).split(' ').filter(Boolean);
    if (!nome.length) return null;
    // cada palavra "simplificada" lembra de qual palavra original veio ("sexta-feira," vira "sexta" e "feira")
    const orig = String(frase).trim().split(/\s+/).filter(Boolean), base = [], dono = [];
    orig.forEach((o, i) => basePalavra(o).split(' ').filter(Boolean).forEach((b) => { base.push(b); dono.push(i); }));
    const parecido = (a, b) => a === b || (b.length >= 4 && distancia(a, b) <= 1);
    for (let i = 0; i + nome.length <= base.length; i++) {
      if (nome.every((w, k) => parecido(base[i + k], w))) return orig.slice(dono[i + nome.length - 1] + 1).join(' ').replace(/^[,\s]+/, '');
    }
    return null;
  }
  /** Procura, entre as correções aprendidas, a que mais parece com o texto (mínimo 82%). */
  function acharAprendido(lista, texto) {
    const n = basePalavra(texto); if (!n) return null;
    let melhor = null, nota = 0;
    for (const ap of lista || []) { const v = ap.de === n ? 1 : (Math.abs(ap.de.length - n.length) > 8 ? 0 : similar(ap.de, n)); if (v > nota) { nota = v; melhor = ap; } }
    return nota >= 0.82 ? { ap: melhor, exato: nota === 1 } : null;
  }

  /* ---------- clima (códigos WMO do Open-Meteo) ---------- */
  const TEMPO = {
    0: ['céu limpo', '☀️'], 1: ['poucas nuvens', '🌤️'], 2: ['parcialmente nublado', '⛅'], 3: ['nublado', '☁️'], 45: ['neblina', '🌫️'], 48: ['neblina', '🌫️'],
    51: ['garoa fraca', '🌦️'], 53: ['garoa', '🌦️'], 55: ['garoa forte', '🌦️'], 56: ['garoa congelante', '🌧️'], 57: ['garoa congelante', '🌧️'],
    61: ['chuva fraca', '🌧️'], 63: ['chuva', '🌧️'], 65: ['chuva forte', '🌧️'], 66: ['chuva congelante', '🌧️'], 67: ['chuva congelante', '🌧️'],
    71: ['neve fraca', '🌨️'], 73: ['neve', '🌨️'], 75: ['neve forte', '❄️'], 77: ['grãos de neve', '🌨️'], 80: ['pancadas de chuva', '🌦️'], 81: ['pancadas de chuva', '🌧️'], 82: ['temporal', '⛈️'],
    85: ['pancadas de neve', '🌨️'], 86: ['pancadas de neve', '❄️'], 95: ['trovoadas', '⛈️'], 96: ['trovoadas com granizo', '⛈️'], 99: ['trovoadas com granizo', '⛈️'],
  };
  /** [descrição, ícone]; céu limpo à noite vira lua. */
  function descTempo(cod, dia = 1) { const [t, i] = TEMPO[cod] || ['tempo variável', '🌡️']; return [t, cod === 0 && !dia ? '🌙' : i]; }

  /* ---------- agenda ---------- */
  const horaTxt = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  /** Eventos que acontecem no dia de `dia` (qualquer horário dentro dele). */
  const doDia = (eventos, dia) => { const a = new Date(dia); a.setHours(0, 0, 0, 0); const b = a.getTime() + 864e5; return eventos.filter((e) => e.inicio < b && e.fim > a.getTime() && (!e.diaInteiro || e.inicio >= a.getTime() - 864e5)); };
  const eventoTxt = (e) => (e.diaInteiro ? `${e.titulo} (o dia todo)` : `${horaTxt(e.inicio)} ${e.titulo}`);

  const api = {
    esc, pick, uid, espera, pad, hojeStr, mmss, brl, cap, tamanho, listaE, embaralhar,
    textoFalavel, fatiarFala, basePalavra, distancia, similar, tirarChamado, acharAprendido,
    TEMPO, descTempo, horaTxt, doDia, eventoTxt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.LUMI_UTIL = api;
})(typeof window !== 'undefined' ? window : globalThis);
