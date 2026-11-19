# Cérebro Gemini para a Sexta-feira no celular — design

Data: 19/11/2026 · Tamanho: projeto pequeno (duas partes)

## Por quê
No celular não existe Claude Code, então a Sexta-feira de lá não teria com quem conversar quando o pedido não é um comando conhecido. O dono do projeto quer que ela converse no celular sem depender do Claude Code.

## Objetivos
- Conversa livre no celular (Android pelo Chrome é o alvo principal; iPhone onde o navegador deixar), usando o Gemini com a cota grátis do Google.
- A Sexta-feira instalável no celular ("Adicionar à tela inicial") a partir de um endereço `https://`.
- No PC, o Gemini também vira uma opção de cérebro.

## Fora do escopo
- Sincronizar dados entre celular e PC (cada aparelho guarda os seus).
- IA rodando dentro do celular sem internet.
- Usar a conta do site/app do ChatGPT (sem caminho oficial; descartado). Codex no PC fica para outra vez.
- Recursos de computador no celular (abrir apps, Defender, WhatsApp automático, modo jogo).

## O que tornaria isso um fracasso, mesmo funcionando
- A chave do Gemini sair do aparelho para qualquer lugar que não seja o Google, ou ficar escrita no código/site público.
- Quando a cota grátis acabar, ela travar, dar erro técnico ou ficar muda — tem que avisar em português simples e continuar fazendo os comandos locais.
- Os comandos que já funcionam (timer, lista de compras, gastos, estudo…) passarem a ir para o Gemini em vez de serem resolvidos na hora.

## Abordagens consideradas
1. **Gemini com a cota grátis (escolhida).** Grátis dentro do limite diário do Google, funciona no celular e no PC, reaproveita a chave do AI Studio que o app já usa para a voz. Contra: precisa de internet; o Google muda o limite da cota com frequência.
2. Chave da API do Claude (já existe em `js/ia.js`). Melhor qualidade, mas paga por uso. Fica como reserva automática para quem tiver chave.
3. IA pequena dentro do celular (WebGPU). Offline e grátis, mas download de 0,5–1,5 GB, lenta, português fraco e não roda em muitos aparelhos. Descartada por agora.
- Descartadas também: ChatGPT pela conta do site (contra os termos, risco de perder a conta) e celular → Claude Code do PC de casa (PC sempre ligado e porta aberta para a internet).

## Como fica
**Parte 1 — cérebro Gemini**
- Novo módulo `js/ia-gemini.js` no mesmo formato de `js/ia.js` (`perguntar({ chave, modelo, sistema, historico })` → `{ texto, erro?, cota? }`), chamando a API do Gemini direto do navegador com a chave do usuário.
- Usa a mesma chave já guardada em Ajustes (`geminiChave`, "Chave do Google AI Studio"). Nenhuma chave nova.
- Mesmo prompt de sistema e mesmo histórico (últimas ~12 mensagens) que a conversa com o Claude já usa: português, até 3 frases curtas, sem markdown, personalidade, data/hora e a memória do usuário.
- Ordem quando o pedido não é comando local: Claude Code (só no PC, se instalado) → **Gemini** (se tiver chave) → API do Claude (se tiver chave) → resposta atual "essa eu ainda não sei".
- Ajustes → Cérebro ganha a opção "Gemini (cota grátis do Google)"; "Automático" segue a ordem acima.
- Cota acabou (erro 429) ou chave inválida: mensagem clara em português, pausa o Gemini por um tempo (como a voz já faz com `pausaMotor`) e cai para o próximo da lista.
- Modelo: um Flash de texto da cota grátis, com o Flash-Lite como reserva quando a cota do Flash acabar. Os nomes exatos dos modelos são conferidos na documentação do Google na hora de programar.

**Parte 2 — Sexta-feira no celular**
- Workflow do GitHub Actions que publica a pasta `assistente/` no GitHub Pages a cada push na branch, igual ao do instalador. Endereço: `https://reiscaiosantil-ai.github.io/teste/`.
- O app já é instalável (manifest + service worker); conferir instalação, microfone e tela estreita num celular simulado.
- **Ação do dono (uma vez):** no GitHub, Settings → Pages → Source: **GitHub Actions**.
- Aviso na primeira vez no celular: onde colar a chave do Gemini e como criar uma grátis no AI Studio.

## Decisões minhas (podem ser corrigidas)
- Reaproveitar a chave da voz em vez de pedir outra.
- Gemini antes da API do Claude no "Automático", por ser grátis.
- Testes: módulo novo testado no Node com `fetch` simulado (sucesso, cota, chave inválida, sem internet); teste de ponta a ponta no navegador com a resposta do Gemini simulada, já que daqui não dá para usar a chave real.

## Fica para quem for construir
- Formato exato da chamada e nomes dos modelos (conferir na documentação atual do Gemini).
- Texto das mensagens de erro e do aviso de primeira vez.
