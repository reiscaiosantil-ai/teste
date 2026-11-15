/* Lumi — conversa livre com o Claude, usando a chave de API do próprio usuário.
   Só é usado quando o cérebro local não entende o pedido e há uma chave salva em Ajustes.
   O SDK oficial é carregado sob demanda do CDN (jsDelivr). */
(function (raiz) {
  'use strict';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';
  // estes modelos aceitam o fallback automático do servidor quando o modelo recusa um pedido
  const COM_FALLBACK = /^claude-(?:opus-5-5|sonnet-5-5)$/;

  let carregando = null, chaveAtual = null;
  function cliente(chave) {
    if (!carregando || chave !== chaveAtual) {
      chaveAtual = chave;
      carregando = import(SDK_URL).then((mod) => {
        const Anthropic = mod.default || mod.Anthropic;
        // a chave fica só neste navegador; a página fala direto com a API da Anthropic
        return { Anthropic, c: new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true }) };
      }).catch((e) => { carregando = null; throw e; });
    }
    return carregando;
  }

  /**
   * @param {{chave:string, modelo:string, sistema:string, historico:Array<{role:'user'|'assistant', content:string}>}} p
   * @returns {Promise<{texto:string, recusa?:boolean, erro?:boolean}>}
   */
  async function perguntar({ chave, modelo, sistema, historico }) {
    let mod;
    try { mod = await cliente(chave); } catch (_) {
      return { erro: true, texto: 'Não consegui carregar a IA agora. Verifique sua internet e tente de novo.' };
    }
    const { Anthropic, c } = mod;
    const params = {
      model: modelo,
      max_tokens: 2000,
      system: sistema,
      messages: historico,
      output_config: { effort: 'low' },
    };
    if (COM_FALLBACK.test(modelo)) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    try {
      const resp = await c.beta.messages.create(params);
      if (resp.stop_reason === 'refusal') return { recusa: true, texto: 'Desse assunto eu prefiro não falar. Posso ajudar com outra coisa?' };
      const texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { texto: texto || 'Hmm, fiquei sem palavras. Pode perguntar de outro jeito?' };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return { erro: true, texto: 'A chave da IA não foi aceita. Confira em Ajustes.' };
      if (e instanceof Anthropic.PermissionDeniedError) return { erro: true, texto: 'Essa chave não tem permissão para usar esse modelo.' };
      if (e instanceof Anthropic.NotFoundError) return { erro: true, texto: 'Esse modelo não está disponível para a sua chave. Troque em Ajustes.' };
      if (e instanceof Anthropic.RateLimitError) return { erro: true, texto: 'Muitos pedidos seguidos para a IA. Espere um pouquinho e tente de novo.' };
      if (e instanceof Anthropic.BadRequestError) return { erro: true, texto: 'A IA recusou o formato do pedido: ' + (e.message || 'erro 400') };
      if (e instanceof Anthropic.APIConnectionError) return { erro: true, texto: 'Sem conexão com a IA agora. Verifique sua internet.' };
      if (e instanceof Anthropic.APIError) return { erro: true, texto: `A IA respondeu com erro ${e.status || ''}. Tente de novo daqui a pouco.` };
      throw e;
    }
  }

  raiz.IA = { perguntar };
})(window);
