# Lumi — assistente que mora no topo da tela

Assistente virtual em português inspirado no conceito de "assistente no entalho" (como o Kobi): um mascote fica numa pílula preta no alto da tela, mostra o que está acontecendo (timer, música, alarme, "ouvindo…") e, ao passar o mouse, abre um painel com conversa, tarefas, hábitos, timers, música, notas, visual e ajustes.

Nome, mascote, cores e textos são originais. O nome do assistente pode ser trocado em **Ajustes** (ou dizendo "seu nome agora é …").

## Como usar

**No navegador (mais simples):** abra `index.html` no Chrome ou no Edge. Para instalar como app e funcionar offline, sirva a pasta por http:

```bash
cd assistente
python3 -m http.server 8000
# abra http://localhost:8000 e use "Instalar app" no menu do navegador
```

**Como app de computador, no topo da tela (Electron):**

```bash
cd assistente
npm install
npm start            # abre o Lumi preso no topo da tela
npm run dist:win     # gera o instalador .exe e a versão portátil em dist/
```

Atalhos: `Alt+K` abre/fecha · `Alt+L` fala com ele · `Esc` fecha, cala ou para o alarme.

## O que ele faz

| Área | Exemplos de pedido |
|---|---|
| Timers e foco | "timer de 10 minutos para a pizza", "modo estudo" (25 min), "cronômetro", "cancela o timer" |
| Lembretes e alarmes | "me lembra de ligar pro cliente em 30 minutos", "me lembra de pagar a conta amanhã às 9", "alarme às 7h" |
| Tarefas | "cria uma tarefa comprar pão amanhã às 10h", "minhas tarefas", "terminei a tarefa comprar pão" |
| Hábitos | "bebi um copo de água", "fiz exercício", lembrete de pausa a cada 50 min |
| Música | **no app instalado, vê a música que está tocando no aplicativo do Spotify** e controla (tocar/pausar, próxima, anterior); "o que está tocando?"; também toca arquivos de áudio do PC; "toca …" abre a busca no Spotify |
| Clima | "vai chover hoje?", "previsão para amanhã", "clima em Curitiba" |
| Dinheiro | "quanto está o dólar?", "cotação do euro", "e o bitcoin?" |
| Contas | "quanto é 15% de 230", "quanto é a raiz de 81", "calcula (2 + 3) vezes 4" |
| Tradução | "traduz para inglês bom dia", "como se diz obrigado em espanhol" |
| Notas e copiados | "anota que preciso comprar café", "gera uma senha de 20", "copia meu pix" |
| Diversão | "conta uma piada", "cara ou coroa", "joga um dado", "quantos dias faltam pro Natal?" |
| Navegação | "pesquisa receita de bolo", "abre o youtube", "notícias de hoje" |
| Visual | "coloca a coroa", "muda sua cor para rosa", "tira o chapéu" |

Também tem: 13 expressões do mascote (dorme quando você some, acorda quando volta, olhos seguem o mouse), 9 cores de corpo, 7 de olhos, 5 estilos de olho, 12 acessórios, 5 personalidades, XP e níveis, voz de robozinho ajustável, "modo só executar" e "sempre ouvindo — Ei, Lumi".

## Voz

- **Falar com ele:** usa o reconhecimento de voz do navegador (Chrome/Edge, precisa de internet). O botão do microfone ouve uma frase; "sempre ouvindo" espera "Ei, Lumi" enquanto a janela estiver aberta.
- **Ele falar:** por padrão usa as vozes do computador (funciona offline; velocidade e tom ficam em Ajustes). Em **Ajustes → Tipo de voz → Google AI Studio (Gemini)** dá para usar uma das vozes femininas do Gemini (Leda, Kore, Aoede, Zephyr, Despina, Sulafat…), bem mais naturais. Precisa de internet e de uma chave grátis criada em aistudio.google.com ("Get API key"); a chave fica só no navegador e o uso conta na cota da sua conta Google. O jeito de falar acompanha a personalidade escolhida. Se a voz do Google falhar (chave errada, limite de uso, sem internet), ele avisa e usa a voz do computador.
- No app Electron, a resposta em voz funciona, mas o **reconhecimento de voz do Chromium não funciona dentro do Electron**; lá use texto ou o Lumi no Chrome/Edge. Reconhecimento offline (ex.: Vosk) é um próximo passo possível.

## IA para conversar (opcional)

Sem IA, ele entende os comandos acima localmente. Com uma chave da API do Claude em **Ajustes**, pedidos que ele não entende vão para o modelo escolhido (padrão `claude-opus-5-5`, com fallback automático do servidor se o modelo recusar). A chave fica só no `localStorage` do navegador e a página fala direto com a API da Anthropic; o uso é cobrado na conta da chave. Use apenas no seu próprio computador.

## Serviços externos (gratuitos, sem chave)

Open-Meteo (clima), Google AI Studio (voz Gemini, opcional, com sua chave), AwesomeAPI → ExchangeRate-API / CoinGecko como reserva (cotações), MyMemory (tradução), jsDelivr (SDK da Anthropic, só se a IA estiver ligada). Todos têm limite de uso por IP; quando falham, o Lumi avisa em vez de inventar.

## Limites honestos

- Pedidos que mexem no sistema ("organiza minha área de trabalho", "desliga o PC", "procura o arquivo …", "cria uma pasta") são recusados com explicação: exigiriam permissões de sistema que esta versão não tem.
- Timers, lembretes e alarmes só tocam com a janela/aba aberta (o app Electron fica sempre aberto). Notificações do sistema precisam de permissão.
- Spotify do computador (só no app instalado): no Windows o Lumi lê o título da janela do Spotify e usa as teclas de mídia; no Mac usa o AppleScript. Não precisa de login. Limites: com o Spotify minimizado na bandeja do sistema o título some e o Lumi o vê como fechado; as teclas de mídia vão para o último app que tocou mídia; "toca …" abre a busca no Spotify, mas não escolhe a música sozinho. No navegador o Lumi não enxerga o Spotify.
- Arquivos de música adicionados no Lumi valem só para a sessão (não ficam salvos).
- O app Electron (`desktop/`) foi escrito para Windows e macOS, mas não foi testado num desktop real neste ambiente. No Linux, a janela transparente pode não repassar cliques fora do entalho.

## Testes

```bash
cd assistente
node --test tests/*.test.js
```

Cobrem o entendimento de frases (timers, lembretes com horário, tarefas, contas, música, clima, personalização…) e a geração de todas as combinações do mascote.
