/* Lumi — voz do Google AI Studio (Gemini TTS), com a chave da API do próprio usuário.
   A página chama a API do Google direto; a chave fica só neste navegador. */
(function (raiz) {
  'use strict';
  const URL_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';

  // vozes prontas do Gemini com timbre feminino, com a descrição do Google traduzida
  const VOZES = [
    ['Leda', 'jovial'], ['Kore', 'firme'], ['Aoede', 'leve'], ['Zephyr', 'brilhante'], ['Autonoe', 'brilhante'], ['Laomedeia', 'animada'],
    ['Callirrhoe', 'tranquila'], ['Despina', 'suave'], ['Erinome', 'clara'], ['Achernar', 'macia'], ['Vindemiatrix', 'gentil'],
    ['Sulafat', 'calorosa'], ['Pulcherrima', 'direta'], ['Gacrux', 'madura'],
  ];
  const MODELOS = [['gemini-3.8-flash-tts', 'Gemini 3.8 Flash TTS (melhor qualidade)'], ['gemini-3.8-flash-lite-tts', 'Gemini 3.8 Flash-Lite TTS (mais rápido)']];

  // acha o áudio na resposta: steps[] → model_output → content[] → último item de áudio
  function extrairAudio(d) {
    const passos = (d && d.steps) || [];
    for (let i = passos.length - 1; i >= 0; i--) {
      const p = passos[i]; if (p.type && p.type !== 'model_output') continue;
      const itens = (p.content || []).filter((c) => c && typeof c.data === 'string' && (c.type === 'audio' || /^audio\//.test(c.mime_type || '')));
      if (itens.length) return itens[itens.length - 1];
    }
    if (d && d.output_audio && d.output_audio.data) return d.output_audio;
    return null;
  }

  function base64ParaBytes(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // PCM 16 bits, mono, 24 kHz sem cabeçalho → WAV (para o decodificador do navegador)
  function pcmParaWav(pcm, taxa = 24000) {
    const buf = new ArrayBuffer(44 + pcm.length), v = new DataView(buf);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, taxa, true);
    v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, pcm.length, true);
    new Uint8Array(buf, 44).set(pcm);
    return buf;
  }

  /**
   * Gera a fala. Devolve um ArrayBuffer com um WAV pronto para decodeAudioData.
   * @param {{chave:string, modelo:string, voz:string, texto:string, estilo?:string, sinal?:AbortSignal}} p
   */
  async function sintetizar({ chave, modelo, voz, texto, estilo, sinal }) {
    const conteudo = { type: 'text', text: texto };
    if (estilo) conteudo.annotations = [{ type: 'speech_metadata', style: estilo }];
    let r;
    try {
      r = await fetch(URL_API, {
        method: 'POST', signal: sinal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify({
          model: modelo,
          input: [{ type: 'user_input', content: [conteudo] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: voz }] },
        }),
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('sem conexão com o Google');
    }
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      const e = Array.isArray(d) ? d[0] : d; // o Google às vezes devolve o erro dentro de uma lista
      const msg = (e && e.error && (e.error.message + ' ' + JSON.stringify(e.error.details || ''))) || '';
      if (/API key not valid|API_KEY_INVALID/i.test(msg)) throw new Error('a chave do Google AI Studio não foi aceita');
      if (r.status === 429) throw new Error('limite de uso da voz do Google atingido');
      if (r.status === 403) throw new Error('essa chave não tem acesso à voz do Gemini');
      if (r.status === 404) throw new Error('modelo de voz não encontrado');
      throw new Error(`o Google respondeu com erro ${r.status}${e && e.error && e.error.message ? ': ' + e.error.message : ''}`);
    }
    const audio = extrairAudio(d);
    if (!audio) throw new Error('o Google não devolveu áudio');
    const bytes = base64ParaBytes(audio.data);
    const temCabecalho = bytes.length > 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF';
    if (temCabecalho) return bytes.buffer;
    const taxa = parseInt((/rate=(\d+)/.exec(audio.mime_type || '') || [])[1] || audio.sample_rate || 24000, 10);
    return pcmParaWav(bytes, taxa);
  }

  const api = { sintetizar, extrairAudio, pcmParaWav, VOZES, MODELOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.VOZ_GOOGLE = api;
})(typeof window !== 'undefined' ? window : globalThis);
