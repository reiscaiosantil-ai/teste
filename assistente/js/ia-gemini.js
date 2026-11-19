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
    chave: 'A chave do Google AI Studio não foi aceita. Confira em Ajustes se ela foi colada inteira.',
    rede: 'Estou sem internet agora, então não consigo conversar. Os comandos como timer, lista e gastos continuam funcionando.',
    vazia: 'Desculpa, não consegui pensar numa resposta para isso. Pode perguntar de outro jeito?',
    servidor: (s) => `O Google teve um problema agora (erro ${s}). Tenta de novo daqui a pouco.`,
  };

  /**
   * @param {{chave:string, sistema:string, historico:Array<{role:'user'|'assistant', content:string}>, nome?:string, modelo?:string, sinal?:AbortSignal, fetch?:Function}} p
   * @returns {Promise<{texto:string, modelo?:string, erro?:true, cota?:true, chaveInvalida?:true, semRede?:true}>}
   */
  async function perguntar({ chave, sistema, historico, nome, modelo, sinal, fetch: f }) {
    const buscar = f || raiz.fetch.bind(raiz);
    const k = String(chave || '').trim();
    const texto = montarEntrada(historico, nome);
    for (const m of modelo ? [modelo] : MODELOS) {
      let r;
      try {
        r = await buscar(URL_API, {
          method: 'POST', signal: sinal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
          body: JSON.stringify({ model: m, store: false, system_instruction: sistema, input: [{ type: 'user_input', content: [{ type: 'text', text: texto }] }] }),
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        return { erro: true, semRede: true, texto: ERRO.rede };
      }
      if (r.status === 429) continue; // cota deste modelo acabou: tenta o próximo
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        const e = Array.isArray(d) ? d[0] : d; // o Google às vezes devolve o erro dentro de uma lista
        const msg = (e && e.error && e.error.message) || '';
        if (/API key not valid|API_KEY_INVALID|API key expired/i.test(msg) || r.status === 401 || r.status === 403) return { erro: true, chaveInvalida: true, texto: ERRO.chave };
        return { erro: true, texto: ERRO.servidor(r.status) };
      }
      const t = extrairTexto(d);
      return t ? { texto: t, modelo: m } : { erro: true, texto: ERRO.vazia };
    }
    return { erro: true, cota: true, texto: ERRO.cota };
  }

  const api = { MODELOS, montarEntrada, extrairTexto, perguntar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.IA_GEMINI = api;
})(typeof window !== 'undefined' ? window : globalThis);
