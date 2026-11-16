/* Lumi — agenda pelo link iCal (Google Agenda: "Endereço secreto no formato iCal"; Outlook: calendário
   publicado em .ics). Sem login e sem app novo: o link só é lido, nunca alterado. Entende eventos
   repetidos (RRULE diária/semanal/mensal/anual com INTERVAL, COUNT, UNTIL, BYDAY e EXDATE), fuso
   horário (TZID) e acha o link da reunião (Meet, Zoom, Teams). */

/* ================= leitura do .ics ================= */
function desdobrar(txt) { return String(txt || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
const textoIcs = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Linhas "NOME;PARAM=X:valor" → { nome, params, valor }. */
function linha(l) {
  const i = l.indexOf(':'); if (i < 0) return null;
  const cab = l.slice(0, i).split(';'), params = {};
  for (const p of cab.slice(1)) { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = (v || '').replace(/^"|"$/g, ''); }
  return { nome: cab[0].toUpperCase(), params, valor: l.slice(i + 1) };
}

// fusos do Windows que o Outlook às vezes usa → IANA
const FUSOS_WIN = { 'E. South America Standard Time': 'America/Sao_Paulo', 'SA Eastern Standard Time': 'America/Fortaleza', 'Central Brazilian Standard Time': 'America/Cuiaba', 'SA Western Standard Time': 'America/Manaus', 'Tocantins Standard Time': 'America/Araguaina', 'Bahia Standard Time': 'America/Bahia', 'UTC': 'UTC', 'GMT Standard Time': 'Europe/London', 'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles' };
function deslocamento(ms, fuso) { // quanto o relógio do fuso está à frente do UTC, em ms
  const f = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
/** Hora de parede num fuso → instante (ms). Sem fuso válido, usa o fuso do computador. */
function paraUtc(w, fuso) {
  const ingenuo = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  if (fuso === 'UTC') return ingenuo;
  const tz = FUSOS_WIN[fuso] || fuso;
  if (tz) {
    try { let ms = ingenuo - deslocamento(ingenuo, tz); ms = ingenuo - deslocamento(ms, tz); return ms; } catch (_) { /* fuso desconhecido: cai no local */ }
  }
  return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime();
}
/** "20261116T130000Z" / "20261116T100000" / "20261116" → { parede, fuso, diaInteiro }. */
function lerData(valor, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(valor || '').trim());
  if (!m) return null;
  const parede = { y: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const diaInteiro = !m[4] || params.VALUE === 'DATE';
  return { parede, fuso: m[7] ? 'UTC' : diaInteiro ? null : params.TZID || null, diaInteiro };
}
const instante = (dt) => paraUtc(dt.parede, dt.fuso);

const DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function somarDias(w, n) { const d = new Date(Date.UTC(w.y, w.m, w.d + n)); return { ...w, y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
function somarMeses(w, n) { const d = new Date(Date.UTC(w.y, w.m + n, 1)); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return w.d > ult ? null : { ...w, y: d.getUTCFullYear(), m: d.getUTCMonth() }; }
const diaSemana = (w) => new Date(Date.UTC(w.y, w.m, w.d)).getUTCDay();

/** Inícios (ms) de um evento repetido dentro de [ini, fim]. Exportada para testes. */
function repeticoes(dt, rrule, exdatas, ini, fim) {
  const r = Object.fromEntries(String(rrule).split(';').map((x) => x.split('=')).filter((x) => x[0]).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = r.FREQ, intervalo = Math.max(1, parseInt(r.INTERVAL || '1', 10)), max = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  const ate = r.UNTIL ? (() => { const u = lerData(r.UNTIL); return u ? instante(u.fuso ? u : { ...u, fuso: dt.fuso }) + (u.diaInteiro ? 864e5 - 1 : 0) : Infinity; })() : Infinity;
  const fora = new Set(exdatas);
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => DIAS[x.replace(/^[+-]?\d+/, '')]).filter((x) => x !== undefined) : null;
  const out = []; let n = 0;
  const conta = (w) => { const ms = paraUtc(w, dt.fuso); if (ms < instante(dt) || ms > ate || n >= max) return; n++; if (ms >= ini && ms <= fim && !fora.has(ms)) out.push(ms); };
  const passou = (w) => { const ms = paraUtc(w, dt.fuso); return ms > fim || ms > ate || n >= max; };
  const domingo0 = somarDias(dt.parede, -diaSemana(dt.parede));
  const dias = byday && byday.length ? [...byday].sort() : [diaSemana(dt.parede)];
  for (let k = 0; k < 3000; k++) {
    if (freq === 'DAILY') { const w = somarDias(dt.parede, k * intervalo); if (passou(w)) break; conta(w); }
    else if (freq === 'WEEKLY') { const dom = somarDias(domingo0, 7 * intervalo * k); if (passou(dom)) break; for (const d of dias) conta(somarDias(dom, d)); }
    else if (freq === 'MONTHLY') { const prim = somarMeses({ ...dt.parede, d: 1 }, k * intervalo); if (passou(prim)) break; const w = somarMeses(dt.parede, k * intervalo); if (w) conta(w); }
    else if (freq === 'YEARLY') { const w = { ...dt.parede, y: dt.parede.y + k * intervalo }; if (passou(w)) break; conta(w); }
    else { conta(dt.parede); break; }
  }
  return out;
}

const LINK_REUNIAO = /https?:\/\/(?:meet\.google\.com\/[a-z0-9-]+|[\w.-]*zoom\.us\/(?:j|my|w)\/[^\s"<>)\\]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>)\\]+|teams\.live\.com\/meet\/[^\s"<>)\\]+)/i;

/**
 * Eventos de um .ics entre `ini` e `fim` (ms), já com as repetições abertas. Exportada para testes.
 * @returns {{id:string,titulo:string,inicio:number,fim:number,diaInteiro:boolean,local:string,link:string}[]}
 */
function lerIcs(txt, ini, fim) {
  const eventos = [], substitutos = new Set();
  const blocos = desdobrar(txt).split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
  const lidos = blocos.map((b) => {
    const e = { ex: [] };
    for (const l of b.split('\n')) {
      const x = linha(l.trim()); if (!x) continue;
      if (x.nome === 'DTSTART') e.ini = lerData(x.valor, x.params);
      else if (x.nome === 'DTEND') e.fim = lerData(x.valor, x.params);
      else if (x.nome === 'DURATION') e.dur = x.valor;
      else if (x.nome === 'SUMMARY') e.titulo = textoIcs(x.valor);
      else if (x.nome === 'LOCATION') e.local = textoIcs(x.valor);
      else if (x.nome === 'DESCRIPTION') e.desc = textoIcs(x.valor);
      else if (x.nome === 'URL') e.url = x.valor;
      else if (x.nome === 'UID') e.uid = x.valor;
      else if (x.nome === 'RRULE') e.rrule = x.valor;
      else if (x.nome === 'STATUS') e.status = x.valor;
      else if (x.nome === 'RECURRENCE-ID') e.recId = lerData(x.valor, x.params);
      else if (x.nome === 'X-GOOGLE-CONFERENCE') e.conf = x.valor;
      else if (x.nome === 'EXDATE') for (const v of x.valor.split(',')) { const d = lerData(v, x.params); if (d) e.ex.push(instante(d.fuso || d.diaInteiro ? d : { ...d, fuso: (e.ini || {}).fuso })); }
    }
    return e;
  }).filter((e) => e.ini && e.status !== 'CANCELLED');
  for (const e of lidos) if (e.recId && e.uid) substitutos.add(e.uid + '|' + instante(e.recId.fuso || e.recId.diaInteiro ? e.recId : { ...e.recId, fuso: e.ini.fuso }));
  for (const e of lidos) {
    const i0 = instante(e.ini);
    let dur = e.fim ? instante(e.fim) - i0 : e.ini.diaInteiro ? 864e5 : 0;
    if (!e.fim && e.dur) { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(e.dur); if (m) dur = ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60e3; }
    const inicios = e.rrule && !e.recId ? repeticoes(e.ini, e.rrule, e.ex, ini - dur, fim) : [i0];
    const link = ((e.conf || '') + ' ' + (e.url || '') + ' ' + (e.local || '') + ' ' + (e.desc || '')).match(LINK_REUNIAO);
    for (const s of inicios) {
      if (s + dur < ini || s > fim) continue;
      if (e.rrule && !e.recId && substitutos.has(e.uid + '|' + s)) continue;
      eventos.push({ id: (e.uid || e.titulo || '') + '|' + s, titulo: e.titulo || '(sem título)', inicio: s, fim: s + dur, diaInteiro: !!e.ini.diaInteiro, local: (e.local || '').slice(0, 120), link: link ? link[0] : '' });
    }
  }
  return eventos.sort((a, b) => a.inicio - b.inicio);
}

/* ================= busca dos links (com cache) ================= */
let cache = { chave: '', t: 0, eventos: [], erros: [] };
async function eventos(links, dias = 8) {
  const lista = (links || []).map((l) => String(l).trim().replace(/^webcal:/i, 'https:')).filter((l) => /^https:\/\/\S+$/i.test(l)).slice(0, 5);
  const chave = lista.join('\n');
  if (cache.chave === chave && Date.now() - cache.t < 10 * 60e3) return { eventos: cache.eventos, erros: cache.erros };
  const ini = Date.now() - 864e5, fim = Date.now() + dias * 864e5, todos = [], erros = [];
  await Promise.all(lista.map(async (url) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      if (!/BEGIN:VCALENDAR/.test(txt)) throw new Error('não é um link de agenda (.ics)');
      todos.push(...lerIcs(txt, ini, fim));
    } catch (e) { erros.push(`${new URL(url).hostname}: ${e && e.message ? e.message : e}`); } finally { clearTimeout(t); }
  }));
  todos.sort((a, b) => a.inicio - b.inicio);
  cache = { chave, t: Date.now(), eventos: todos, erros };
  return { eventos: todos, erros };
}

module.exports = { eventos, lerIcs, repeticoes, lerData, paraUtc };
