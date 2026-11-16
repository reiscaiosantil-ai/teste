# Lumi — a assistente que mora no topo da tela

Assistente virtual em português inspirado no conceito de "assistente no entalho" (como o Kobi): um mascote fica numa pílula preta no alto da tela, mostra o que está acontecendo (timer, música, alarme, "ouvindo…") e, ao passar o mouse, abre um painel com conversa, tarefas, hábitos, timers, música, notas, visual e ajustes.

Nome, mascote, cores e textos são originais. A Lumi fala no feminino. O nome da assistente pode ser trocado em **Ajustes** (ou dizendo "seu nome agora é …").

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
npm start            # abre a Lumi preso no topo da tela
npm run dist:win     # gera o instalador .exe e a versão portátil em dist/
```

Atalhos: `Alt+K` abre/fecha · `Alt+L` fala com ela · `Esc` fecha, cala ou para o alarme.

## O que ela faz

| Área | Exemplos de pedido |
|---|---|
| Timers e foco | "timer de 10 minutos para a pizza", "modo estudo" (25 min), "cronômetro", "cancela o timer" |
| Lembretes e alarmes | "me lembra de ligar pro cliente em 30 minutos", "me lembra de pagar a conta amanhã às 9", "alarme às 7h" |
| Tarefas | "cria uma tarefa comprar pão amanhã às 10h", "minhas tarefas", "terminei a tarefa comprar pão" |
| Hábitos | "bebi um copo de água", "fiz exercício", lembrete de pausa a cada 50 min |
| Música | **no app instalado, vê a música que está tocando no aplicativo do Spotify, com a capa do álbum,** e controla (tocar/pausar, próxima, anterior); "o que está tocando?"; também toca arquivos de áudio do PC; "toca …" abre a busca no Spotify |
| Clima | "vai chover hoje?", "previsão para amanhã", "clima em Curitiba" |
| Dinheiro | "quanto está o dólar?", "cotação do euro", "e o bitcoin?" |
| Contas | "quanto é 15% de 230", "quanto é a raiz de 81", "calcula (2 + 3) vezes 4" |
| Tradução | "traduz para inglês bom dia", "como se diz obrigado em espanhol" |
| Notas e copiados | "anota que preciso comprar café", "gera uma senha de 20", "copia meu pix" |
| Diversão | "conta uma piada", "cara ou coroa", "joga um dado", "quantos dias faltam pro Natal?" |
| Navegação | "pesquisa receita de bolo", "abre o youtube", "notícias de hoje" |
| Visual | "coloca a coroa", "muda sua cor para rosa", "tira o chapéu" |
| Computador (app instalado, Windows) | "o que está gastando tanta memória?", "verifica se tem vírus", "verifica a pasta Downloads", "abre o Word", "fecha o Chrome", "abre a conversa com o Bernardo", "sai da ligação", "bloqueia a tela", "desliga o computador" (pede a senha), "cancela o desligamento" |

Personalização feminina: cílios, blush e batom (liga e desliga), 12 cores de corpo (incluindo Rosé, Lilás e Framboesa), 9 cores de olho, acessórios como tiara, coroa de flores, brincos, presilha de coração e lação, cabelo (franjinha, franja de lado, longo, chanel, rabo de cavalo, maria-chiquinha, coque e cacheado, em 8 cores) e 8 looks prontos (Princesa, Primavera, Romântica, Anjinha, Estilosa, Docinho, Sexta-feira, Natalina). Pela voz: "coloca a tiara", "passa batom", "muda sua cor para rosé", "faz um coque", "cabelo ruivo", "solta o cabelo".

Também tem: 13 expressões do mascote (dorme quando você some, acorda quando volta, olhos seguem o mouse), 9 cores de corpo, 7 de olhos, 5 estilos de olho, 12 acessórios, 5 personalidades, XP e níveis, voz de robozinho ajustável, "modo só executar" e "sempre ouvindo — Ei, Lumi".

## Computador (app instalado, Windows)

Aba **🛡️ Sistema** e pedidos por voz. Tudo roda pelo PowerShell do próprio Windows; o que você fala nunca vira comando: vai como dado (variável de ambiente).

- **Memória RAM:** quanto está em uso e quais programas mais gastam (memória e processador), com botão **Fechar** (pede para o programa fechar, e ele pode perguntar se quer salvar) e, se não fechar, **Forçar**. Partes do Windows (Explorer, serviços, antivírus) e a própria assistente nunca são fechadas.
- **Antivírus:** usa o **Microsoft Defender**, que já vem no Windows: mostra se está ligado, a proteção em tempo real, a idade das definições de vírus, as últimas verificações, ameaças encontradas, firewall e espaço no disco. Botões para verificação rápida, da pasta Downloads ou completa, atualizar as definições e abrir a Segurança do Windows. Ela avisa (com voz e notificação) quando a verificação termina. Se outro antivírus estiver instalado, o Defender fica em modo passivo e ela diz isso.
- **Apps:** "abre …" procura o app no menu Iniciar (WhatsApp e Spotify abrem o app instalado; se não tiver, o site). "fecha …" aceita o nome do app, um apelido ("navegador") ou parte do título da janela.
- **Conversas:** "abre a conversa com …" abre o WhatsApp do computador e procura o contato (confira se é a conversa certa); com um número de telefone, abre direto. Nada é enviado sozinho.
- **Ligações:** "sai da ligação" fecha a aba do Google Meet (precisa ser a aba aberta no navegador), usa Alt+Q no Zoom e Ctrl+Shift+H no Teams.
- **Desligar e reiniciar:** sempre pedem a senha (padrão **Sabado**, sem diferença de acento ou maiúscula; dá para trocar na aba Sistema). Ela pergunta "Tem certeza? Para confirmar, diga a senha" e já fica ouvindo a resposta. O Windows desliga em 30 segundos (ou no tempo pedido: "desliga o PC em 30 minutos"); "cancela o desligamento" desfaz. A senha não aparece na conversa, e depois de 5 erros ela para de aceitar por 10 minutos.
- **Onde ela fica:** segure o botão esquerdo num espaço vazio do painel: ela vira uma gotinha preta que se mexe e vai com o mouse. Solte num canto, num lado, embaixo ou em outra tela; a posição fica salva. Em Ajustes também dá para escolher a posição e a tela.

Testado no app Electron real no Linux (memória, fechar programa, senha certa e errada, aprendizado, arrastar e posição). As partes só de Windows (Defender, abrir pelo menu Iniciar, WhatsApp, ligações, desligar) foram escritas e testadas na lógica, mas não num Windows real: o atalho de busca do WhatsApp e os atalhos de ligação podem mudar com novas versões desses apps.

## Jogos, Discord e diversão (app instalado)

| Pedido | O que ela faz |
|---|---|
| "modo jogo" / "modo normal" | Põe o Windows em alto desempenho, silencia as notificações do Windows e oferece fechar o que pesa (navegador, Teams, Office…; Discord, Spotify e OBS ficam). "Modo normal" desfaz. Enquanto isso, os lembretes de pausa não interrompem. |
| "clipa isso" / "tira um print" | Aperta o atalho do gravador escolhido em Ajustes: Xbox Game Bar (Win+Alt+G, precisa de "Gravar o que aconteceu" ligado), NVIDIA (Alt+F10) ou AMD (Ctrl+Shift+S). |
| "qual meu ping?" / "como tá o PC?" | Processador, memória, placa de vídeo NVIDIA (temperatura e uso, pelo nvidia-smi) e ping. |
| "abre o Valorant" / "quais jogos eu tenho?" | Acha os jogos instalados na Steam, na Epic e na Riot (Valorant, LoL) e abre pelo launcher. Apelidos: "lol", "cs", "gta", "valo". |
| "muta" / "ensurdece" (Discord) | Aperta os atalhos de mutar e ensurdecer do Discord. Cadastre os mesmos atalhos em Discord → Configurações → Atalhos de teclado para valerem com o jogo aberto. Fora do modo jogo, "muta" sozinho continua sendo o som da música. |
| "sorteia dois times com Caio, Bernardo, João e Pedro" | Times aleatórios (até 6). "sorteia 3 times" usa os últimos nomes. |
| "escolhe um mapa do Valorant" / "…do CS" / "…do Rainbow" · "escolhe um jogo pra gente jogar" · "quem paga o lanche entre …" · "escolhe entre pizza, hambúrguer e açaí" | Sorteios. |
| "comenta essa" · "provoca o Bernardo" · "faz um quiz" | Narração empolgada, provocação leve e quiz de conhecimentos e games (responde pela voz; "não sei" mostra a resposta). |
| "ganhei" / "perdi" · "como tá meu placar?" · "zera o placar" | Placar do dia. Depois de 3 derrotas seguidas ela sugere uma pausa (controle de tilt). |
| "tem jogo de graça na Epic?" · "quanto tá o Elden Ring na Steam?" | Jogos grátis da semana e os próximos (loja da Epic) e preço em reais com desconto (loja da Steam). |

**A voz dela na call do Discord:** com o VB-Cable (grátis), em Ajustes → Jogos e Discord escolha "CABLE Input" em "Também falar em". No Windows, nas propriedades do seu microfone, marque "Escutar este dispositivo" com saída "CABLE Input"; no Discord, use "CABLE Output" como entrada. Assim os amigos ouvem você e ela. Funciona com as vozes Piper e Google (a voz do computador não dá para redirecionar). Dá para deixar só no modo jogo ou sempre.

Ela nunca mexe dentro dos jogos (memória, mira, automação), para não esbarrar em anti-cheat. Em jogos em tela cheia exclusiva o painel dela não aparece por cima; a voz funciona igual, e em "janela sem bordas" ela aparece.

## Rotinas, resumo da manhã, memória e hora de dormir

- **Rotinas:** em Ajustes, dê um nome e escreva um pedido por linha ("abre o whatsapp", "timer de 25 minutos para foco"…). Dizer o nome ("modo trabalho", "rotina estudo") faz tudo de uma vez.
- **Resumo da manhã:** na primeira vez que você usa o PC no dia (entre 5h e 14h), ela dá bom dia com a data, o clima, os compromissos de hoje, o dólar e a manchete principal (Google Notícias). Também a qualquer hora: "resumo do dia". Dá para desligar em Ajustes.
- **Memória:** "lembra que o Bernardo é meu sócio" fica guardado e vai junto para o cérebro (Claude Code ou API) em toda conversa. "o que você sabe sobre mim", "esquece que …" e a lista em Ajustes.
- **Hora de dormir:** "minha hora de dormir é 1h" (ou em Ajustes). Ela avisa na hora e cobra a cada 20 minutos; "só mais uma" adia 30 minutos.

Testado no app Electron real no Linux: sorteios, quiz, placar com aviso de tilt, Epic e Steam ao vivo, memória, rotina, hora de dormir, resumo e o modo jogo (só a parte que não depende do Windows). Os atalhos (clipe, Discord), o modo de energia e as notificações, a leitura das bibliotecas da Steam/Epic/Riot num PC real e a voz na call não puderam ser testados aqui.

## Aprender com as correções

Se ela entender errado, diga **"não, eu quis dizer …"** (ou "errou" e depois o certo). Ela guarda a correção e, quando ouvir aquilo de novo, responde **"O senhor quis dizer …"** e faz o certo; se ouvir algo só parecido, pergunta antes ("O senhor quis dizer …?"). "Esquece isso" apaga a última correção; a lista fica em **Ajustes → O que eu aprendi**. O tratamento (o senhor, a senhora ou você) também fica em Ajustes.

## Voz

- **Voz offline Piper (app instalado):** em Ajustes → Voz offline (Piper) dá para escolher uma voz Piper (`.onnx` + `.onnx.json`), que fala instantaneamente sem internet e sem placa de vídeo (~6 s de fala gerados em ~0,5 s). Ela pode ser a voz principal ou a reserva quando o Google não puder falar. Para uma voz própria, grave as 198 frases do **🎙 Estúdio de voz** e treine com o roteiro em [`treino/README.md`](treino/README.md) (Google Colab grátis, com placa de vídeo). O motor e o estúdio foram testados no app Electron; o treino no Colab não pôde ser executado aqui.
- **Entender melhor o que você fala (app instalado):** o Vosk só espera o chamado; a frase do pedido é reescutada pelo **Whisper** (OpenAI, licença MIT), que roda offline no PC pelo transformers.js + onnxruntime. Modelos: Base (80 MB, rápido), **Small (240 MB, padrão)** e Turbo (730 MB, máxima precisão, mais lento). O modelo é baixado uma vez, sozinho, na primeira abertura; enquanto isso o Vosk entende os pedidos. Em teste com voz sintética, o Small acertou 9 de 10 frases palavra por palavra (~1,3 s por frase num processador de 4 núcleos), contra frases bem mais truncadas do Vosk. Testado no app Electron real com áudio no lugar do microfone: "Ei, Sexta-feira, qual é a capital da Austrália?".
- **Falar com ela no app instalado:** reconhecimento **offline** com o Vosk (modelo pequeno em português, ~31 MB, vai junto do instalador). Roda no computador: nada do que você fala sai do PC e não precisa de internet. Botão do microfone ou `Alt+L` ouvem um pedido; "sempre ouvindo" espera o chamado ("Ei, Sexta-feira, …"). Em **Ajustes → Voz** aparece "Última coisa que eu ouvi", para conferir o que ela entendeu. Funciona melhor quando o nome da assistente é uma palavra em português (ex.: Sexta-feira); nomes inventados podem não ser reconhecidos. O modelo pequeno às vezes erra palavras em inglês (ex.: "timer"); por isso "cinco minutos" sozinho já vira um timer. Testado no app Electron real (Linux, com áudio no lugar do microfone): "que horas são?", "Ei, Sexta-feira, conta uma piada" e o chamado sozinho.
- **Falar com ela no navegador:** reconhecimento de voz do Chrome/Edge (precisa de internet).
- **Ela falar:** por padrão usa as vozes do computador (funciona offline; velocidade e tom ficam em Ajustes). Em **Ajustes → Tipo de voz → Google AI Studio (Gemini)** dá para usar uma das vozes femininas do Gemini (Leda, Kore, Aoede, Zephyr, Despina, Sulafat…), bem mais naturais. Precisa de internet e de uma chave grátis criada em aistudio.google.com ("Get API key"); a chave fica só no navegador e o uso conta na cota da sua conta Google. O jeito de falar acompanha a personalidade escolhida. Quando a cota acaba, ela troca sozinha, sempre com a mesma voz: Gemini Flash TTS → Gemini Flash-Lite TTS (cota separada) → Google Cloud Text-to-Speech com as vozes **Chirp 3 HD** (as mesmas Leda, Kore…, com 1 milhão de caracteres grátis por mês; precisa da API "Cloud Text-to-Speech" ativada no projeto do Google Cloud, com faturamento ativado). Uma cota esgotada é pulada por 30 minutos. Só se tudo falhar ela avisa e usa a voz do computador. Em Ajustes aparece qual voz foi usada por último.
- Para montar o app localmente, baixe o modelo de voz antes: `npm run voz` (grava `voz/modelo-pt.tar.gz`).

## Cérebro para conversar (opcional)

Os comandos acima funcionam sempre, sem cérebro. Para o resto (perguntas, pesquisas, textos, procurar arquivos), escolha em **Ajustes → Cérebro**:

- **Claude Code (assinatura de quem usa)** — só no app instalado. Usa o Claude Code do computador, logado com a conta do Claude de quem está usando, sem pagar API (conta nos limites do plano dessa pessoa). Em **Ajustes → Cérebro** dá para **instalar o Claude Code** (abre o instalador oficial `irm https://claude.ai/install.ps1 | iex` numa janela do PowerShell), **entrar com a conta do Claude** ou **com o Console**, **trocar de conta** e **sair**, e ver com qual conta está conectado (`claude auth status`). Para usar no computador de outra pessoa, ela entra com a conta dela: a opção **Conta separada só da assistente** guarda esse login à parte (`CLAUDE_CONFIG_DIR` próprio), sem mexer no Claude Code que já estiver logado no PC. Também aceita uma **chave de API do Console** (`ANTHROPIC_API_KEY`, cobrada no Console de quem criou). Não compartilhe a sua assinatura com outras pessoas. Mesmo esquema do Jarvis: `claude -p` com resposta em JSON e `--resume` para continuar a conversa; o pedido vai pela entrada padrão, nunca pela linha de comando. Ferramentas liberadas: ler arquivos (Área de Trabalho, Documentos, Downloads), pesquisar na web e escrever notas em `Documentos/Lumi/cerebro/Notas`. Ela não apaga, move nem altera seus arquivos. Cada resposta leva alguns segundos (cerca de 8 s no teste). Modelo padrão: Sonnet.
- **API do Claude (chave)** — funciona também no navegador; cobrada à parte na conta do Console (padrão `claude-opus-5-5`, com fallback automático do servidor se o modelo recusar). A chave fica só no armazenamento local.
- **Automático** (padrão) — usa o Claude Code se estiver instalado; senão a API, se houver chave; senão só os comandos.

## Serviços externos (gratuitos, sem chave)

Open-Meteo (clima), Google AI Studio (voz Gemini, opcional, com sua chave), AwesomeAPI → ExchangeRate-API / CoinGecko como reserva (cotações), MyMemory (tradução), jsDelivr (SDK da Anthropic, só se a IA estiver ligada). Todos têm limite de uso por IP; quando falham, a Lumi avisa em vez de inventar.

## Limites honestos

- Pedidos como "organiza minha área de trabalho", "procura o arquivo …" e "cria uma pasta" vão para o Claude Code (se conectado), que só lê arquivos e escreve notas; sem ele, são recusados com explicação.
- Timers, lembretes e alarmes só tocam com a janela/aba aberta (o app Electron fica sempre aberto). Notificações do sistema precisam de permissão.
- Spotify do computador (só no app instalado): no Windows a Lumi lê o título da janela do Spotify e usa as teclas de mídia; no Mac usa o AppleScript. Não precisa de login. A capa do álbum vem do próprio Spotify no Mac; no Windows é buscada pelo nome da música e do artista no Deezer e, se não achar, na Apple (iTunes) — grátis e sem chave; sem resultado confiável, fica o ícone. Arquivos MP3 adicionados mostram a capa gravada no arquivo. Limites: com o Spotify minimizado na bandeja do sistema o título some e a Lumi o vê como fechado; as teclas de mídia vão para o último app que tocou mídia; "toca …" abre a busca no Spotify, mas não escolhe a música sozinho. No navegador a Lumi não enxerga o Spotify.
- Arquivos de música adicionados na Lumi valem só para a sessão (não ficam salvos).
- O app Electron (`desktop/`) foi escrito para Windows e macOS, mas não foi testado num desktop real neste ambiente. No Linux, a janela transparente pode não repassar cliques fora do entalho.

## Testes

```bash
cd assistente
node --test tests/*.test.js
```

Cobrem o entendimento de frases (timers, lembretes com horário, tarefas, contas, música, clima, personalização…) e a geração de todas as combinações do mascote.
