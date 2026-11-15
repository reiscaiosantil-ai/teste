/* Lumi — reconhecimento de voz offline (Vosk em WebAssembly, modelo em português).
   Usado no app instalado, onde o reconhecimento do navegador não funciona. Nada sai do computador. */
(function (raiz) {
  'use strict';
  const cont = { resultados: 0, parciais: 0, blocos: 0 };
  let modelo = null, carregando = null, ctx = null, stream = null, no = null, fonte = null, rec = null, ouvintes = null, pausado = false;

  function carregarScript() {
    if (raiz.Vosk) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'node_modules/vosk-browser/dist/vosk.js';
      s.onload = () => ok(); s.onerror = () => erro(new Error('o reconhecedor de voz não foi encontrado'));
      document.head.appendChild(s);
    });
  }
  /** Carrega o modelo uma vez só (leva ~2 s). */
  function preparar(url) {
    if (modelo) return Promise.resolve(modelo);
    if (!carregando) {
      carregando = (async () => { await carregarScript(); modelo = await raiz.Vosk.createModel(url, -1); return modelo; })()
        .catch((e) => { carregando = null; throw e; });
    }
    return carregando;
  }
  /**
   * Liga o microfone e entrega frases reconhecidas.
   * @param {string} url  endereço do modelo (lumivoz://…)
   * @param {{resultado:(t:string)=>void, parcial:(t:string)=>void}} cb
   */
  async function ligar(url, cb) {
    ouvintes = cb;
    await preparar(url);
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      ctx = new AudioContext({ sampleRate: 16000 });
      fonte = ctx.createMediaStreamSource(stream);
      no = ctx.createScriptProcessor(4096, 1, 1);
      rec = new modelo.KaldiRecognizer(16000);
      rec.on('result', (m) => { cont.resultados++; const t = ((m.result && m.result.text) || '').trim(); if (t && ouvintes && !pausado) ouvintes.resultado(t); });
      rec.on('partialresult', (m) => { cont.parciais++; const t = ((m.result && m.result.partial) || '').trim(); if (ouvintes && !pausado) ouvintes.parcial(t); });
      no.onaudioprocess = (e) => { cont.blocos++; if (pausado) return; try { rec.acceptWaveform(e.inputBuffer); } catch (_) { /* pedaço perdido */ } };
      fonte.connect(no); no.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }
  function desligar() {
    try { if (no) no.disconnect(); if (fonte) fonte.disconnect(); } catch (_) { /* já desligado */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try { if (rec) rec.remove(); } catch (_) { /* ignora */ }
    try { if (ctx) ctx.close(); } catch (_) { /* ignora */ }
    stream = ctx = no = fonte = rec = null; ouvintes = null;
  }
  /** Ignora o microfone enquanto o assistente fala, para ele não ouvir a própria voz. */
  function pausar(sim) { pausado = !!sim; }

  raiz.VOZ_OFFLINE = { preparar, ligar, desligar, pausar, ativo: () => !!stream, diagnostico: () => ({ ...cont, pausado, contexto: ctx && ctx.state, microfone: !!stream }) };
})(window);
