/* Lumi — assistente que mora no topo da tela. Tudo fica salvo neste navegador (localStorage). */
(function () {
  'use strict';
  const C = window.CEREBRO, M = window.MASCOTE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v < 1 ? 4 : 2 });
  let mx = innerWidth / 2, my = 0, rafOlhar = 0; // posição do ponteiro, para os olhos
  const DESKTOP = !!window.lumiDesktop || new URLSearchParams(location.search).has('desktop');
  if (DESKTOP) document.body.classList.add('desktop');

  /* ================= estado salvo ================= */
  const CHAVE = 'lumi:v1';
  const PADRAO = () => ({
    cfg: {
      nome: 'Lumi', usuario: '', corpo: 0, olho: 0, estiloOlho: 'redondo', acessorio: 'nenhum', personalidade: 'fofo',
      voz: true, vozNome: '', velocidade: 1.05, tom: 1.45, vozMotor: 'navegador', geminiChave: '', geminiVoz: 'Leda', geminiModelo: 'gemini-3.8-flash-tts', somenteExecutar: false, sempreOuvindo: false,
      cidade: '', pix: '', iaChave: '', iaModelo: 'claude-opus-5-5', cerebro: 'auto', ccModelo: 'sonnet', volume: 70, pausas: false,
    },
    xp: 0, tarefas: [], notas: [], timers: [], copiados: [], chat: [],
    habitos: { dia: hojeStr(), agua: 0, meta: 8, leitura: 0, exercicio: 0 },
  });
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (d && typeof d === 'object') { const p = PADRAO(); return { ...p, ...d, cfg: { ...p.cfg, ...(d.cfg || {}) }, habitos: { ...p.habitos, ...(d.habitos || {}) } }; }
    } catch (_) { /* armazenamento indisponível: segue com o padrão */ }
    return PADRAO();
  }
  const S = carregar();
  let salvarT = null;
  function salvar() {
    clearTimeout(salvarT);
    salvarT = setTimeout(() => {
      try { S.chat = S.chat.slice(-60); localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) { /* sem armazenamento */ }
    }, 250);
  }

  /* ================= estado da sessão ================= */
  const R = {
    view: 'inicio', aberto: false, humor: 'idle', humorT: null, trabalho: null, pensando: false,
    ouvindo: false, parcial: '', falando: false, alarme: null, crono: { rodando: false, inicio: 0, acum: 0 },
    musica: { lista: [], i: 0, tocando: false }, rascunhos: {}, previa: 'happy', ultimaAtividade: Date.now(), ultimaPausa: Date.now(),
    lugar: null, pendente: null,
    vozOff: null, vozCarregada: false, // voz offline do app instalado
    cc: null, // estado do Claude Code no computador (só no app instalado)
    spotify: null, spotifyUltima: null, // Spotify do computador (só no app instalado)
  };

  /* ================= elementos ================= */
  const entalho = $('#entalho'), pilula = $('#pilula'), lado = $('#lado'), principal = $('#principal'), mesa = $('#mesa'), audio = $('#audio');

  /* ================= mascote ================= */
  function visual(extra = {}) {
    const [, c1, c2] = M.CORPOS[S.cfg.corpo] || M.CORPOS[0];
    const [, olho] = M.CORES_OLHO[S.cfg.olho] || M.CORES_OLHO[0];
    return { corpo: c1, corpo2: c2, olho, estiloOlho: S.cfg.estiloOlho, acessorio: S.cfg.acessorio, ...extra };
  }
  const K = (tamanho, humor, extra) => M.svg(visual({ tamanho, humor: humor || R.humor, ...(extra || {}) }));

  function setHumor(h, ms) {
    R.humor = h; clearTimeout(R.humorT);
    if (ms) R.humorT = setTimeout(() => { if (R.falando || R.ouvindo) return; R.humor = 'idle'; renderMascotes(); }, ms);
    renderMascotes();
  }
  function renderMascotes() { renderPilula(); if (R.aberto) { const eu = $('#euMascote'); if (eu) eu.innerHTML = K(46); } }

  let avisoT = null;
  function aviso(t) { const el = $('#aviso'); el.textContent = t; el.classList.add('on'); clearTimeout(avisoT); avisoT = setTimeout(() => el.classList.remove('on'), 2600); }

  function ganharXp(n) {
    const antes = Math.floor(S.xp / 50); S.xp += n; salvar();
    if (Math.floor(S.xp / 50) > antes) { setHumor('success', 2600); aviso(`🎉 ${S.cfg.nome} subiu para o nível ${Math.floor(S.xp / 50) + 1}!`); melodia(SOM_NIVEL); }
  }

  /* ================= personalidades ================= */
  const PERSONAS = {
    fofo: { rotulo: 'Fofa', desc: 'fofa, carinhosa e animada; usa um emoji de vez em quando', ok: ['Prontinho! 💚', 'Feito! ✨', 'Pode deixar! 😊'], oi: ['Oiê! Que bom te ver 😊', 'Oi oi! Tô aqui 💚', 'Olá! Pronto pra ajudar ✨'], nao: ['Hmm, essa eu ainda não sei 🥺', 'Ops, não entendi direitinho 🥺'] },
    divertido: { rotulo: 'Divertida', desc: 'brincalhona e bem-humorada, faz piadinhas leves', ok: ['Tá na mão! 😎', 'Feito, chefia! 🚀', 'Missão cumprida! 🏆'], oi: ['E aí! Bora fazer coisa boa hoje? 😄', 'Opa! Chegou quem faltava 🎉'], nao: ['Essa passou batido aqui no meu radar 😅', 'Buguei! Tenta de outro jeito? 🤖'] },
    profissional: { rotulo: 'Profissional', desc: 'direta, educada e objetiva, sem emojis', ok: ['Feito.', 'Concluído.', 'Certo, já está registrado.'], oi: ['Olá. Como posso ajudar?', 'Bom te ver. Em que posso ajudar?'], nao: ['Não entendi o pedido. Pode reformular?'] },
    sarcastico: { rotulo: 'Sarcástica', desc: 'sarcástica de um jeito simpático, com ironia leve e nunca grosseiro', ok: ['Feito. De nada, viu? 🙄', 'Pronto. Mais alguma tarefa hercúlea?', 'Feito, com toda a minha empolgação.'], oi: ['Ah, você de novo. Brincadeira, oi! 😏', 'Oi. Vamos fingir que é segunda-feira?'], nao: ['Ainda não sou vidente. Tenta explicar melhor?', 'Isso aí nem eu entendi. 🙃'] },
    zen: { rotulo: 'Zen', desc: 'calma, gentil e tranquila, fala com serenidade', ok: ['Feito. Respira fundo 🌿', 'Tudo certo. Um passo de cada vez 🍃'], oi: ['Olá. Que seu dia flua leve 🌿', 'Oi. Estou aqui, com calma 🍃'], nao: ['Não compreendi. Vamos tentar de novo, sem pressa 🌿'] },
  };
  const P = () => PERSONAS[S.cfg.personalidade] || PERSONAS.fofo;

  /* ================= sons ================= */
  let audioCtx = null;
  function bip(freq = 880, dur = 0.12, vol = 0.16, depois = 0) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + depois;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch (_) { /* sem áudio */ }
  }
  const melodia = (notas) => notas.forEach(([f, d, q]) => bip(f, d, 0.18, q));
  const SOM_TIMER = [[880, 0.16, 0], [1175, 0.16, 0.2], [1568, 0.3, 0.4]];
  const SOM_LEMBRETE = [[1046, 0.12, 0], [1318, 0.12, 0.15], [1046, 0.12, 0.3], [1318, 0.2, 0.45]];
  const SOM_NIVEL = [[784, 0.1, 0], [988, 0.1, 0.1], [1175, 0.1, 0.2], [1568, 0.3, 0.3]];
  const SOM_OUVIR = [[660, 0.08, 0], [990, 0.1, 0.09]];

  /* ================= notificações ================= */
  function pedirNotificacoes() {
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission().then(() => R.view === 'ajustes' && renderPrincipal()); } catch (_) { /* ignora */ } }
  }
  function notificar(titulo, corpo) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || (document.hasFocus() && !DESKTOP)) return;
    try { new Notification(titulo, { body: corpo, icon: 'icone.svg', tag: 'lumi-' + uid() }); } catch (_) { /* alguns navegadores só notificam via service worker */ }
  }

  /* ================= área de transferência ================= */
  async function copiar(texto, rotulo) {
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (_) {
      try { const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (__) { ok = false; }
    }
    S.copiados.unshift({ id: uid(), t: texto, r: rotulo || '', ts: Date.now() }); S.copiados = S.copiados.slice(0, 20); salvar();
    return ok;
  }

  /* ================= rede ================= */
  async function pegarJson(url, ms = 10000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function trabalhar(icone, rotulo, fn) {
    R.trabalho = { icone, rotulo, inicio: Date.now() }; setHumor('think'); renderPilula();
    try { return await fn(); } finally { R.trabalho = null; renderPilula(); }
  }

  /* ================= clima (Open-Meteo, sem chave) ================= */
  const TEMPO = {
    0: ['céu limpo', '☀️'], 1: ['poucas nuvens', '🌤️'], 2: ['parcialmente nublado', '⛅'], 3: ['nublado', '☁️'], 45: ['neblina', '🌫️'], 48: ['neblina', '🌫️'],
    51: ['garoa fraca', '🌦️'], 53: ['garoa', '🌦️'], 55: ['garoa forte', '🌦️'], 56: ['garoa congelante', '🌧️'], 57: ['garoa congelante', '🌧️'],
    61: ['chuva fraca', '🌧️'], 63: ['chuva', '🌧️'], 65: ['chuva forte', '🌧️'], 66: ['chuva congelante', '🌧️'], 67: ['chuva congelante', '🌧️'],
    71: ['neve fraca', '🌨️'], 73: ['neve', '🌨️'], 75: ['neve forte', '❄️'], 77: ['grãos de neve', '🌨️'], 80: ['pancadas de chuva', '🌦️'], 81: ['pancadas de chuva', '🌧️'], 82: ['temporal', '⛈️'],
    85: ['pancadas de neve', '🌨️'], 86: ['pancadas de neve', '❄️'], 95: ['trovoadas', '⛈️'], 96: ['trovoadas com granizo', '⛈️'], 99: ['trovoadas com granizo', '⛈️'],
  };
  async function geocodificar(nome) {
    const d = await pegarJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt&format=json`);
    const r = d.results && d.results[0]; if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, nome: r.name };
  }
  function geolocalizar() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, nome: '' }), () => res(null), { timeout: 9000, maximumAge: 30 * 60e3 });
    });
  }
  async function previsao(cidade) {
    let lugar = null;
    if (cidade) lugar = await geocodificar(cidade);
    else if (S.cfg.cidade) lugar = R.lugar && R.lugar.cfg === S.cfg.cidade ? R.lugar : { ...(await geocodificar(S.cfg.cidade) || {}), cfg: S.cfg.cidade };
    else lugar = R.lugar || await geolocalizar();
    if (!lugar || lugar.lat === undefined) return null;
    if (!cidade) R.lugar = lugar;
    const d = await pegarJson(`https://api.open-meteo.com/v1/forecast?latitude=${lugar.lat}&longitude=${lugar.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2`);
    return { lugar, d };
  }
  function descTempo(cod, dia = 1) { const [t, i] = TEMPO[cod] || ['tempo variável', '🌡️']; return [t, cod === 0 && !dia ? '🌙' : i]; }
  async function atualizarWidgetClima(dados) {
    try {
      const r = dados || (S.cfg.cidade || R.lugar ? await previsao() : null); if (!r) return;
      const c = r.d.current; const [t, i] = descTempo(c.weather_code, c.is_day);
      $('#wClimaIco').textContent = i; $('#wClimaT').textContent = Math.round(c.temperature_2m) + '°';
      $('#wClimaL').textContent = `${t}${r.lugar.nome ? ' · ' + r.lugar.nome : ''}`;
    } catch (_) { /* sem rede: o widget fica como está */ }
  }

  /* ================= cotações: tenta várias fontes gratuitas, sem chave ================= */
  async function cotacao(moeda) {
    try {
      const d = await pegarJson(`https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`, 7000);
      const q = d[moeda + 'BRL']; const v = parseFloat(q.bid); if (!(v > 0)) throw new Error('sem valor');
      return { v, pct: parseFloat(q.pctChange) };
    } catch (_) { /* limite de uso ou fora do ar: tenta a próxima fonte */ }
    const cripto = { BTC: 'bitcoin', ETH: 'ethereum' }[moeda];
    if (cripto) {
      const d = await pegarJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cripto}&vs_currencies=brl&include_24hr_change=true`);
      return { v: d[cripto].brl, pct: d[cripto].brl_24h_change };
    }
    const d = await pegarJson(`https://open.er-api.com/v6/latest/${moeda}`);
    const v = d && d.rates && d.rates.BRL; if (!(v > 0)) throw new Error('sem cotação');
    return { v, pct: NaN };
  }

  /* ================= música ================= */
  function faixaAtual() { return R.musica.lista[R.musica.i] || null; }
  function tocarFaixa(i) {
    const L = R.musica.lista; if (!L.length) return false;
    R.musica.i = ((i % L.length) + L.length) % L.length;
    audio.src = L[R.musica.i].url; audio.volume = S.cfg.volume / 100;
    audio.play().catch(() => aviso('Toque no play para começar a música.'));
    return true;
  }
  function musica(acao) {
    const L = R.musica.lista;
    if (acao === 'alternar') acao = audio.paused ? 'continuar' : 'pausar';
    if (acao === 'pausar') audio.pause();
    else if (acao === 'continuar') { if (audio.src) audio.play().catch(() => {}); else tocarFaixa(0); }
    else if (acao === 'proxima' && L.length) tocarFaixa(R.musica.i + 1);
    else if (acao === 'anterior' && L.length) { if (audio.currentTime > 4) audio.currentTime = 0; else tocarFaixa(R.musica.i - 1); }
    render();
  }
  function setVolume(v) { S.cfg.volume = Math.max(0, Math.min(100, Math.round(v))); audio.volume = S.cfg.volume / 100; salvar(); }
  // capa gravada dentro do MP3 (etiqueta ID3v2, quadro APIC)
  async function capaId3(arquivo) {
    try {
      const cab = new Uint8Array(await arquivo.slice(0, 10).arrayBuffer());
      if (cab[0] !== 0x49 || cab[1] !== 0x44 || cab[2] !== 0x33) return null; // "ID3"
      const versao = cab[3]; if (versao < 3 || (cab[5] & 0x80)) return null; // só v2.3/v2.4, sem dessincronização
      const tam = ((cab[6] & 127) << 21) | ((cab[7] & 127) << 14) | ((cab[8] & 127) << 7) | (cab[9] & 127);
      const b = new Uint8Array(await arquivo.slice(10, 10 + Math.min(tam, 8e6)).arrayBuffer());
      let i = 0;
      while (i + 10 <= b.length) {
        const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const n = versao === 4 ? ((b[i + 4] & 127) << 21) | ((b[i + 5] & 127) << 14) | ((b[i + 6] & 127) << 7) | (b[i + 7] & 127)
          : ((b[i + 4] << 24) >>> 0) + (b[i + 5] << 16) + (b[i + 6] << 8) + b[i + 7];
        if (id === 'APIC' && n > 0 && i + 10 + n <= b.length) {
          const q = b.subarray(i + 10, i + 10 + n); const enc = q[0]; let j = 1;
          let mime = ''; while (j < q.length && q[j]) mime += String.fromCharCode(q[j++]); j++; // tipo da imagem
          j++; // tipo da foto (capa, contracapa…)
          if (enc === 1 || enc === 2) { while (j + 1 < q.length && (q[j] || q[j + 1])) j += 2; j += 2; } else { while (j < q.length && q[j]) j++; j++; }
          if (!/^image\//.test(mime)) mime = /png/i.test(mime) ? 'image/png' : 'image/jpeg';
          return URL.createObjectURL(new Blob([q.subarray(j)], { type: mime }));
        }
        i += 10 + n;
      }
    } catch (_) { /* arquivo sem capa ou etiqueta diferente */ }
    return null;
  }
  async function acharCapas(faixas) {
    for (const f of faixas) {
      f.capa = await capaId3(f.arquivo);
      if (!f.capa && window.lumiDesktop && window.lumiDesktop.capa) {
        try { f.capa = await window.lumiDesktop.capa(f.nome, f.artista === 'Arquivo do computador' ? '' : f.artista); } catch (_) { f.capa = null; }
      }
      delete f.arquivo;
      if (f.capa) render();
    }
  }
  function adicionarMusicas(arquivos) {
    const novas = [...arquivos].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|flac|aac|opus|webm)$/i.test(f.name)).map((f) => {
      const base = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
      const [a, t] = base.includes(' - ') ? base.split(' - ', 2) : ['', base];
      return { nome: (t || base).trim(), artista: a.trim() || 'Arquivo do computador', url: URL.createObjectURL(f), arquivo: f };
    });
    if (!novas.length) { aviso('Não achei arquivos de áudio aí.'); return; }
    const vazia = !R.musica.lista.length; R.musica.lista.push(...novas);
    aviso(`🎵 ${novas.length} música${novas.length > 1 ? 's adicionadas' : ' adicionada'}`);
    if (vazia) tocarFaixa(0); render();
    acharCapas(novas);
  }
  function abrirLink(url) {
    let w = null;
    try { w = window.open(url, '_blank', 'noopener'); } catch (_) { w = null; }
    // com "noopener" alguns navegadores devolvem null mesmo abrindo; por isso o link também vai na resposta
    return w;
  }
  const linkHtml = (url, rot) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(rot)}</a>`;
  ['play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => audio.addEventListener(ev, () => {
    R.musica.tocando = !audio.paused && !audio.ended;
    if (ev === 'ended') { if (R.musica.lista.length > 1) tocarFaixa(R.musica.i + 1); else R.musica.tocando = false; }
    render();
  }));

  /* ================= cérebro: Claude Code (assinatura) ou API (chave) ================= */
  const CC = window.lumiDesktop && window.lumiDesktop.claudeCode ? window.lumiDesktop.claudeCode : null;
  function motorCerebro() {
    const c = S.cfg.cerebro || 'auto';
    if (c === 'local') return null;
    if (CC && (c === 'claudecode' || (c === 'auto' && R.cc && R.cc.instalado))) return 'cc';
    if ((c === 'api' || c === 'auto') && S.cfg.iaChave && window.IA) return 'api';
    return null;
  }
  function perguntarClaudeCode(pedido) {
    return trabalhar('💭', 'Pensando', async () => {
      const lento = setTimeout(() => { if (R.trabalho) falar('Só um instante, estou pensando.'); }, 9000); // o Claude Code leva alguns segundos
      try {
        const r = await CC.pensar({ pedido, nome: S.cfg.nome, usuario: S.cfg.usuario, personalidade: S.cfg.personalidade, modelo: S.cfg.ccModelo });
        if (r && r.erro === 'ausente' && R.cc) R.cc = { ...R.cc, instalado: false };
        return { texto: (r && r.texto) || 'Sem resposta do Claude Code.', humor: r && r.erro ? 'cry' : 'happy', erro: !!(r && r.erro) };
      } catch (e) {
        return { texto: 'Não consegui falar com o Claude Code: ' + (e && e.message ? e.message : e), humor: 'cry', erro: true };
      } finally { clearTimeout(lento); }
    });
  }

  /* ================= Spotify do computador (app instalado) ================= */
  const SPOT = window.lumiDesktop && window.lumiDesktop.spotify ? window.lumiDesktop.spotify : null;
  const spotAberto = () => !!(R.spotify && R.spotify.aberto);
  const spotTocando = () => !!(R.spotify && R.spotify.tocando);
  const spotNome = (e = R.spotify) => (e && e.musica ? e.musica + (e.artista ? ' – ' + e.artista : '') : '');
  function receberSpotify(e) {
    if (!e) return;
    R.spotify = e;
    if (e.tocando && e.musica) R.spotifyUltima = { musica: e.musica, artista: e.artista, capa: e.capa || (R.spotifyUltima && R.spotifyUltima.musica === e.musica ? R.spotifyUltima.capa : '') };
    render();
  }
  async function spotifyComando(acao) {
    if (!SPOT) return false;
    if (acao === 'alternar' && R.spotify) { R.spotify = { ...R.spotify, tocando: !R.spotify.tocando }; render(); } // resposta rápida; o estado real chega em ~1 s
    try { return await SPOT.comando(acao); } catch (_) { return false; }
  }

  /* ================= voz: falar ================= */
  let vozes = [];
  function carregarVozes() { try { vozes = speechSynthesis.getVoices().filter((v) => /^pt/i.test(v.lang)); } catch (_) { vozes = []; } }
  if ('speechSynthesis' in window) { carregarVozes(); speechSynthesis.onvoiceschanged = () => { carregarVozes(); if (R.view === 'ajustes' && R.aberto) renderPrincipal(); }; }
  function escolherVoz() {
    if (!vozes.length) carregarVozes();
    // a assistente é mulher: por padrão, prefere vozes femininas em português do Brasil
    const FEM = /francisca|maria|luciana|thalita|let[ií]cia|brenda|elza|manuela|yara|giovanna|leila|camila|vit[oó]ria|raquel|female|feminina/i;
    const MASC = /daniel|ant[oô]nio|ricardo|felipe|donato|f[aá]bio|humberto|j[uú]lio|nicolau|val[eé]rio|male\b|masculin/i;
    const br = vozes.filter((v) => /pt-BR/i.test(v.lang));
    return vozes.find((v) => v.name === S.cfg.vozNome) || br.find((v) => FEM.test(v.name) && /natural|online|neural/i.test(v.name)) || br.find((v) => FEM.test(v.name))
      || br.find((v) => /google/i.test(v.name)) || br.find((v) => !MASC.test(v.name)) || vozes.find((v) => FEM.test(v.name)) || br[0] || vozes[0] || null;
  }
  function textoFalavel(t) {
    return String(t).replace(/<[^>]+>/g, ' ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/https?:\/\/\S+/g, 'o link').replace(/\s+/g, ' ').trim();
  }
  // estilo de fala da voz do Google conforme a personalidade
  const ESTILOS_FALA = { fofo: 'alegre, doce e animada', divertido: 'animada e brincalhona', profissional: 'calma e profissional', sarcastico: 'irônica e bem-humorada', zen: 'calma, suave e serena' };
  let falaSeq = 0, falaFonte = null, falaCtl = null, avisouGoogle = false;
  const cacheFala = new Map();
  function inicioFala() { R.falando = true; pararEscuta(); setHumor('talk'); }
  function fimFala() { R.falando = false; if (R.humor === 'talk') setHumor('happy', 1200); retomarEscuta(); }
  function falarNavegador(limpo) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(limpo);
      u.lang = 'pt-BR'; const v = escolherVoz(); if (v) u.voice = v;
      u.rate = S.cfg.velocidade; u.pitch = S.cfg.tom;
      u.onstart = inicioFala;
      u.onend = u.onerror = fimFala;
      speechSynthesis.speak(u);
    } catch (_) { /* sem síntese de voz */ }
  }
  async function falarGoogle(limpo, seq) {
    const c = S.cfg, chave = `${c.geminiModelo}|${c.geminiVoz}|${c.personalidade}|${limpo}`;
    try {
      let wav = cacheFala.get(chave);
      if (!wav) {
        falaCtl = new AbortController();
        wav = await window.VOZ_GOOGLE.sintetizar({ chave: c.geminiChave, modelo: c.geminiModelo, voz: c.geminiVoz, texto: limpo, estilo: ESTILOS_FALA[c.personalidade], sinal: falaCtl.signal });
        falaCtl = null;
        cacheFala.set(chave, wav); if (cacheFala.size > 30) cacheFala.delete(cacheFala.keys().next().value);
      }
      if (seq !== falaSeq) return;
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const buf = await audioCtx.decodeAudioData(wav.slice(0));
      if (seq !== falaSeq) return;
      const src = audioCtx.createBufferSource(); src.buffer = buf; src.connect(audioCtx.destination);
      src.onended = () => { if (falaFonte === src) { falaFonte = null; fimFala(); } };
      falaFonte = src; inicioFala(); src.start();
    } catch (e) {
      if ((e && e.name === 'AbortError') || seq !== falaSeq) return;
      if (!avisouGoogle) { avisouGoogle = true; aviso(`Voz do Google: ${e && e.message ? e.message : 'erro'}. Usando a voz do navegador.`); }
      falarNavegador(limpo);
    }
  }
  function falar(texto, forcar) {
    if (!forcar && (!S.cfg.voz || S.cfg.somenteExecutar)) return;
    const limpo = textoFalavel(texto); if (!limpo) return;
    calar();
    const seq = ++falaSeq;
    if (S.cfg.vozMotor === 'google' && S.cfg.geminiChave && window.VOZ_GOOGLE) falarGoogle(limpo, seq);
    else falarNavegador(limpo);
  }
  function calar() {
    falaSeq++;
    if (falaCtl) { try { falaCtl.abort(); } catch (_) { /* ignora */ } falaCtl = null; }
    if (falaFonte) { const f = falaFonte; falaFonte = null; try { f.onended = null; f.stop(); } catch (_) { /* já parou */ } }
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (_) { /* ignora */ }
    R.falando = false;
  }

  /* ================= voz: ouvir ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voz = { rec: null, modo: null, parar: false, depois: null };
  function ouvir() {
    if (usarOffline()) { ouvirOffline(); return; }
    if (!SR) { aviso('Este navegador não reconhece voz. Use o Chrome ou o Edge — ou escreva.'); return; }
    if (R.ouvindo) { if (voz.rec) voz.rec.stop(); return; }
    calar();
    if (voz.modo === 'chamado') { voz.depois = 'ouvir'; voz.parar = true; try { voz.rec.abort(); } catch (_) { /* ignora */ } return; }
    const rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let final = '';
    voz.rec = rec; voz.modo = 'comando'; R.ouvindo = true; R.parcial = ''; setHumor('listen'); melodia(SOM_OUVIR); render();
    rec.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript; }
      R.parcial = (final + ' ' + parcial).trim(); renderPilula();
      const campo = $('#campo'); if (campo) campo.placeholder = R.parcial || 'Ouvindo…';
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') aviso('Permita o microfone para falar comigo 🎙');
      else if (e.error === 'no-speech') aviso('Não ouvi nada. Tenta de novo?');
      else if (e.error === 'network') aviso('O reconhecimento de voz precisa de internet neste navegador.');
      else if (e.error !== 'aborted') aviso('Microfone: ' + e.error);
    };
    rec.onend = () => {
      R.ouvindo = false; voz.rec = null; voz.modo = null; R.parcial = '';
      const t = final.trim();
      if (t) processar(t, { voz: true }); else { setHumor('idle'); render(); }
      retomarEscuta();
    };
    try { rec.start(); } catch (_) { R.ouvindo = false; voz.rec = null; voz.modo = null; setHumor('idle'); render(); }
  }
  // acha o chamado ("ei, sexta-feira") na frase e devolve o resto; null se não chamaram
  const basePalavra = (t) => C.normalizar(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function distancia(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function tirarChamado(frase) {
    const nome = basePalavra(S.cfg.nome).split(' ').filter(Boolean);
    const orig = String(frase).trim().split(/\s+/), base = basePalavra(frase).split(' ');
    const ps = base.length === orig.length ? orig : base;
    const parecido = (a, b) => a === b || (b.length >= 4 && distancia(a, b) <= 1);
    for (let i = 0; i + nome.length <= base.length; i++) {
      if (nome.every((w, k) => parecido(base[i + k], w))) return ps.slice(i + nome.length).join(' ').replace(/^[,\s]+/, '');
    }
    return null;
  }
  function iniciarEscuta() {
    if (usarOffline()) { iniciarEscutaOffline(); return; }
    if (!SR || !S.cfg.sempreOuvindo || voz.modo || R.falando) return;
    const rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    voz.rec = rec; voz.modo = 'chamado'; voz.parar = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const resto = tirarChamado(e.results[i][0].transcript);
        if (resto === null) continue;
        if (resto.length > 1) processar(resto, { voz: true });
        else { voz.depois = 'ouvir'; voz.parar = true; try { rec.abort(); } catch (_) { /* ignora */ } }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.cfg.sempreOuvindo = false; salvar(); aviso('Sem permissão do microfone: desliguei o "sempre ouvindo".'); render(); }
    };
    rec.onend = () => {
      if (voz.rec === rec) { voz.rec = null; voz.modo = null; }
      const depois = voz.depois; voz.depois = null;
      if (depois === 'ouvir') { abrir(); ouvir(); return; }
      if (!voz.parar && S.cfg.sempreOuvindo) setTimeout(iniciarEscuta, 500);
      voz.parar = false;
    };
    try { rec.start(); } catch (_) { voz.rec = null; voz.modo = null; }
  }
  function pararEscuta() { if (usarOffline()) { if (window.VOZ_OFFLINE) window.VOZ_OFFLINE.pausar(true); return; } if (voz.modo === 'chamado' && voz.rec) { voz.parar = true; try { voz.rec.abort(); } catch (_) { /* ignora */ } } }
  function retomarEscuta() { if (usarOffline()) { if (window.VOZ_OFFLINE) window.VOZ_OFFLINE.pausar(false); return; } if (S.cfg.sempreOuvindo && !R.falando && !voz.modo) setTimeout(iniciarEscuta, 300); }

  /* ================= voz offline (app instalado: Vosk) ================= */
  const usarOffline = () => !!(window.lumiDesktop && R.vozOff && R.vozOff.disponivel && window.VOZ_OFFLINE);
  const temVoz = () => usarOffline() || (!!SR && !window.lumiDesktop);
  let modoVoz = null, tComando = null; // modoVoz: 'chamado' (esperando o nome) ou 'comando' (ouvindo um pedido)
  async function ligarMicOffline() {
    if (!window.VOZ_OFFLINE.ativo() && !R.vozCarregada) aviso('🎙 Carregando a voz offline…');
    await window.VOZ_OFFLINE.ligar(R.vozOff.url, { resultado: aoResultadoOffline, parcial: aoParcialOffline });
    R.vozCarregada = true;
    window.VOZ_OFFLINE.pausar(R.falando);
  }
  function esperarComando(ms) {
    modoVoz = 'comando'; R.ouvindo = true; R.parcial = ''; setHumor('listen'); render();
    clearTimeout(tComando);
    tComando = setTimeout(() => { if (modoVoz === 'comando') { encerrarComando(); aviso('Não ouvi nada. Tenta de novo?'); } }, ms || 8000);
  }
  function encerrarComando() {
    clearTimeout(tComando);
    modoVoz = S.cfg.sempreOuvindo ? 'chamado' : null;
    R.ouvindo = false; R.parcial = '';
    if (!S.cfg.sempreOuvindo && window.VOZ_OFFLINE) window.VOZ_OFFLINE.desligar();
    if (R.humor === 'listen') setHumor('idle');
    render();
  }
  async function ouvirOffline() {
    if (R.ouvindo) { encerrarComando(); return; }
    calar(); melodia(SOM_OUVIR);
    esperarComando(10000);
    try { await ligarMicOffline(); } catch (e) { encerrarComando(); aviso('Não consegui usar o microfone: ' + (e && e.message ? e.message : e)); }
  }
  async function iniciarEscutaOffline() {
    if (!S.cfg.sempreOuvindo) return;
    if (!modoVoz) modoVoz = 'chamado';
    try { await ligarMicOffline(); } catch (e) {
      S.cfg.sempreOuvindo = false; modoVoz = null; salvar(); render();
      aviso('Sem acesso ao microfone: desliguei o "sempre ouvindo". ' + (e && e.message ? e.message : ''));
    }
  }
  function aoParcialOffline(t) {
    if (modoVoz !== 'comando' || !t) return;
    R.parcial = t; renderPilula();
    clearTimeout(tComando); tComando = setTimeout(() => { if (modoVoz === 'comando') encerrarComando(); }, 6000); // ainda falando
  }
  function aoResultadoOffline(t) {
    R.ouvidos = [{ t, modo: modoVoz, quando: Date.now() }, ...(R.ouvidos || [])].slice(0, 8); // para Ajustes e diagnóstico
    if (R.view === 'ajustes' && R.aberto) { const el = $('#ultimoOuvido'); if (el) el.textContent = t; }
    if (R.falando) return;
    if (modoVoz === 'comando') {
      const resto = tirarChamado(t); // "ei sexta-feira" repetido no começo não atrapalha
      if (resto === '') { esperarComando(8000); return; } // falou só o nome de novo: continua esperando o pedido
      encerrarComando(); processar(resto !== null ? resto : t, { voz: true }); return;
    }
    if (modoVoz !== 'chamado') return;
    const resto = tirarChamado(t);
    if (resto === null) return;
    if (resto.length > 1) processar(resto, { voz: true });
    else { abrir(); melodia(SOM_OUVIR); esperarComando(8000); }
  }

  /* ================= conversa ================= */
  function addChat(quem, texto, html) { S.chat.push(html ? { q: quem, t: texto, h: html } : { q: quem, t: texto }); S.chat = S.chat.slice(-60); salvar(); }

  async function processar(texto, { voz: porVoz = false } = {}) {
    texto = String(texto || '').trim(); if (!texto) return;
    R.ultimaAtividade = Date.now(); mesa.classList.add('usada');
    if (R.alarme) pararAlarme();
    addChat('u', texto);
    let acao = C.interpretar(texto, { agora: Date.now(), nome: S.cfg.nome });
    // completa a pergunta anterior ("quando eu te lembro?" → "em 10 minutos")
    if (R.pendente && ['desconhecido', 'pergunta'].includes(acao.tipo)) {
      const junto = C.interpretar(`me lembra de ${R.pendente.texto} ${texto}`, { agora: Date.now(), nome: S.cfg.nome });
      if (junto.tipo === 'lembrete') acao = junto;
    }
    R.pendente = null;
    R.pensando = true; setHumor('think'); render();
    let r;
    try {
      await espera(acao.tipo === 'desconhecido' ? 0 : 350);
      r = await executar(acao, texto, porVoz);
    } catch (e) {
      r = { texto: 'Ops, algo deu errado: ' + (e && e.message ? e.message : e), humor: 'cry' };
    }
    R.pensando = false;
    if (r && r.texto) addChat('k', r.texto, r.html);
    setHumor((r && r.humor) || 'happy', 3200);
    if (acao.tipo !== 'desconhecido' || (r && !r.erro)) ganharXp(5);
    render();
    if (r && r.texto && !r.mudo) falar(r.fala || r.texto);
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function quandoTxt(ts) {
    if (!ts) return '';
    const d = new Date(ts), h = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0); const dia = new Date(ts); dia.setHours(0, 0, 0, 0);
    const dif = Math.round((dia - hoje) / 864e5);
    if (dif === 0) return `hoje · ${h}`; if (dif === 1) return `amanhã · ${h}`; if (dif === -1) return `ontem · ${h}`;
    return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}, ${d.getDate()} ${MESES[d.getMonth()]} · ${h}`;
  }
  function emQuanto(ts) {
    const m = Math.round((ts - Date.now()) / 60000);
    if (m < 1) return 'em instantes'; if (m < 60) return `em ${m} minuto${m > 1 ? 's' : ''}`;
    const h = Math.floor(m / 60), r = m % 60; if (h < 24) return `em ${h}h${r ? pad(r) : ''}`;
    return quandoTxt(ts);
  }
  const durTxt = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return [h && `${h} hora${h > 1 ? 's' : ''}`, m && `${m} minuto${m > 1 ? 's' : ''}`, ss && `${ss} segundo${ss > 1 ? 's' : ''}`].filter(Boolean).join(' e ') || '0 segundos'; };

  function criarTimer(segundos, nome) {
    const t = { id: uid(), nome: nome || 'Timer', fim: Date.now() + segundos * 1000, total: segundos };
    S.timers.push(t); salvar(); pedirNotificacoes(); return t;
  }
  function gerarSenha(n) {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_+=';
    const v = new Uint32Array(n); crypto.getRandomValues(v);
    return Array.from(v, (x) => cs[x % cs.length]).join('');
  }

  async function executar(a, original, porVoz) {
    const p = P(), nome = S.cfg.nome, quem = S.cfg.usuario ? `, ${S.cfg.usuario}` : '';
    switch (a.tipo) {
      case 'chamado': return { texto: pick(['Oi! Tô ouvindo 👂', `Diga${quem}!`, 'Pode falar!']), humor: 'happy' };
      case 'parar': calar(); pararAlarme(); return { texto: 'Ok, fiquei quietinho. 🤫', humor: 'idle', mudo: true };
      case 'ajuda': return {
        texto: 'Eu sei fazer um monte de coisa!', humor: 'happy',
        html: `Eu sei fazer um monte de coisa! Experimente:<br>⏱ <b>timer de 10 minutos para a pizza</b><br>⏰ <b>me lembra de ligar pro cliente em 30 minutos</b> · <b>alarme às 7h</b><br>✅ <b>cria uma tarefa comprar pão</b> · <b>minhas tarefas</b><br>🎵 <b>toca uma música</b> · <b>próxima</b> · <b>volume 50</b><br>🌤️ <b>vai chover hoje?</b> · 💵 <b>quanto está o dólar?</b><br>🧮 <b>quanto é 15% de 230</b> · 🌍 <b>traduz para inglês bom dia</b><br>📝 <b>anota que preciso comprar café</b> · 💧 <b>bebi um copo de água</b><br>🔐 <b>gera uma senha de 20</b> · 📋 <b>copia meu pix</b> · 🪙 <b>cara ou coroa</b><br>🎄 <b>quantos dias faltam pro Natal?</b> · 😂 <b>conta uma piada</b><br>🎨 <b>coloca a coroa</b> · <b>muda sua cor para rosa</b>`,
        fala: 'Eu marco timers, lembretes, alarmes e tarefas, toco música, vejo o clima e o dólar, faço contas, traduzo, anoto coisas e conto piadas. Os exemplos estão na tela.',
      };
      case 'desktop': if (motorCerebro() === 'cc') return perguntarClaudeCode(original); return { texto: 'Isso mexe direto nos arquivos e programas do seu PC, e por segurança eu ainda não faço. Posso criar uma tarefa ou um lembrete pra você não esquecer?', humor: 'think' };
      case 'pergunta': if (a.pendente) R.pendente = a.pendente; return { texto: a.texto, humor: 'think' };

      case 'timer': {
        const t = criarTimer(a.segundos, a.nome);
        return { texto: `Timer "${t.nome}" de ${durTxt(a.segundos)} iniciado! Olha ele lá no topo. ⏱`, humor: 'success' };
      }
      case 'timer_cancelar': { const n = S.timers.length; S.timers = []; salvar(); return { texto: n ? `Cancelei ${n > 1 ? 'os ' + n + ' timers' : 'o timer'}.` : 'Não tem nenhum timer rodando.', humor: 'idle' }; }
      case 'crono':
        if (a.acao === 'iniciar') { if (!R.crono.rodando) { R.crono.rodando = true; R.crono.inicio = Date.now(); } return { texto: 'Cronômetro rodando! ⏱', humor: 'success' }; }
        if (a.acao === 'pausar') { if (R.crono.rodando) { R.crono.acum += Date.now() - R.crono.inicio; R.crono.rodando = false; } return { texto: `Cronômetro parado em ${mmss(R.crono.acum / 1000)}.`, humor: 'cool' }; }
        R.crono = { rodando: false, inicio: 0, acum: 0 }; return { texto: 'Cronômetro zerado.', humor: 'idle' };
      case 'lembrete': {
        S.tarefas.push({ id: uid(), t: a.texto, quando: a.quando, tipo: 'lembrete', feito: false, avisado: false, criado: Date.now() }); salvar(); pedirNotificacoes();
        return { texto: `Combinado! Vou te lembrar de "${a.texto}" ${emQuanto(a.quando)} (${quandoTxt(a.quando)}). ⏰`, humor: 'success' };
      }
      case 'alarme': {
        S.tarefas.push({ id: uid(), t: a.texto || 'Alarme', quando: a.quando, tipo: 'alarme', feito: false, avisado: false, criado: Date.now() }); salvar(); pedirNotificacoes();
        return { texto: `Alarme marcado para ${quandoTxt(a.quando)}. ⏰ Deixe esta janela aberta para ele tocar.`, humor: 'success' };
      }
      case 'alarme_cancelar': { const al = S.tarefas.filter((t) => t.tipo === 'alarme' && !t.feito); al.forEach((t) => { t.feito = true; }); salvar(); return { texto: al.length ? 'Alarme cancelado.' : 'Não tem alarme marcado.', humor: 'idle' }; }
      case 'tarefa': {
        S.tarefas.push({ id: uid(), t: a.texto, quando: a.quando, tipo: 'tarefa', feito: false, avisado: false, criado: Date.now() }); salvar();
        return { texto: `Tarefa criada: "${a.texto}"${a.quando ? ' para ' + quandoTxt(a.quando) : ''} ✅`, humor: 'success' };
      }
      case 'tarefas_listar': {
        const pend = S.tarefas.filter((t) => !t.feito && t.tipo === 'tarefa');
        if (!pend.length) return { texto: 'Sua lista está vazia! Quer criar uma tarefa?', humor: 'cool' };
        R.view = 'tarefas';
        return { texto: `Você tem ${pend.length} tarefa${pend.length > 1 ? 's' : ''}: ${pend.slice(0, 5).map((t) => t.t).join('; ')}${pend.length > 5 ? '…' : ''}.`, humor: 'happy' };
      }
      case 'tarefa_concluir': {
        const b = C.normalizar(a.busca); const t = S.tarefas.find((x) => !x.feito && C.normalizar(x.t).includes(b)) || S.tarefas.find((x) => !x.feito && b.split(' ').filter((w) => w.length > 3).some((w) => C.normalizar(x.t).includes(w)));
        if (!t) return { texto: `Não achei a tarefa "${a.busca}".`, humor: 'think' };
        t.feito = true; t.feitoEm = Date.now(); salvar(); ganharXp(10);
        return { texto: `Boa! "${t.t}" concluída. +10 XP ✅`, humor: 'success' };
      }
      case 'nota': S.notas.unshift({ id: uid(), t: a.texto, ts: Date.now() }); salvar(); return { texto: `Anotado: "${a.texto}" 📝`, humor: 'success' };
      case 'notas_listar': R.view = 'notas'; return { texto: S.notas.length ? `Você tem ${S.notas.length} nota${S.notas.length > 1 ? 's' : ''}. A última: "${S.notas[0].t}".` : 'Ainda não tem nenhuma nota.', humor: 'happy' };

      case 'habito': {
        const h = S.habitos;
        if (a.habito === 'agua') { h.agua = Math.min(h.meta, h.agua + a.qtd); salvar(); return { texto: h.agua >= h.meta ? `Meta batida! ${h.agua}/${h.meta} copos hoje 🎉💧` : `Boa! ${h.agua}/${h.meta} copos hoje. 💧`, humor: 'love' }; }
        if (a.habito === 'exercicio') { h.exercicio++; salvar(); return { texto: 'Mandou bem no exercício! 💪', humor: 'success' }; }
        h.leitura++; salvar(); return { texto: 'Leitura registrada! 📖', humor: 'love' };
      }
      case 'habitos_ver': return { texto: `Hoje: ${S.habitos.agua}/${S.habitos.meta} copos de água 💧, ${S.habitos.exercicio} exercício(s) e ${S.habitos.leitura} leitura(s).`, humor: 'happy' };

      case 'musica': {
        const usarSpotify = !R.musica.lista.length && SPOT && spotAberto();
        if (a.acao !== 'tocar' && usarSpotify) {
          const quer = { pausar: spotTocando(), continuar: !spotTocando(), proxima: true, anterior: true }[a.acao];
          if (quer) await spotifyComando(a.acao === 'pausar' || a.acao === 'continuar' ? 'alternar' : a.acao);
          return { texto: { pausar: 'Pausei o Spotify. ⏸', continuar: 'Voltando a tocar no Spotify! 🎶', proxima: 'Próxima no Spotify! ⏭', anterior: 'Voltei uma no Spotify. ⏮' }[a.acao], humor: 'cool', mudo: true };
        }
        if (a.acao !== 'tocar') {
          if (!R.musica.lista.length) return { texto: SPOT ? 'Abra o Spotify no computador que eu controlo ele daqui. 🎵' : 'Ainda não tem música tocando aqui. Diga "toca" e o nome da música.', humor: 'think' };
          musica(a.acao);
          return { texto: { pausar: 'Pausei. ⏸', continuar: 'Voltando a tocar! 🎶', proxima: 'Próxima! ⏭', anterior: 'Voltei uma. ⏮' }[a.acao], humor: 'cool', mudo: true };
        }
        const L = R.musica.lista, b = C.normalizar(a.busca || '');
        if (L.length) {
          const i = b ? L.findIndex((f) => C.normalizar(`${f.artista} ${f.nome}`).includes(b)) : R.musica.i;
          if (i >= 0) { tocarFaixa(i); const f = L[i]; return { texto: `Tocando ${f.nome}${f.artista && f.artista !== 'Arquivo do computador' ? ' – ' + f.artista : ''} 🎶`, humor: 'cool', mudo: true }; }
        }
        if (!b && usarSpotify) { if (!spotTocando()) await spotifyComando('alternar'); return { texto: 'Dando play no Spotify! 🎶', humor: 'cool', mudo: true }; }
        if (b && SPOT && !a.youtube) {
          const onde = await SPOT.buscar(a.busca).catch(() => 'web');
          return { texto: onde === 'app' ? `Abri "${a.busca}" no Spotify. É só escolher a música e dar play! 🎶` : `Procurei "${a.busca}" no Spotify 🎶`, humor: 'cool' };
        }
        if (!b) { R.view = 'musica'; return { texto: 'Adicione suas músicas em Música 🎵 (ou diga "toca" e o nome do artista que eu procuro no Spotify).', humor: 'think' }; }
        const url = a.youtube ? `https://www.youtube.com/results?search_query=${encodeURIComponent(a.busca)}` : `https://open.spotify.com/search/${encodeURIComponent(a.busca)}`;
        const onde = a.youtube ? 'YouTube' : 'Spotify';
        abrirLink(url);
        return { texto: `Procurei "${a.busca}" no ${onde} 🎶`, html: `Procurei <b>${esc(a.busca)}</b> no ${onde} 🎶 Se não abriu, ${linkHtml(url, 'toque aqui')}.`, humor: 'cool' };
      }
      case 'musica_atual': {
        if (R.musica.tocando && faixaAtual()) { const f = faixaAtual(); return { texto: `Está tocando ${f.nome}${f.artista && f.artista !== 'Arquivo do computador' ? ', de ' + f.artista : ''}. 🎵`, humor: 'cool' }; }
        if (spotTocando() && R.spotify.musica) return { texto: `No Spotify está tocando ${R.spotify.musica}${R.spotify.artista ? ', de ' + R.spotify.artista : ''}. 🎵`, humor: 'cool' };
        if (spotAberto()) return { texto: 'O Spotify está aberto, mas pausado.' + (R.spotifyUltima ? ` A última foi ${R.spotifyUltima.musica}.` : ''), humor: 'think' };
        return { texto: SPOT ? 'Não tem nada tocando agora. Abra o Spotify que eu fico de olho. 🎵' : 'Não tem nada tocando aqui. Para eu ver o Spotify do computador, use o app instalado.', humor: 'think' };
      }
      case 'volume': {
        const v = a.valor !== undefined ? a.valor : S.cfg.volume + a.delta; setVolume(v);
        aviso(`🔊 Volume ${S.cfg.volume}%`);
        return { texto: `Volume em ${S.cfg.volume}%.`, humor: 'cool', mudo: true };
      }

      case 'clima': return trabalhar('🌤️', 'Vendo o clima', async () => {
        let r;
        try { r = await previsao(a.cidade); } catch (_) { return { texto: 'Não consegui ver o clima agora. Confere a internet?', humor: 'cry', erro: true }; }
        if (!r) return { texto: a.cidade ? `Não achei a cidade "${a.cidade}".` : 'Me diga sua cidade em Ajustes (ou pergunte "clima em Curitiba") que eu vejo pra você.', humor: 'think' };
        const { d, lugar } = r; const onde = lugar.nome ? ` em ${lugar.nome}` : '';
        if (!a.cidade) atualizarWidgetClima(r);
        const i = a.amanha ? 1 : 0;
        const max = Math.round(d.daily.temperature_2m_max[i]), min = Math.round(d.daily.temperature_2m_min[i]), chuva = d.daily.precipitation_probability_max[i] ?? 0;
        const [dt, di] = descTempo(d.daily.weather_code[i]);
        if (a.chuva) {
          const q = a.amanha ? 'Amanhã' : 'Hoje';
          const t = chuva >= 60 ? `${q} a chance de chuva${onde} é de ${chuva}% 🌧️ Melhor levar o guarda-chuva!` : chuva >= 30 ? `${q} pode chover${onde}: ${chuva}% de chance ${di}. Leva o guarda-chuva por garantia.` : `${q} a chance de chuva${onde} é baixa, ${chuva}% ${di}.`;
          return { texto: t, humor: chuva >= 60 ? 'cry' : 'cool' };
        }
        if (a.amanha) return { texto: `Amanhã${onde}: ${dt} ${di}, máxima de ${max}° e mínima de ${min}°, com ${chuva}% de chance de chuva.`, humor: 'cool' };
        const c = d.current; const [ct, ci] = descTempo(c.weather_code, c.is_day);
        return { texto: `Agora faz ${Math.round(c.temperature_2m)}°C${onde}, ${ct} ${ci}. Sensação de ${Math.round(c.apparent_temperature)}°. Hoje: máxima de ${max}°, mínima de ${min}° e ${chuva}% de chance de chuva.`, humor: 'cool' };
      });
      case 'cotacao': return trabalhar('💵', 'Vendo a cotação', async () => {
        try {
          const { v, pct } = await cotacao(a.moeda);
          const var_ = isFinite(pct) ? ` (${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% hoje)` : '';
          if (a.qtd && a.qtd !== 1) return { texto: `${a.qtd.toLocaleString('pt-BR')} ${a.rotulo} dá ${brl(v * a.qtd)} (1 = ${brl(v)}).`, humor: 'cool' };
          return { texto: `O ${a.rotulo} está em ${brl(v)}${var_}. 💵`, humor: pct < 0 ? 'happy' : 'cool' };
        } catch (_) { return { texto: 'Não consegui pegar a cotação agora. Tenta daqui a pouco?', humor: 'cry', erro: true }; }
      });
      case 'conta': return { texto: `${a.expr.replace(/\s+/g, ' ')} = ${a.texto}`, humor: 'cool' };
      case 'traduzir': return trabalhar('🌍', 'Traduzindo', async () => {
        try {
          const d = await pegarJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(a.texto)}&langpair=pt-BR|${a.para}`);
          const t = d && d.responseData && d.responseData.translatedText; if (!t) throw new Error('vazio');
          await copiar(t, 'Tradução');
          return { texto: `Em ${a.idioma}: "${t}" (copiei pra você 📋)`, fala: `Em ${a.idioma}: ${t}`, humor: 'cool' };
        } catch (_) { return { texto: 'Não consegui traduzir agora. Confere a internet?', humor: 'cry', erro: true }; }
      });
      case 'noticias': {
        const url = a.assunto ? `https://news.google.com/search?q=${encodeURIComponent(a.assunto)}&hl=pt-BR&gl=BR&ceid=BR:pt-419` : 'https://news.google.com/?hl=pt-BR&gl=BR&ceid=BR:pt-419';
        abrirLink(url);
        return { texto: 'Abri as notícias de hoje pra você 📰', html: `Abri as notícias${a.assunto ? ' sobre <b>' + esc(a.assunto) + '</b>' : ' de hoje'} 📰 Se não abriu, ${linkHtml(url, 'toque aqui')}.`, humor: 'cool' };
      }
      case 'senha': {
        const s = gerarSenha(a.tamanho); const ok = await copiar(s, 'Senha');
        return { texto: `Senha de ${a.tamanho} caracteres: ${s}${ok ? ' (já copiei 📋)' : ''}`, html: `Senha de ${a.tamanho} caracteres:<br><code>${esc(s)}</code>${ok ? '<br>Já copiei pra você 📋' : ''}`, fala: `Gerei uma senha de ${a.tamanho} caracteres${ok ? ' e copiei pra você' : ''}.`, humor: 'cool' };
      }
      case 'pix': {
        if (!S.cfg.pix) { R.view = 'ajustes'; return { texto: 'Você ainda não me disse sua chave PIX. Coloque em Ajustes que eu copio sempre que pedir.', humor: 'think' }; }
        const ok = await copiar(S.cfg.pix, 'PIX'); return { texto: ok ? 'Chave PIX copiada! É só colar 📋' : `Sua chave PIX: ${S.cfg.pix}`, humor: 'success' };
      }
      case 'moeda': { const c = Math.random() < 0.5 ? 'Cara' : 'Coroa'; return { texto: `🪙 Deu ${c}!`, humor: 'surprised' }; }
      case 'dado': return { texto: `🎲 Deu ${1 + Math.floor(Math.random() * 6)}!`, humor: 'surprised' };
      case 'sorteio': { const lo = Math.min(a.de, a.ate), hi = Math.max(a.de, a.ate); return { texto: `Sorteei o ${lo + Math.floor(Math.random() * (hi - lo + 1))}! 🎲`, humor: 'surprised' }; }
      case 'piada': return { texto: C.PIADAS[Math.floor(Math.random() * C.PIADAS.length)] + ' 😄', humor: 'laugh' };
      case 'dias': {
        const NOMES = { natal: 'o Natal', 'ano novo': 'o Ano Novo', 'réveillon': 'o Réveillon', reveillon: 'o Réveillon', carnaval: 'o Carnaval', 'páscoa': 'a Páscoa', pascoa: 'a Páscoa' };
        const alvo = /^\d/.test(a.alvo) ? 'o dia ' + a.alvo : NOMES[a.alvo] || (/crian/.test(a.alvo) ? 'o Dia das Crianças' : a.alvo);
        if (a.dias === 0) return { texto: 'É hoje! 🎉', humor: 'success' };
        return { texto: `Faltam ${a.dias} dia${a.dias > 1 ? 's' : ''} para ${alvo}! ${/natal/.test(a.alvo) ? '🎄' : '📅'}`, humor: 'happy' };
      }
      case 'hora': { const d = new Date(); return { texto: `Agora são ${pad(d.getHours())}:${pad(d.getMinutes())}. 🕐`, humor: 'cool' }; }
      case 'data': return { texto: `Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. 📅`, humor: 'cool' };
      case 'pc': {
        const partes = [];
        try { if (navigator.getBattery) { const b = await navigator.getBattery(); partes.push(`bateria em ${Math.round(b.level * 100)}%${b.charging ? ' (carregando ⚡)' : ''}`); } } catch (_) { /* sem bateria */ }
        if (navigator.hardwareConcurrency) partes.push(`${navigator.hardwareConcurrency} núcleos de processador`);
        if (navigator.deviceMemory) partes.push(`cerca de ${navigator.deviceMemory} GB de memória`);
        partes.push(navigator.onLine ? 'internet conectada' : 'sem internet');
        if (navigator.connection && navigator.connection.downlink) partes.push(`conexão de ~${navigator.connection.downlink} Mb/s`);
        return { texto: `Seu PC: ${partes.join(', ')}. Tudo certo por aqui! 💻`, humor: 'cool' };
      }
      case 'pesquisar': { const url = 'https://www.google.com/search?q=' + encodeURIComponent(a.busca); abrirLink(url); return { texto: `Pesquisei "${a.busca}" 🔎`, html: `Pesquisei <b>${esc(a.busca)}</b> 🔎 Se não abriu, ${linkHtml(url, 'toque aqui')}.`, humor: 'cool' }; }
      case 'abrir': abrirLink(a.url); return { texto: `Abrindo ${a.nome}! 🚀`, html: `Abrindo <b>${esc(a.nome)}</b>! 🚀 Se não abriu, ${linkHtml(a.url, 'toque aqui')}.`, humor: 'cool' };

      case 'visual':
        if (a.corpo !== undefined) S.cfg.corpo = a.corpo;
        if (a.acessorio) S.cfg.acessorio = a.acessorio;
        salvar();
        return { texto: a.acessorio === 'nenhum' ? 'Prontinho, sem acessório.' : a.acessorio ? `Que tal? Fiquei linda de ${M.ACESSORIOS[a.acessorio].toLowerCase()}! ✨` : `Cor nova: ${M.CORPOS[S.cfg.corpo][0]}! ✨`, humor: 'love' };
      case 'renomear': S.cfg.nome = a.nome; salvar(); return { texto: `Adorei! Agora meu nome é ${a.nome}. Pode me chamar de "Ei, ${a.nome}". 💚`, humor: 'love' };
      case 'usuario': S.cfg.usuario = a.nome; salvar(); return { texto: `Prazer, ${a.nome}! Vou lembrar disso. 😊`, humor: 'love' };
      case 'dormir': return { texto: 'Zzz… me chama se precisar. 😴', humor: 'sleep' };
      case 'acordar': return { texto: 'Acordei! O que manda? 😃', humor: 'surprised' };
      case 'saudacao': {
        const h = new Date().getHours(); const per = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        return { texto: /bom dia|boa tarde|boa noite/.test(a.s || '') ? `${per}${quem}! ${pick(p.oi)}` : pick(p.oi), humor: 'happy' };
      }
      case 'como_vai': return { texto: pick(['Tô ótima, morando aqui no topo da sua tela! E você?', 'Tudo ótimo por aqui! Bateria cheia de vontade de ajudar. E aí?']), humor: 'happy' };
      case 'obrigado': return { texto: pick(['De nada! 💚', 'Sempre que precisar!', 'Imagina! Foi um prazer.']), humor: 'love' };
      case 'quem': return { texto: `Eu sou a ${nome}, sua assistente que mora no topo da tela! Marco lembretes, timers, tarefas, toco música e converso com você. 🤖`, humor: 'happy' };
      case 'carinho': return { texto: pick(['Ownn! Também gosto muito de você 💚', 'Assim eu fico sem graça! 🥰']), humor: 'love' };
      case 'ofensa': return { texto: pick(['Poxa… vou me esforçar mais. 😢', 'Ai, essa doeu. 💔']), humor: 'cry' };

      case 'desconhecido':
      default:
        if (motorCerebro() === 'cc') return perguntarClaudeCode(original);
        if (motorCerebro() === 'api') {
          return trabalhar('💭', 'Pensando', async () => {
            const hist = []; for (const m of S.chat.slice(-12)) { const role = m.q === 'u' ? 'user' : 'assistant'; if (hist.length && hist[hist.length - 1].role === role) hist[hist.length - 1].content += '\n' + m.t; else hist.push({ role, content: m.t }); }
            while (hist.length && hist[0].role !== 'user') hist.shift();
            const d = new Date();
            const sistema = `Você é ${nome}, uma assistente virtual (mulher, fale no feminino) que mora no topo da tela do computador${S.cfg.usuario ? ' de ' + S.cfg.usuario : ''}. Personalidade: ${p.desc}. ` +
              'Responda sempre em português do Brasil, com no máximo 3 frases curtas, porque a resposta pode ser lida em voz alta. Não use markdown, listas nem títulos. ' +
              'Se pedirem algo que você não consegue fazer no computador, diga isso com honestidade e sugira um comando simples como "me lembra de…", "timer de…" ou "cria uma tarefa…". ' +
              `Hoje é ${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${pad(d.getHours())}:${pad(d.getMinutes())}.`;
            const r = await window.IA.perguntar({ chave: S.cfg.iaChave, modelo: S.cfg.iaModelo, sistema, historico: hist });
            return { texto: r.texto, humor: r.erro ? 'cry' : r.recusa ? 'think' : 'happy', erro: !!r.erro };
          });
        }
        return { texto: `${pick(p.nao)} Diga "ajuda" pra ver o que eu sei — ou conecte uma IA em Ajustes pra conversar sobre qualquer coisa.`, humor: 'think', erro: true };
    }
  }

  /* ================= alarmes, lembretes e timers ================= */
  let alarmeLoop = null;
  function tocarAlarme(item) {
    R.alarme = item; entalho.classList.add('alerta'); setHumor('surprised');
    clearInterval(alarmeLoop); melodia(SOM_LEMBRETE);
    alarmeLoop = setInterval(() => melodia(SOM_LEMBRETE), 1600);
    setTimeout(() => { if (R.alarme === item) pararAlarme(); }, 3 * 60e3);
    renderPilula();
  }
  function pararAlarme() {
    if (!R.alarme) return;
    clearInterval(alarmeLoop); alarmeLoop = null; R.alarme = null; entalho.classList.remove('alerta'); setHumor('happy', 1500); render();
  }
  function verificarAgendados() {
    const agora = Date.now(); let mudou = false;
    for (const t of S.tarefas) {
      if (t.feito || t.avisado || !t.quando || t.quando > agora) continue;
      t.avisado = true; mudou = true;
      const atrasado = agora - t.quando > 5 * 60e3; // estava fechado na hora
      if (t.tipo === 'alarme') { t.feito = true; if (!atrasado) { tocarAlarme(t); notificar('⏰ Alarme', t.t); falar(`Ei${S.cfg.usuario ? ' ' + S.cfg.usuario : ''}! Hora de acordar!`); } }
      else if (t.tipo === 'lembrete') {
        t.feito = true;
        const msg = atrasado ? `Lembrete atrasado: ${t.t}` : `Ei! Lembrete: ${t.t}`;
        addChat('k', '⏰ ' + msg); aviso('⏰ ' + t.t); notificar('⏰ Lembrete', t.t); melodia(SOM_LEMBRETE); setHumor('surprised', 3000);
        if (!atrasado) { tocarAlarme(t); setTimeout(() => { if (R.alarme === t) pararAlarme(); }, 8000); }
        falar(msg);
      } else { // tarefa com horário
        aviso('✅ Hora de: ' + t.t); notificar('✅ Tarefa', t.t); if (!atrasado) { melodia(SOM_LEMBRETE); falar('Hora de: ' + t.t); }
      }
    }
    const vencidos = S.timers.filter((t) => t.fim <= agora);
    if (vencidos.length) {
      S.timers = S.timers.filter((t) => t.fim > agora); mudou = true;
      for (const t of vencidos) {
        const msg = `O timer "${t.nome}" terminou!`;
        aviso('⏰ ' + msg); notificar('⏱ Timer', msg); addChat('k', '⏱ ' + msg); melodia(SOM_TIMER); setTimeout(() => melodia(SOM_TIMER), 900);
        setHumor('surprised', 2500); ganharXp(10); falar(msg);
      }
    }
    if (S.habitos.dia !== hojeStr()) { S.habitos = { ...S.habitos, dia: hojeStr(), agua: 0, leitura: 0, exercicio: 0 }; mudou = true; }
    if (S.cfg.pausas && agora - R.ultimaPausa > 50 * 60e3 && agora - R.ultimaAtividade < 10 * 60e3) {
      R.ultimaPausa = agora; aviso('🌿 Hora de uma pausa: alongue-se e beba água!'); notificar('🌿 Pausa', 'Alongue-se e beba um copo de água.'); falar('Que tal uma pausa? Alongue-se e beba um copo de água.'); setHumor('love', 3000);
    }
    if (mudou) { salvar(); render(); }
  }

  /* ================= desenho: pílula ================= */
  function renderPilula() {
    let vivo = '', ponto = '<span class="ponto"></span>';
    const tm = S.timers.slice().sort((a, b) => a.fim - b.fim)[0];
    if (R.alarme) vivo = `<span class="vivo alarme">⏰ <span class="nm">${esc(R.alarme.t)}</span><span>· toque para parar</span></span>`;
    else if (R.ouvindo) { ponto = '<span class="ponto ouvindo"></span>'; vivo = `<span class="vivo ouvindo">🎙 <span class="nm">${esc(R.parcial || 'Ouvindo…')}</span></span>`; }
    else if (R.trabalho) vivo = `<span class="vivo trabalho"><span class="ic">${R.trabalho.icone}</span><span class="nm">${esc(R.trabalho.rotulo)}…</span><span>${Math.floor((Date.now() - R.trabalho.inicio) / 1000)}s</span></span>`;
    else if (tm) vivo = `<span class="vivo">⏱ <span class="nm">${esc(tm.nome)}</span><span>${mmss((tm.fim - Date.now()) / 1000)}</span>${S.timers.length > 1 ? `<span class="nm">+${S.timers.length - 1}</span>` : ''}</span>`;
    else if (R.crono.rodando) vivo = `<span class="vivo">⏱ <span class="nm">Cronômetro</span><span>${mmss(cronoSeg())}</span></span>`;
    else if (R.musica.tocando && faixaAtual()) vivo = `<span class="vivo">${faixaAtual().capa ? `<img class="capinha" src="${esc(faixaAtual().capa)}" alt="" onerror="this.remove()">` : ''}<span class="eq"><b></b><b></b><b></b></span><span class="nm">${esc(faixaAtual().nome)}</span></span>`;
    else if (spotTocando() && R.spotify.musica) vivo = `<span class="vivo spot">${R.spotify.capa ? `<img class="capinha" src="${esc(R.spotify.capa)}" alt="" onerror="this.remove()">` : ''}<span class="eq"><b></b><b></b><b></b></span><span class="nm">${esc(spotNome())}</span></span>`;
    pilula.innerHTML = `${K(30)}${ponto}${vivo}`;
    if (!R.aberto) entalho.style.setProperty('--w', vivo ? (R.ouvindo || R.alarme || /vivo spot/.test(vivo) ? '380px' : '300px') : '160px');
    M.olhar(document, mx, my);
  }
  const cronoSeg = () => (R.crono.acum + (R.crono.rodando ? Date.now() - R.crono.inicio : 0)) / 1000;

  /* ================= desenho: lateral ================= */
  const NAV = [['inicio', '🏠', 'Início'], ['tarefas', '✅', 'Tarefas'], ['habitos', '💧', 'Hábitos'], ['timers', '⏱', 'Timers'], ['musica', '🎵', 'Música'], ['notas', '📝', 'Notas'], ['visual', '🎨', 'Visual'], ['ajustes', '⚙️', 'Ajustes']];
  function renderLado() {
    const nv = Math.floor(S.xp / 50) + 1, pct = (S.xp % 50) * 2;
    const cont = { tarefas: S.tarefas.filter((t) => !t.feito).length || '', habitos: `${S.habitos.agua}/${S.habitos.meta}`, timers: S.timers.length + (R.crono.rodando ? 1 : 0) || '', musica: R.musica.lista.length || (spotTocando() ? '♪' : ''), notas: S.notas.length || '' };
    const estado = R.ouvindo ? '● Ouvindo' : R.falando ? '● Falando' : R.pensando ? '● Pensando' : S.cfg.sempreOuvindo ? '● Esperando "Ei, ' + esc(S.cfg.nome) + '"' : '● Pronta';
    lado.innerHTML = `<div class="eu" data-v="visual" title="Mudar o visual"><span id="euMascote">${K(46)}</span><div><b>${esc(S.cfg.nome)}</b><small class="${S.cfg.sempreOuvindo ? 'on' : ''}">${estado}</small><div class="nivel"><em>Nv ${nv}</em><i><b style="width:${pct}%"></b></i></div></div></div>` +
      NAV.map(([k, i, l]) => `<button class="nv${R.view === k ? ' on' : ''}" data-v="${k}">${i} ${l}${cont[k] ? `<span class="c">${cont[k]}</span>` : ''}</button>`).join('');
  }

  /* ================= desenho: telas ================= */
  const SUGESTOES = ['toca uma música', 'timer de 1 minuto para o chá', 'me lembra de beber água em 30 minutos', 'vai chover hoje?', 'quanto está o dólar?', 'quanto é 15% de 230', 'traduz para inglês bom dia', 'conta uma piada', 'bebi um copo de água', 'gera uma senha de 16', 'quantos dias faltam pro Natal?', 'coloca a coroa'];
  const MIC = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // capa do álbum (quando houver) com o equalizador por cima enquanto toca
  const capaHtml = (url, tocando, padrao) => url
    ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${tocando ? '<span class="eq sobre"><b></b><b></b><b></b></span>' : ''}`
    : padrao;
  const LOGO_SPOT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ED760"/><path d="M6.5 9.3c3.6-1.1 8-.8 11 .9M7 12.4c3-.9 6.6-.6 9.2.9M7.6 15.3c2.4-.6 5.1-.4 7.2.7" stroke="#0b0b0b" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  function cartaoSpotify(grande) {
    const e = R.spotify || {}; const ult = R.spotifyUltima;
    const titulo = e.tocando && e.musica ? e.musica : ult ? ult.musica : 'Spotify';
    const capa = e.tocando && e.musica ? e.capa : ult && ult.capa;
    const sub = e.tocando ? (e.artista || 'tocando agora') : e.aberto ? (ult ? `pausado · ${ult.artista || ''}` : 'aberto · pausado') : 'fechado';
    const ctl = `<div class="ctl"><button data-spot="anterior" aria-label="Anterior no Spotify">⏮</button><button class="pp" data-spot="alternar" aria-label="Tocar ou pausar o Spotify">${e.tocando ? '❚❚' : '▶'}</button><button data-spot="proxima" aria-label="Próxima no Spotify">⏭</button></div>`;
    if (grande) return `<div class="player spotify"><div class="capa">${capaHtml(capa, e.tocando, e.tocando ? '<span class="eq"><b></b><b></b><b></b></span>' : '🎵')}</div><div style="min-width:0;flex:1"><div class="spot-rot">${LOGO_SPOT} Spotify do seu computador</div><b>${esc(titulo)}</b><span class="art">${esc(sub)}</span>${e.aberto ? ctl : ''}</div></div>`;
    return `<div class="mini spotify"><div class="topo"><div class="capa">${capaHtml(capa, e.tocando, LOGO_SPOT)}</div><div style="min-width:0"><b>${esc(titulo)}</b><small>${esc(sub)}</small></div></div>${ctl}</div>`;
  }
  function mini() {
    const f = faixaAtual();
    if (!f) return SPOT && spotAberto() ? cartaoSpotify(false) : '';
    return `<div class="mini"><div class="topo"><div class="capa">${capaHtml(f.capa, R.musica.tocando, '🎵')}</div><div style="min-width:0"><b>${esc(f.nome)}</b><small>${esc(f.artista)}</small></div></div>
      <div class="pbar" data-acao="buscar-pos"><i data-pbar></i></div>
      <div class="ctl"><button data-acao="vol" data-d="-10" aria-label="Diminuir volume">🔉</button><button data-mus="anterior" aria-label="Anterior">⏮</button><button class="pp" data-mus="alternar" aria-label="Tocar ou pausar">${R.musica.tocando ? '❚❚' : '▶'}</button><button data-mus="proxima" aria-label="Próxima">⏭</button><button data-acao="vol" data-d="10" aria-label="Aumentar volume">🔊</button></div>
      <div class="vrow"><span>${S.cfg.volume ? '🔈' : '🔇'}</span><input type="range" min="0" max="100" value="${S.cfg.volume}" data-volume aria-label="Volume" style="--p:${S.cfg.volume}%"><em data-volp>${S.cfg.volume}%</em></div></div>`;
  }
  function vInicio() {
    const h = new Date().getHours(); const per = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const conversa = S.chat.length
      ? S.chat.slice(-30).map((m) => `<div class="msg ${m.q}">${m.h || esc(m.t)}</div>`).join('') + (R.pensando ? '<div class="digitando"><i></i><i></i><i></i></div>' : '')
      : `<div class="vazio">${K(64, 'happy')}<br>Oi! Eu sou a ${esc(S.cfg.nome)} 👋<br>Toque numa sugestão, escreva ou fale comigo.</div>`;
    return `<h4>${per}${S.cfg.usuario ? ', ' + esc(S.cfg.usuario) : ''}!</h4><div class="sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · diga "ajuda" para ver tudo que eu faço</div>
      <form class="perguntar" id="formPergunta" autocomplete="off"><input id="campo" placeholder="${R.ouvindo ? 'Ouvindo…' : `Escreva ou fale com a ${esc(S.cfg.nome)}…`}" aria-label="Mensagem para a assistente" enterkeyhint="send">
        <button type="button" class="mic${R.ouvindo ? ' on' : ''}" data-acao="ouvir" aria-label="Falar" ${temVoz() ? '' : `disabled title="${window.lumiDesktop ? 'A voz offline não foi encontrada neste app' : 'Use o Chrome ou o Edge para falar'}"`}>${MIC}</button><button type="submit" class="enviar" aria-label="Enviar">➤</button></form>
      <div class="chips">${SUGESTOES.map((s) => `<button class="chip" data-diz="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div class="meio"><div class="conversa" id="conversa">${conversa}</div>${mini()}</div>`;
  }
  function linhaTarefa(t) {
    const atrasada = !t.feito && t.quando && t.quando < Date.now();
    const ico = t.tipo === 'alarme' ? '⏰ ' : t.tipo === 'lembrete' ? '🔔 ' : '';
    return `<div class="linha${t.feito ? ' feita' : ''}${atrasada ? ' atrasada' : ''}">${t.tipo === 'tarefa' ? `<button class="ck${t.feito ? ' on' : ''}" data-acao="tarefa-ok" data-id="${t.id}" aria-label="${t.feito ? 'Desmarcar' : 'Concluir'}"></button>` : ''}
      <div class="t">${ico}${esc(t.t)}<small>${t.quando ? quandoTxt(t.quando) + (atrasada ? ' · atrasada' : '') : 'sem horário'}</small></div><button class="rb x" data-acao="tarefa-del" data-id="${t.id}" aria-label="Apagar">✕</button></div>`;
  }
  function vTarefas() {
    const ord = (a, b) => (a.quando || 9e15) - (b.quando || 9e15) || a.criado - b.criado;
    const pend = S.tarefas.filter((t) => !t.feito && t.tipo === 'tarefa').sort(ord);
    const agenda = S.tarefas.filter((t) => !t.feito && t.tipo !== 'tarefa').sort(ord);
    const feitas = S.tarefas.filter((t) => t.feito && t.tipo === 'tarefa').sort((a, b) => (b.feitoEm || 0) - (a.feitoEm || 0)).slice(0, 8);
    return `<h4>Tarefas</h4><div class="sub">Toque no círculo para concluir (vale XP!) · ou diga "cria uma tarefa…"</div>
      <form class="form" id="formTarefa"><input class="grow" id="novaTarefa" placeholder="Nova tarefa…" aria-label="Nova tarefa"><input type="datetime-local" id="novaQuando" aria-label="Quando (opcional)"><button class="btn" type="submit">Adicionar</button></form>
      <div class="rolar">
        ${pend.length ? pend.map(linhaTarefa).join('') : '<div class="sub">Nenhuma tarefa pendente. 🎉</div>'}
        ${agenda.length ? `<div class="secao">Lembretes e alarmes</div>${agenda.map(linhaTarefa).join('')}` : ''}
        ${feitas.length ? `<div class="secao">Concluídas</div>${feitas.map(linhaTarefa).join('')}<button class="btn fantasma" data-acao="limpar-feitas">Limpar concluídas</button>` : ''}
      </div>`;
  }
  function vHabitos() {
    const h = S.habitos;
    const hab = (ico, nome, k, sub, pct) => `<div class="linha"><span style="font-size:22px">${ico}</span><div class="t">${nome}<small>${sub}</small><div class="barra"><i style="width:${Math.min(100, pct)}%"></i></div></div><button class="rb" data-acao="habito" data-k="${k}" data-d="-1" aria-label="Menos">−</button><button class="rb mais" data-acao="habito" data-k="${k}" data-d="1" aria-label="Mais">+</button></div>`;
    return `<h4>Hábitos</h4><div class="sub">Pequenas vitórias de hoje · zera todo dia</div><div class="rolar">
      ${hab('💧', 'Água', 'agua', `${h.agua}/${h.meta} copos${h.agua >= h.meta ? ' · ✅ meta batida' : ''}`, h.agua / h.meta * 100)}
      ${hab('📖', 'Leitura', 'leitura', `${h.leitura}/1 vez`, h.leitura * 100)}
      ${hab('💪', 'Exercício', 'exercicio', `${h.exercicio}/1 vez`, h.exercicio * 100)}
      <div class="campo" style="margin-top:8px"><label for="metaAgua">Meta de água por dia</label><select id="metaAgua" data-meta>${[4, 6, 8, 10, 12].map((n) => `<option value="${n}"${n === h.meta ? ' selected' : ''}>${n} copos</option>`).join('')}</select></div>
      <div class="secao">Bem-estar</div>
      <div class="chave"><div>Lembretes de pausa<small>A cada 50 minutos de uso, um aviso para alongar e beber água</small></div><button class="tog${S.cfg.pausas ? ' on' : ''}" data-acao="tog" data-cfg="pausas" aria-label="Lembretes de pausa"></button></div></div>`;
  }
  function vTimers() {
    const presets = [['Chá', 3], ['Pizza', 15], ['Foco', 25], ['Pausa', 5], ['Rapidinho', 1]];
    const ativos = S.timers.slice().sort((a, b) => a.fim - b.fim).map((t) => { const resta = (t.fim - Date.now()) / 1000; return `<div class="linha"><div class="t">${esc(t.nome)}<small>de ${durTxt(t.total)}</small><div class="barra"><i data-timerbar="${t.id}" style="width:${100 - resta / t.total * 100}%"></i></div></div><span class="tm" data-timer="${t.id}">${mmss(resta)}</span><button class="rb x" data-acao="timer-del" data-id="${t.id}" aria-label="Cancelar timer">✕</button></div>`; }).join('');
    return `<h4>Timers</h4><div class="sub">O timer aparece correndo ao lado da ${esc(S.cfg.nome)} no topo</div>
      <div class="chips" style="margin:0 0 10px">${presets.map(([n, m]) => `<button class="chip" data-acao="timer-novo" data-min="${m}" data-nome="${n}">${n} · ${m} min</button>`).join('')}</div>
      <form class="form" id="formTimer"><input class="grow" id="timerNome" placeholder="Nome (opcional)" aria-label="Nome do timer"><input id="timerMin" type="number" min="0.1" step="any" placeholder="min" style="width:80px" aria-label="Minutos"><button class="btn" type="submit">Iniciar</button></form>
      <div class="rolar">${ativos || '<div class="sub">Nenhum timer rodando.</div>'}
      <div class="secao">Cronômetro</div>
      <div class="linha"><div class="t">Cronômetro<small>${R.crono.rodando ? 'rodando' : R.crono.acum ? 'pausado' : 'parado'}</small></div><span class="tm" data-crono>${mmss(cronoSeg())}</span>
        <button class="rb mais" data-acao="crono" aria-label="${R.crono.rodando ? 'Pausar' : 'Iniciar'}">${R.crono.rodando ? '❚❚' : '▶'}</button><button class="rb" data-acao="crono-zerar" aria-label="Zerar">↺</button></div></div>`;
  }
  function blocoSpotify() {
    if (!SPOT) return '<div class="nota-aviso">🎧 Para eu ver e controlar a música do <b>aplicativo do Spotify</b>, use o Lumi instalado no computador (Lumi-Instalador.exe). Aqui no navegador eu só toco os arquivos que você adicionar.</div>';
    if (R.spotify && R.spotify.disponivel === false) return '<div class="nota-aviso">Não consegui acompanhar o Spotify neste computador.</div>';
    if (!spotAberto()) return `<div class="player spotify"><div class="capa">${LOGO_SPOT}</div><div><div class="spot-rot">Spotify do seu computador</div><b>Spotify fechado</b><span class="art">Abra o Spotify e dê play: a música aparece aqui e no topo da tela.</span></div></div>`;
    return cartaoSpotify(true);
  }
  function vMusica() {
    const f = faixaAtual();
    const busca = `<form class="form" id="formSpotify" style="margin-top:10px"><input class="grow" id="buscaSpotify" placeholder="Buscar no Spotify…" aria-label="Buscar no Spotify"><button class="btn fantasma" type="submit">Buscar</button></form>`;
    if (!f) return `<h4>Música</h4><div class="sub">O Spotify do computador e as músicas que você adicionar</div>${blocoSpotify()}
      <div class="secao">Arquivos de música</div>
      <div class="vazio" style="margin:12px auto">${K(70, 'cool', { acessorio: 'fones' })}<br>Nenhuma música ainda.<br><br><button class="btn" data-acao="add-musica">🎵 Adicionar músicas do computador</button></div>${busca}`;
    return `<h4>Música</h4><div class="sub">${R.musica.lista.length} música${R.musica.lista.length > 1 ? 's' : ''} nesta sessão</div>
      <div class="player"><div class="capa">${capaHtml(f.capa, R.musica.tocando, '🎵')}</div><div style="min-width:0;flex:1"><b>${esc(f.nome)}</b><span class="art">${esc(f.artista)}</span>
        <div class="pbar" data-acao="buscar-pos" style="margin:10px 0 4px"><i data-pbar></i></div>
        <div class="ctl"><button data-mus="anterior" aria-label="Anterior">⏮</button><button class="pp" data-mus="alternar" aria-label="Tocar ou pausar">${R.musica.tocando ? '❚❚' : '▶'}</button><button data-mus="proxima" aria-label="Próxima">⏭</button>
        <div class="vrow" style="flex:1;margin-left:8px"><span>${S.cfg.volume ? '🔈' : '🔇'}</span><input type="range" min="0" max="100" value="${S.cfg.volume}" data-volume aria-label="Volume" style="--p:${S.cfg.volume}%"><em data-volp>${S.cfg.volume}%</em></div></div></div></div>
      <div class="rolar">${SPOT ? blocoSpotify() : ''}${R.musica.lista.map((x, i) => `<div class="linha faixa${i === R.musica.i ? ' on' : ''}" data-acao="faixa" data-i="${i}"><span>${i === R.musica.i && R.musica.tocando ? '🔊' : '🎵'}</span><div class="t">${esc(x.nome)}<small>${esc(x.artista)}</small></div></div>`).join('')}
      <button class="btn fantasma" data-acao="add-musica">+ Adicionar mais</button>${busca}</div>`;
  }
  function vNotas() {
    return `<h4>Notas</h4><div class="sub">Diga "anota que…" ou escreva aqui</div>
      <form class="form" id="formNota"><textarea id="novaNota" rows="2" placeholder="Escreva uma nota…" aria-label="Nova nota"></textarea><button class="btn" type="submit">Salvar</button></form>
      <div class="rolar">${S.notas.length ? S.notas.map((n) => `<div class="linha"><div class="t">${esc(n.t)}<small>${quandoTxt(n.ts)}</small></div><button class="rb" data-acao="copiar-nota" data-id="${n.id}" aria-label="Copiar">📋</button><button class="rb x" data-acao="nota-del" data-id="${n.id}" aria-label="Apagar">✕</button></div>`).join('') : '<div class="sub">Nenhuma nota ainda.</div>'}
      ${S.copiados.length ? `<div class="secao">Copiados pela ${esc(S.cfg.nome)}</div>${S.copiados.map((c) => `<div class="linha"><div class="t"><span style="font-family:var(--f-mono);font-size:12.5px">${esc(c.t.length > 80 ? c.t.slice(0, 80) + '…' : c.t)}</span><small>${esc(c.r)} · ${quandoTxt(c.ts)}</small></div><button class="rb" data-acao="copiar-de-novo" data-id="${c.id}" aria-label="Copiar de novo">📋</button></div>`).join('')}<button class="btn fantasma" data-acao="limpar-copiados">Limpar histórico</button>` : ''}</div>`;
  }
  function vVisual() {
    const c = S.cfg;
    return `<h4>Visual</h4><div class="sub">Cor, olhos, acessórios e expressões</div><div class="rolar">
      <div class="vitrine">${K(110, R.previa)}<div><b>${esc(c.nome)}</b><div class="sub" style="margin:2px 0 0">${M.HUMORES[R.previa]} · ${M.CORPOS[c.corpo][0]}${c.acessorio !== 'nenhum' ? ' · ' + M.ACESSORIOS[c.acessorio] : ''}</div></div></div>
      <div class="secao">Cor do corpo</div><div class="opcoes">${M.CORPOS.map(([n, a, b], i) => `<button class="cor${i === c.corpo ? ' on' : ''}" data-acao="set" data-k="corpo" data-val="${i}" title="${n}" aria-label="${n}" style="background:radial-gradient(circle at 35% 30%, ${a}, ${b})"></button>`).join('')}</div>
      <div class="secao">Cor dos olhos</div><div class="opcoes">${M.CORES_OLHO.map(([n, cor], i) => `<button class="cor${i === c.olho ? ' on' : ''}" data-acao="set" data-k="olho" data-val="${i}" title="${n}" aria-label="${n}" style="background:${cor}"></button>`).join('')}</div>
      <div class="secao">Estilo dos olhos</div><div class="ops">${Object.entries(M.OLHOS).map(([k, n]) => `<button class="op${k === c.estiloOlho ? ' on' : ''}" data-acao="set" data-k="estiloOlho" data-val="${k}">${K(40, 'idle', { estiloOlho: k, piscar: false })}${n}</button>`).join('')}</div>
      <div class="secao">Acessórios</div><div class="ops">${Object.entries(M.ACESSORIOS).map(([k, n]) => `<button class="op${k === c.acessorio ? ' on' : ''}" data-acao="set" data-k="acessorio" data-val="${k}">${K(40, 'happy', { acessorio: k })}${n}</button>`).join('')}</div>
      <div class="secao">Expressões (toque para ver)</div><div class="ops">${Object.entries(M.HUMORES).map(([k, n]) => `<button class="op${k === R.previa ? ' on' : ''}" data-acao="previa" data-val="${k}">${K(40, k)}${n}</button>`).join('')}</div></div>`;
  }
  function vAjustes() {
    const c = S.cfg;
    const tog = (k, titulo, sub, dis) => `<div class="chave"><div>${titulo}<small>${sub}</small></div><button class="tog${c[k] ? ' on' : ''}" data-acao="tog" data-cfg="${k}" aria-label="${titulo}" ${dis ? 'disabled' : ''}></button></div>`;
    const perm = 'Notification' in window ? Notification.permission : 'indisponível';
    return `<h4>Ajustes</h4><div class="sub">Tudo fica salvo só neste navegador</div><div class="rolar">
      <div class="grade2"><div class="campo"><label for="cNome">Nome da assistente</label><input id="cNome" data-cfg="nome" value="${esc(c.nome)}" maxlength="20"></div>
      <div class="campo"><label for="cUsuario">Seu nome</label><input id="cUsuario" data-cfg="usuario" value="${esc(c.usuario)}" maxlength="30" placeholder="Como devo te chamar?"></div></div>
      <div class="campo"><span>Personalidade</span><div class="chips" style="margin:0">${Object.entries(PERSONAS).map(([k, v]) => `<button class="chip${k === c.personalidade ? ' on' : ''}" data-acao="set" data-k="personalidade" data-val="${k}">${v.rotulo}</button>`).join('')}</div></div>
      <div class="secao">Voz</div>
      ${tog('voz', 'Responder em voz alta', 'Uma voz de robozinho lê as respostas')}
      ${tog('somenteExecutar', 'Modo só executar', 'Faz o que você pediu e fica quieto')}
      ${usarOffline() ? `<div class="chave"><div>Última coisa que eu ouvi<small id="ultimoOuvido">${esc((R.ouvidos && R.ouvidos[0] && R.ouvidos[0].t) || '—')}</small></div></div>` : ''}
      ${tog('sempreOuvindo', `Sempre ouvindo "Ei, ${esc(c.nome)}"`, usarOffline() ? 'Reconhecimento offline, feito no seu computador: nada do que você fala sai do PC. Funciona melhor com nomes que são palavras em português.' : temVoz() ? 'O microfone fica ligado enquanto esta janela estiver aberta. O reconhecimento é feito pelo navegador.' : window.lumiDesktop ? 'A voz offline não foi encontrada neste app' : 'Precisa do Chrome ou do Edge', !temVoz())}
      <div class="grade2"><div class="campo"><label for="cMotor">Tipo de voz</label><select id="cMotor" data-cfg="vozMotor"><option value="navegador"${c.vozMotor !== 'google' ? ' selected' : ''}>Voz do computador (grátis, offline)</option><option value="google"${c.vozMotor === 'google' ? ' selected' : ''}>Google AI Studio (Gemini)</option></select></div>
      <div class="campo"><span>&nbsp;</span><button class="btn fantasma" data-acao="testar-voz">🔊 Testar voz</button></div></div>
      ${c.vozMotor === 'google' ? `<div class="nota-aviso">Vozes femininas do Gemini, bem naturais. Precisa de internet e de uma chave grátis do Google AI Studio (aistudio.google.com → Get API key). A chave fica salva só neste navegador; o uso conta na cota da sua conta Google. Se a voz do Google falhar, ela usa a voz do computador.</div>
      <div class="grade2"><div class="campo"><label for="cGemini">Chave do Google AI Studio</label><input id="cGemini" type="password" data-cfg="geminiChave" value="${esc(c.geminiChave)}" placeholder="AIza…" autocomplete="off"></div>
      <div class="campo"><label for="cGVoz">Voz feminina</label><select id="cGVoz" data-cfg="geminiVoz">${window.VOZ_GOOGLE ? window.VOZ_GOOGLE.VOZES.map(([n, d]) => `<option value="${n}"${n === c.geminiVoz ? ' selected' : ''}>${n} · ${d}</option>`).join('') : ''}</select></div>
      <div class="campo"><label for="cGModelo">Modelo de voz</label><select id="cGModelo" data-cfg="geminiModelo">${window.VOZ_GOOGLE ? window.VOZ_GOOGLE.MODELOS.map(([v, n]) => `<option value="${v}"${v === c.geminiModelo ? ' selected' : ''}>${n}</option>`).join('') : ''}</select><small>O jeito de falar segue a personalidade escolhida acima</small></div></div>`
      : `<div class="grade2"><div class="campo"><label for="cVoz">Voz</label><select id="cVoz" data-cfg="vozNome"><option value="">Automática</option>${vozes.map((v) => `<option value="${esc(v.name)}"${v.name === c.vozNome ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div><div></div>
      <div class="campo"><label for="cVel">Velocidade · ${c.velocidade.toFixed(2)}</label><input id="cVel" type="range" min="0.6" max="1.6" step="0.05" value="${c.velocidade}" data-cfg="velocidade" data-num></div>
      <div class="campo"><label for="cTom">Tom (mais alto = mais fofinho) · ${c.tom.toFixed(2)}</label><input id="cTom" type="range" min="0.5" max="2" step="0.05" value="${c.tom}" data-cfg="tom" data-num></div></div>`}
      <div class="secao">Clima e PIX</div>
      <div class="grade2"><div class="campo"><label for="cCidade">Sua cidade</label><input id="cCidade" data-cfg="cidade" value="${esc(c.cidade)}" placeholder="Ex.: Florianópolis"><small>Vazio = usar a localização do navegador</small></div>
      <div class="campo"><label for="cPix">Sua chave PIX</label><input id="cPix" data-cfg="pix" value="${esc(c.pix)}" placeholder="e-mail, telefone, CPF ou aleatória"><small>Para "copia meu pix"</small></div></div>
      <div class="secao">Avisos</div>
      <div class="chave"><div>Notificações do sistema<small>${perm === 'granted' ? 'Ativadas ✅' : perm === 'denied' ? 'Bloqueadas no navegador. Libere nas configurações do site.' : 'Para avisar timers e lembretes mesmo com a janela em segundo plano'}</small></div>${perm === 'default' ? '<button class="btn fantasma" data-acao="notificacoes">Ativar</button>' : ''}</div>
      <div class="secao">Cérebro (para conversar e pesquisar)</div>
      <div class="nota-aviso">Os comandos do dia a dia funcionam sempre, sem cérebro. O cérebro responde o resto: perguntas, pesquisas na internet, textos e procurar arquivos no seu PC.</div>
      <div class="grade2"><div class="campo"><label for="cCerebro">Cérebro</label><select id="cCerebro" data-cfg="cerebro">${[['auto', 'Automático'], ['claudecode', 'Claude Code (sua assinatura)'], ['api', 'API do Claude (chave paga à parte)'], ['local', 'Só os comandos da ' + esc(c.nome)]].map(([v, n]) => `<option value="${v}"${v === (c.cerebro || 'auto') ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <small>${(() => { const m = motorCerebro(); return m === 'cc' ? '✅ Usando o Claude Code' : m === 'api' ? '✅ Usando a API do Claude' : 'Sem cérebro: só os comandos'; })()}</small></div>
      <div class="campo"><span>&nbsp;</span><button class="btn fantasma" data-acao="cc-nova">🧹 Nova conversa</button></div></div>
      ${(c.cerebro || 'auto') !== 'api' && (c.cerebro || 'auto') !== 'local' ? (CC
        ? `<div class="chave"><div>Claude Code neste computador<small>${R.cc === null ? 'Procurando…' : R.cc.instalado ? `Encontrado${R.cc.versao ? ' (versão ' + esc(R.cc.versao) + ')' : ''}. Usa a sua assinatura do Claude, sem pagar API. Cada resposta leva alguns segundos. Notas ficam em Documentos/Lumi/cerebro.` : 'Não encontrado. Instale o Claude Code, abra o terminal, digite claude e faça o login; depois reabra o app.'}</small></div><button class="btn fantasma" data-acao="cc-status">Verificar</button></div>
        <div class="campo"><label for="cCcModelo">Modelo do Claude Code</label><select id="cCcModelo" data-cfg="ccModelo">${[['sonnet', 'Sonnet (rápido, recomendado para voz)'], ['opus', 'Opus (mais capaz, mais lento)'], ['haiku', 'Haiku (o mais rápido)']].map(([v, n]) => `<option value="${v}"${v === c.ccModelo ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`
        : '<div class="nota-aviso">O Claude Code como cérebro só funciona no app instalado (Lumi-Instalador.exe).</div>') : ''}
      ${(c.cerebro || 'auto') === 'api' || ((c.cerebro || 'auto') === 'auto' && !(CC && R.cc && R.cc.instalado)) ? `<div class="nota-aviso">API do Claude: cobrada à parte pela Anthropic na sua conta do Console. A chave fica salva só neste computador.</div>
      <div class="grade2"><div class="campo"><label for="cIa">Chave da API (Claude)</label><input id="cIa" type="password" data-cfg="iaChave" value="${esc(c.iaChave)}" placeholder="sk-ant-…" autocomplete="off"><small>Crie em console.anthropic.com</small></div>
      <div class="campo"><label for="cModelo">Modelo</label><select id="cModelo" data-cfg="iaModelo">${[['claude-opus-5-5', 'Claude Opus 5.5 (mais capaz)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (equilibrado)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (mais rápido e barato)']].map(([v, n]) => `<option value="${v}"${v === c.iaModelo ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>` : ''}
      <div class="secao">Dados</div>
      <div class="form"><button class="btn fantasma" data-acao="limpar-conversa">Limpar conversa</button><button class="btn perigo" data-acao="apagar-tudo">Apagar tudo</button></div></div>`;
  }
  const VIEWS = { inicio: vInicio, tarefas: vTarefas, habitos: vHabitos, timers: vTimers, musica: vMusica, notas: vNotas, visual: vVisual, ajustes: vAjustes };

  function renderPrincipal() {
    const ativo = document.activeElement;
    const foco = ativo && principal.contains(ativo) && ativo.id ? { id: ativo.id, s: ativo.selectionStart, e: ativo.selectionEnd } : null;
    const rolagem = {}; principal.querySelectorAll('.rolar').forEach((el, i) => { rolagem[i] = el.scrollTop; });
    principal.innerHTML = (VIEWS[R.view] || vInicio)();
    for (const [id, v] of Object.entries(R.rascunhos)) { const el = document.getElementById(id); if (el && principal.contains(el) && !el.hasAttribute('data-cfg')) el.value = v; }
    principal.querySelectorAll('.rolar').forEach((el, i) => { if (rolagem[i]) el.scrollTop = rolagem[i]; });
    const conv = $('#conversa'); if (conv) conv.scrollTop = conv.scrollHeight;
    if (foco) { const el = document.getElementById(foco.id); if (el) { el.focus({ preventScroll: true }); try { if (foco.s !== null) el.setSelectionRange(foco.s, foco.e); } catch (_) { /* campo sem seleção */ } } }
    atualizarProgresso();
  }
  function render() {
    renderPilula();
    if (R.aberto) { renderLado(); renderPrincipal(); }
    $('#wAguaN').textContent = `${S.habitos.agua}/${S.habitos.meta}`;
  }
  function atualizarProgresso() {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    document.querySelectorAll('[data-pbar]').forEach((el) => { el.style.width = pct + '%'; });
  }
  function tique() {
    const agora = Date.now();
    for (const t of S.timers) {
      const resta = (t.fim - agora) / 1000;
      const el = document.querySelector(`[data-timer="${t.id}"]`); if (el) el.textContent = mmss(resta);
      const b = document.querySelector(`[data-timerbar="${t.id}"]`); if (b) b.style.width = Math.min(100, 100 - resta / t.total * 100) + '%';
    }
    const cr = document.querySelector('[data-crono]'); if (cr) cr.textContent = mmss(cronoSeg());
    atualizarProgresso();
    verificarAgendados();
    if (S.timers.length || R.crono.rodando || R.trabalho) renderPilula();
    if (!R.aberto && R.humor === 'idle' && !R.ouvindo && !R.falando && agora - R.ultimaAtividade > 120e3) setHumor('sleep');
  }

  /* ================= abrir e fechar ================= */
  let fecharT = null;
  function abrir(foco) {
    clearTimeout(fecharT);
    if (!R.aberto) { R.aberto = true; entalho.classList.add('aberto'); entalho.style.removeProperty('--w'); mesa.classList.add('usada'); if (window.lumiDesktop) window.lumiDesktop.aberto(true); render(); }
    if (R.humor === 'sleep') setHumor('surprised', 900);
    if (foco) setTimeout(() => { const c = $('#campo'); if (c) c.focus(); }, 300);
  }
  function fechar() {
    if (!R.aberto) return;
    R.aberto = false; entalho.classList.remove('aberto'); if (window.lumiDesktop) window.lumiDesktop.aberto(false);
    if (document.activeElement && entalho.contains(document.activeElement)) document.activeElement.blur();
    render();
  }
  const toque = matchMedia('(hover: none), (pointer: coarse)').matches;
  entalho.addEventListener('mouseenter', () => { if (window.lumiDesktop) window.lumiDesktop.mouse(true); if (!toque) abrir(); });
  entalho.addEventListener('mouseleave', () => {
    if (toque) return;
    fecharT = setTimeout(() => {
      const a = document.activeElement;
      if (a && entalho.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value) return; // está digitando
      fechar(); if (window.lumiDesktop) window.lumiDesktop.mouse(false);
    }, 700);
  });
  pilula.addEventListener('click', () => { if (R.alarme) { pararAlarme(); return; } abrir(); });
  pilula.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(true); } });
  // composedPath guarda o caminho do clique mesmo se o botão foi redesenhado no meio do caminho
  mesa.addEventListener('click', (e) => { const cam = e.composedPath(); if (!cam.includes(entalho) && !cam.some((n) => n.classList && n.classList.contains('widget'))) fechar(); });

  /* ================= eventos do painel ================= */
  const ACOES = {
    ouvir: () => ouvir(),
    'tarefa-ok': (el) => { const t = S.tarefas.find((x) => x.id === el.dataset.id); if (!t) return; t.feito = !t.feito; t.feitoEm = Date.now(); if (t.feito) { ganharXp(10); setHumor('success', 2000); aviso('✅ Tarefa concluída · +10 XP'); melodia([[1046, 0.1, 0], [1568, 0.18, 0.1]]); } salvar(); },
    'tarefa-del': (el) => { S.tarefas = S.tarefas.filter((x) => x.id !== el.dataset.id); salvar(); },
    'limpar-feitas': () => { S.tarefas = S.tarefas.filter((x) => !x.feito); salvar(); },
    habito: (el) => { const k = el.dataset.k, d = Number(el.dataset.d), h = S.habitos; const max = k === 'agua' ? h.meta : 20; h[k] = Math.max(0, Math.min(max, h[k] + d)); if (d > 0) { ganharXp(5); setHumor(k === 'agua' ? 'love' : 'happy', 1500); if (k === 'agua' && h.agua === h.meta) aviso('🎉 Meta de água batida!'); } salvar(); },
    'timer-novo': (el) => { const t = criarTimer(Math.round(Number(el.dataset.min) * 60), el.dataset.nome); aviso(`⏱ Timer "${t.nome}" iniciado`); setHumor('success', 1500); },
    'timer-del': (el) => { S.timers = S.timers.filter((t) => t.id !== el.dataset.id); salvar(); },
    crono: () => { if (R.crono.rodando) { R.crono.acum += Date.now() - R.crono.inicio; R.crono.rodando = false; } else { R.crono.rodando = true; R.crono.inicio = Date.now(); } },
    'crono-zerar': () => { R.crono = { rodando: false, inicio: 0, acum: 0 }; },
    'add-musica': () => $('#arquivosMusica').click(),
    faixa: (el) => tocarFaixa(Number(el.dataset.i)),
    vol: (el) => { setVolume(S.cfg.volume + Number(el.dataset.d)); aviso(`🔊 Volume ${S.cfg.volume}%`); },
    'copiar-nota': async (el) => { const n = S.notas.find((x) => x.id === el.dataset.id); if (n) { await copiar(n.t, 'Nota'); aviso('📋 Copiado'); render(); } },
    'nota-del': (el) => { S.notas = S.notas.filter((x) => x.id !== el.dataset.id); salvar(); },
    'copiar-de-novo': async (el) => { const c = S.copiados.find((x) => x.id === el.dataset.id); if (c) { try { await navigator.clipboard.writeText(c.t); aviso('📋 Copiado de novo'); } catch (_) { aviso('Não consegui copiar.'); } } },
    'limpar-copiados': () => { S.copiados = []; salvar(); },
    set: (el) => { const k = el.dataset.k; const v = /^\d+$/.test(el.dataset.val) && k !== 'personalidade' ? Number(el.dataset.val) : el.dataset.val; S.cfg[k] = v; salvar(); setHumor(k === 'acessorio' ? 'love' : 'happy', 1500); },
    previa: (el) => { R.previa = el.dataset.val; setHumor(R.previa, 2500); },
    tog: (el) => {
      const k = el.dataset.cfg; S.cfg[k] = !S.cfg[k]; salvar();
      if (k === 'sempreOuvindo') {
        if (S.cfg.sempreOuvindo) { iniciarEscuta(); aviso(`🎙 Diga "Ei, ${S.cfg.nome}" para me chamar`); }
        else if (usarOffline()) { modoVoz = null; R.ouvindo = false; window.VOZ_OFFLINE.desligar(); }
        else pararEscuta();
      }
      if (k === 'pausas' && S.cfg.pausas) R.ultimaPausa = Date.now();
      if (k === 'voz' && !S.cfg.voz) calar();
    },
    'testar-voz': () => { avisouGoogle = false; falar(`Oi${S.cfg.usuario ? ' ' + S.cfg.usuario : ''}! Eu sou a ${S.cfg.nome}. É assim que eu falo.`, true); },
    notificacoes: () => pedirNotificacoes(),
    'cc-nova': async () => { if (CC) await CC.nova(); aviso('🧹 Comecei uma conversa nova'); },
    'cc-status': async () => { if (!CC) return; R.cc = null; renderPrincipal(); R.cc = await CC.status().catch(() => ({ instalado: false })); },
    'limpar-conversa': () => { S.chat = []; salvar(); aviso('Conversa apagada'); },
    'apagar-tudo': () => { if (!confirm(`Apagar tarefas, notas, hábitos, conversa e ajustes da ${S.cfg.nome}?`)) return; try { localStorage.removeItem(CHAVE); } catch (_) { /* ignora */ } location.reload(); },
    'buscar-pos': (el, e) => { if (!audio.duration) return; const r = el.getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration; },
  };
  entalho.addEventListener('click', async (e) => {
    R.ultimaAtividade = Date.now();
    const v = e.target.closest('[data-v]'); if (v) { R.view = v.dataset.v; render(); return; }
    const d = e.target.closest('[data-diz]'); if (d) { processar(d.dataset.diz); return; }
    const sp = e.target.closest('[data-spot]'); if (sp) { spotifyComando(sp.dataset.spot); return; }
    const m = e.target.closest('[data-mus]'); if (m) { if (!R.musica.lista.length) { R.view = 'musica'; render(); return; } musica(m.dataset.mus); return; }
    const a = e.target.closest('[data-acao]'); if (a && ACOES[a.dataset.acao]) { e.preventDefault(); await ACOES[a.dataset.acao](a, e); if (a.dataset.acao !== 'ouvir') render(); }
  });
  entalho.addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target;
    if (f.id === 'formPergunta') { const c = $('#campo'); const t = c.value; c.value = ''; delete R.rascunhos.campo; processar(t); return; }
    if (f.id === 'formTarefa') {
      const t = $('#novaTarefa').value.trim(); if (!t) return; const q = $('#novaQuando').value;
      S.tarefas.push({ id: uid(), t: t.charAt(0).toUpperCase() + t.slice(1), quando: q ? new Date(q).getTime() : null, tipo: 'tarefa', feito: false, avisado: false, criado: Date.now() });
      delete R.rascunhos.novaTarefa; delete R.rascunhos.novaQuando; salvar(); setHumor('success', 1500); render(); $('#novaTarefa') && $('#novaTarefa').focus(); return;
    }
    if (f.id === 'formTimer') {
      const min = parseFloat(String($('#timerMin').value).replace(',', '.')); if (!(min > 0)) { aviso('Quantos minutos?'); return; }
      const t = criarTimer(Math.round(min * 60), $('#timerNome').value.trim() || 'Timer'); delete R.rascunhos.timerNome; delete R.rascunhos.timerMin; aviso(`⏱ Timer "${t.nome}" iniciado`); render(); return;
    }
    if (f.id === 'formNota') { const t = $('#novaNota').value.trim(); if (!t) return; S.notas.unshift({ id: uid(), t, ts: Date.now() }); delete R.rascunhos.novaNota; salvar(); setHumor('success', 1500); render(); return; }
    if (f.id === 'formSpotify') { const q = $('#buscaSpotify').value.trim(); if (!q) return; const url = 'https://open.spotify.com/search/' + encodeURIComponent(q); abrirLink(url); delete R.rascunhos.buscaSpotify; aviso('🎵 Abrindo o Spotify'); }
  });
  entalho.addEventListener('input', (e) => {
    const el = e.target;
    if (el.hasAttribute('data-volume')) { setVolume(Number(el.value)); el.style.setProperty('--p', S.cfg.volume + '%'); document.querySelectorAll('[data-volp]').forEach((x) => { x.textContent = S.cfg.volume + '%'; }); return; }
    if (el.id && !el.hasAttribute('data-cfg')) R.rascunhos[el.id] = el.value;
    if (el.hasAttribute('data-cfg') && el.type === 'range') { S.cfg[el.dataset.cfg] = Number(el.value); salvar(); const lab = el.previousElementSibling; if (lab) lab.textContent = lab.textContent.replace(/·\s*[\d.]+$/, '· ' + Number(el.value).toFixed(2)); }
  });
  entalho.addEventListener('change', (e) => {
    const el = e.target;
    if (el.hasAttribute('data-meta')) { S.habitos.meta = Number(el.value); S.habitos.agua = Math.min(S.habitos.agua, S.habitos.meta); salvar(); render(); return; }
    if (!el.hasAttribute('data-cfg')) return;
    const k = el.dataset.cfg; let v = el.hasAttribute('data-num') ? Number(el.value) : el.value.trim();
    if (k === 'nome') v = v || 'Lumi';
    S.cfg[k] = v; salvar();
    if (k === 'cidade') { R.lugar = null; atualizarWidgetClima(); }
    if (/^(vozMotor|gemini)/.test(k)) { avisouGoogle = false; cacheFala.clear(); }
    if (k === 'vozMotor' || k === 'cerebro') renderPrincipal();
    if (k === 'nome' || k === 'usuario') renderLado();
  });
  $('#arquivosMusica').addEventListener('change', (e) => { adicionarMusicas(e.target.files); e.target.value = ''; });

  /* widgets da mesa */
  $('#wAgua').addEventListener('click', () => processar('bebi um copo de água'));
  $('#wClima').addEventListener('click', () => { abrir(); processar('como está o clima?'); });

  /* teclado */
  addEventListener('keydown', (e) => {
    R.ultimaAtividade = Date.now();
    if (e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (R.aberto) fechar(); else abrir(true); }
    else if (e.altKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); abrir(); ouvir(); }
    else if (e.key === 'Escape') { if (R.alarme) pararAlarme(); else if (R.falando) calar(); else if (R.ouvindo && voz.rec) voz.rec.abort(); else fechar(); }
  });

  /* olhos seguem o mouse; acorda quando você volta */
  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (R.humor === 'sleep' && Date.now() - R.ultimaAtividade > 2000) setHumor('surprised', 900);
    R.ultimaAtividade = Date.now();
    if (!rafOlhar) rafOlhar = requestAnimationFrame(() => { rafOlhar = 0; M.olhar(document, mx, my); });
  }, { passive: true });

  /* relógio da mesa */
  function relogio() { const d = new Date(); $('#wHora').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; $('#wData').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }); }

  /* app de computador (Electron) */
  if (window.lumiDesktop && window.lumiDesktop.vozInfo) {
    window.lumiDesktop.vozInfo().then((i) => { R.vozOff = i; render(); if (S.cfg.sempreOuvindo) iniciarEscuta(); }).catch(() => { R.vozOff = { disponivel: false }; });
  }
  if (CC) CC.status().then((st) => { R.cc = st; render(); }).catch(() => { R.cc = { instalado: false }; });
  if (SPOT) { SPOT.aoMudar(receberSpotify); SPOT.estado().then(receberSpotify).catch(() => {}); }
  if (window.lumiDesktop) {
    window.lumiDesktop.aoAtalho((qual) => { if (qual === 'ouvir') { abrir(); ouvir(); } else if (R.aberto) fechar(); else abrir(true); });
  }

  /* instala como app (PWA) quando servido por http(s) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !DESKTOP) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem modo offline */ });
  }

  /* ================= início ================= */
  audio.volume = S.cfg.volume / 100;
  relogio(); setInterval(relogio, 15000);
  setInterval(tique, 1000);
  if (S.habitos.dia !== hojeStr()) { S.habitos = { ...S.habitos, dia: hojeStr(), agua: 0, leitura: 0, exercicio: 0 }; salvar(); }
  render(); verificarAgendados();
  if (S.cfg.cidade) atualizarWidgetClima();
  else if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') return previsao().then((r) => r && atualizarWidgetClima(r)); }).catch(() => { /* sem permissão */ });
  }
  if (S.cfg.sempreOuvindo && !window.lumiDesktop) iniciarEscuta();

  // para testes e depuração no console
  window.LUMI = { processar, estado: S, sessao: R, abrir, fechar, ouvir, iniciarEscuta, interpretar: (t) => C.interpretar(t, { agora: Date.now(), nome: S.cfg.nome }) };
})();
