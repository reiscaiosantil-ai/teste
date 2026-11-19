/* Lumi — conversa livre com o Gemini, usando a chave do Google AI Studio do próprio usuário (cota grátis).
   Só é usado quando o cérebro local não entende o pedido. A página chama a API do Google direto;
   a chave fica só neste aparelho. Também roda no Node (testes, com fetch simulado). */
(function (raiz) {
  'use strict';
  const URL_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  // os dois têm cota grátis; quando a do primeiro acaba, tenta o segundo
  const MODELOS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

  /** Junta o histórico num texto só: conversa recente + mensagem nova. */
  function montarEntrada(historico, nome) {
    const h = (historico || []).filter((m) => m && m.content);
    if (!h.length) return '';
    const ultima = h[h.length - 1];
    if (h.length === 1) return ultima.content;
    const antes = h.slice(0, -1).map((m) => `${m.role === 'user' ? 'Usuário' : nome || 'Assistente'}: ${m.content}`).join('\n');
    return `Conversa recente:\n${antes}\n\nMensagem nova: ${ultima.content}`;
  }

  /** Texto da resposta: `output_text` ou os textos do último passo do modelo. */
  function extrairTexto(d) {
    if (!d) return '';
    if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text.trim();
    const passos = Array.isArray(d.steps) ? d.steps : [];
    for (let i = passos.length - 1; i >= 0; i--) {
      const p = passos[i]; if (!p || p.type !== 'model_output') continue;
      const t = (p.content || []).filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('').trim();
      if (t) return t;
    }
    return '';
  }

  const ERRO = {
    cota: 'A conversa grátis do Google acabou por agora. Daqui a pouco volta; enquanto isso, os comandos continuam funcionando.',
    rapido: 'Foram muitas perguntas seguidas para a cota grátis do Google. Espera um minutinho e pergunta de novo.',
    chave: 'A chave do Google AI Studio não foi aceita. Confira em Ajustes se ela foi colada inteira.',
    rede: 'Estou sem internet agora, então não consigo conversar. Os comandos como timer, lista e gastos continuam funcionando.',
    vazia: 'Desculpa, não consegui pensar numa resposta para isso. Pode perguntar de outro jeito?',
    servidor: 'O Google teve um problema agora. Tenta de novo daqui a pouco.',
  };

  /** Segundos que o Google pede para esperar num 429 por minuto ("27s"); null se não disser. */
  function esperaPedida(d) {
    const e = Array.isArray(d) ? d[0] : d;
    const det = (e && e.error && e.error.details) || [];
    for (const x of det) { const m = /^(\d+(?:\.\d+)?)s$/.exec((x && x.retryDelay) || ''); if (m) return Math.ceil(parseFloat(m[1])); }
    return null;
  }

  /**
   * @param {{chave:string, sistema:string, historico:Array<{role:'user'|'assistant', content:string}>, nome?:string, modelo?:string, sinal?:AbortSignal, limiteMs?:number, fetch?:Function}} p
   * @returns {Promise<{texto:string, modelo?:string, erro?:true, cota?:true, espera?:number, chaveInvalida?:true, semRede?:true}>}
   */
  async function perguntar({ chave, sistema, historico, nome, modelo, sinal, limiteMs = 30000, fetch: f }) {
    const buscar = f || raiz.fetch.bind(raiz);
    const k = String(chave || '').trim();
    const texto = montarEntrada(historico, nome);
    let espera = null; // menor espera pedida pelo Google nos 429 por minuto
    let teveCota = false;
    for (const m of modelo ? [modelo] : MODELOS) {
      // desiste se o Google demorar demais (sinal fraco, wi-fi com login); quem chamou ainda pode cancelar
      const ctl = new AbortController(), tempo = setTimeout(() => ctl.abort(), limiteMs);
      if (sinal) { if (sinal.aborted) ctl.abort(); else sinal.addEventListener('abort', () => ctl.abort(), { once: true }); }
      let r;
      try {
        r = await buscar(URL_API, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
          body: JSON.stringify({ model: m, store: false, system_instruction: sistema, input: [{ type: 'user_input', content: [{ type: 'text', text: texto }] }] }),
        });
      } catch (e) {
        if (e && e.name === 'AbortError' && sinal && sinal.aborted) throw e; // cancelado por quem chamou
        return { erro: true, semRede: true, texto: ERRO.rede };
      } finally { clearTimeout(tempo); }
      const d = await r.json().catch(() => null);
      if (r.status === 429) { teveCota = true; const s = esperaPedida(d); if (s !== null) espera = espera === null ? s : Math.min(espera, s); continue; } // cota deste modelo: tenta o próximo
      if (r.status === 404 && !modelo) continue; // modelo aposentado ou renomeado: tenta o próximo
      if (!r.ok) {
        const e = Array.isArray(d) ? d[0] : d; // o Google às vezes devolve o erro dentro de uma lista
        const msg = (e && e.error && e.error.message) || '';
        if (/API key not valid|API_KEY_INVALID|API key expired/i.test(msg) || r.status === 401 || r.status === 403) return { erro: true, chaveInvalida: true, texto: ERRO.chave };
        return { erro: true, texto: ERRO.servidor };
      }
      const t = extrairTexto(d);
      return t ? { texto: t, modelo: m } : { erro: true, texto: ERRO.vazia };
    }
    if (!teveCota) return { erro: true, texto: ERRO.servidor };
    if (espera !== null && espera <= 600) return { erro: true, cota: true, espera, texto: ERRO.rapido };
    return { erro: true, cota: true, texto: ERRO.cota };
  }

  const api = { MODELOS, montarEntrada, extrairTexto, perguntar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.IA_GEMINI = api;
})(typeof window !== 'undefined' ? window : globalThis);
