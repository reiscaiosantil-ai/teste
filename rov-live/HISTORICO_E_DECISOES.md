# Histórico e decisões da conversa

Esta é uma consolidação cronológica, não uma transcrição literal completa.
Os pedidos destacados entre aspas são falas acessíveis do usuário. A fase anterior
à retomada está documentada integralmente no contexto histórico original incluído.

## 1. Produto inicial e retomada da 0.2

O usuário começou esta etapa pedindo: “Leia LEIA_PRIMEIRO_CONTEXTO.md dentro do ZIP.
Este é o projeto ROV Live da Underwater. Confira o estado da atualização 0.2 e
me explique brevemente onde paramos antes de continuar.” Depois autorizou:
“pode continuar por mim?”.

A versão 0.1 já abria no Windows. A 0.2 era inicialmente um checkpoint pausado,
com dehaze clássico reforçado e otimização SIMD ainda sem validação final.
Após a retomada foram concluídas verificações e entregue a 0.2 clássica.
O usuário perguntou sobre substituir arquivos da pasta 0.1. Atualização deveria
preservar uma instalação funcional, sem pedir reinstalações desnecessárias.

O objetivo foi reforçado: “o nosso desejo é fazer uma a IA analisar fazer essas
alterações, parecido como o DLSS5 funciona em alguns jogos”. A inspiração não
significava que a implementação já usava aprendizado ou tecnologia DLSS.

O usuário informou: “neste computador é integrada, porém nos computadores em
que queremos fazer os testes a placa é de 8gb de ram (o modelo não vou saber te
informar precisamente”. A interpretação técnica adotada foi GPU com 8 GB de
VRAM nos futuros testes, com fabricante e modelo desconhecidos.

Expressou urgência e inspiração em Orphiecam: queria avançar rapidamente e que
o sistema de visualização fosse melhor. Pediu: “procure um ou se for mais
inteligente, CRIE um especifico para isso”. Não tratar esse desejo competitivo
como prova de desempenho alcançado.

## 2. Da correção clássica à IA real

O usuário perguntou o que o ZIP fazia e insistiu: “eu quero que vc ja crie a IA
que irá fazer essa tarefa do video. eu quero que VOCÊ DESENVOLVA ISSO e me
entregue essa IA que irá fazer toda esse processo”.

Foram avaliadas redes pré-treinadas, não treinado um modelo novo:

### FUnIE-GAN — ensaio rejeitado

- Repositório `xahidbuffon/FUnIE-GAN`, commit registrado
  `8f934c834c94e007b00866186b9ee624dc2b7b69`.
- Pesos generator de aproximadamente 28 MB; export ONNX comparado com PyTorch,
  diferença máxima relatada ~9,53e-6; inferência CPU ~60 ms em 256 quadrado
  num ensaio histórico, não no PC do usuário.
- Melhorou um exemplo público de peixes, mas na cena da mina gerou forte
  vermelho/magenta e deformou sobreposições. **Não foi adotado no app.**
- A pasta LAB da pesquisa não era um produto funcional entregue.

### WaterNet — modelo adotado

- Réplica de terceiros `tnwei/waternet`, commit registrado
  `2091896881fe0dfa5fb96007f29021a6067259cb`.
- Pesos originais de cerca de 4,37 MB. Export opset 17; diferença ONNX/PyTorch
  máxima relatada ~5,96e-7 para o export detalhado.
- Substituir diretamente a imagem pelo resultado reduzido deixava a cena
  borrada e às vezes azul/roxa. Foi criado um wrapper para transferir correção
  suave/limitada ao original e preservar seus detalhes.
- Primeiro houve prova experimental CLI para imagens; depois a integração
  completa em vídeo na 0.3, conforme a necessidade do usuário.
- Não houve treinamento proprietário. Código MIT do upstream foi incluído.

## 3. Entrega 0.3

App PySide6 com WaterNet ONNX, qualidade rápida/detalhada, seleção automática
DirectML/CPU e índice de adaptador. Captura em processo e inferência em worker,
com original comparável e exportação MP4 sem áudio em QProcess.

Foram relatados 21 testes. Exemplo histórico de exportação: 90 quadros de
3 segundos em ~12,3 s de CPU; não era processamento em tempo real.

## 4. Regressão clássica e 0.3.1

O usuário mostrou uma webcam de sala com paredes muito vermelhas, ruído e
configuração clássica agressiva. Disse que água turva estava estranha nos testes.
O print tinha Clássico, perfil que não refletia os controles manuais,
intensidade 95%, exposição -0,9, cor 85%, contraste 3 e névoa 100%.

Correções clássicas: limites mais conservadores de ganho, contraste e
transmissão; reconstrução só de luminância, preservando crominância; perfil
Personalizado para ajustes manuais. 23 testes relatados.

O usuário esclareceu: “mas ficou bemnmm melhor em relação a agua turva no video”,
e depois respondeu **“IA”** ao identificar qual tratamento havia melhorado.
Essa distinção importa: não desfazer a IA aprovada para corrigir um artefato
que era do modo clássico da webcam.

## 5. Acabamento 0.3.2 e distribuição offline

Pedido: “se conseguir cada vez mais aumentar a nitidez e reduzir a ‘poeira’ na
imagem tratada pela IA vai ser perfeito. no momento ja está incrivelmente prestatvo”.

Foram acrescentados bilateral e nitidez limitada após a rede; defaults da GUI
ruído 30%, nitidez 15%. Não houve treino novo. 27 testes relatados.
Exemplo histórico: exportação de 90 quadros em ~12,1 s de CPU.

O usuário perguntou se bastava abrir o arquivo em outro PC e explicou:
“precisava que fosse um executavel pq o computador que usamos no simulador
não utiliza internet e nesse momento a gente iria passar tudo no pendrive”.

Foi montado portátil Windows x64 (~208,2 MB ZIP, ~516,9 MB extraído), contendo:
Python 3.12.10 embutido, numpy 2.2.4, OpenCV headless 4.11.0.86,
ONNX Runtime DirectML 1.23.0, PySide6 Essentials/shiboken 6.8.3 e dependências,
dois modelos, plugins Qt e launcher Go. Um VC_redist.x64.exe offline foi
incluído como suporte, sem execução automática. Os fontes não precisam de
todas essas dependências vendorizadas para desenvolvimento.

O usuário perguntou se todas as funções funcionariam. Foi esclarecido que as
funções estavam incluídas, mas não havia teste real do portátil no Windows,
GPU/capturadora não estavam verificadas e a exportação não mantinha áudio.

## 6. Lentidão com IA e intensidade zero

O usuário relatou travamento ao ativar a IA, apesar de CPU/GPU abaixo de 40%.
Primeiro status enviado: 5,1 FPS, filtro 206 ms, idade 235 ms e 78.030 pulados.
Depois: 6,9 FPS, filtro 152,5 ms, idade 187 ms e 26.901 pulados.
Contadores são acumulados e não medem taxa de perda sem janela de tempo.

O usuário disse: “é que a rapida não ficou tão utilizavel quanto eu preciso”.
Assim, análise detalhada foi tratada como requisito de qualidade.
Outro print confirmou 256 × 144, Automático, índice 0, ruído 30%, nitidez 15%.
O provider real não chegou a ser confirmado por esse print.

O usuário atribuiu o travamento à intensidade e mostrou 30,1 FPS / 0,6 ms
em intensidade zero. Conferência do código mostrou bypass total em zero;
qualquer intensidade positiva ativa o tratamento. Não é a multiplicação
do slider que explica o custo da rede.

Foi sugerida a comparação CPU/Automático, mas não há um resultado controlado
documentado dessa comparação no PC de destino. Evitar concluir qual é melhor.

## 7. Problema do primeiro executável

Ao clicar no EXE, aparecia somente um processo ROV_Live_IA de ~1,7 MB, sem GUI.
Log enviado `20261028_155106.160200.log`: apenas cabeçalho de início, sem traceback.

Foi solicitado abrir `runtime\python.exe -u app\app.py`. A primeira tentativa
foi em C:\Windows\System32 e falhou por caminho inexistente. O usuário foi
orientado a abrir CMD pela barra de endereço da pasta do portátil.
Respondeu: **“abriu o app”**. Depois reafirmou que o CMD funcionava e o EXE não.

Foi compilado novo launcher que usa o CMD funcional com console visível.
Não houve confirmação explícita de abertura pelo novo EXE. Não afirmar que
os prints posteriores comprovam isso, pois podem ter vindo do CMD.

## 8. Piscar / tela preta e correção 0.3.2a

O usuário mostrou “SEM QUADRO RECENTE / Confira o sinal e reconecte”.
Diagnóstico no código: timeout de .75 s usava o timestamp do quadro tratado,
não a saúde independente da captura. IA lenta podia apagar os dois painéis.

Patch: `capture_health`, manutenção do último par com aviso quando o atraso
é de processamento, remoção da imagem quando captura realmente cessa,
carregamento inicial da IA não encerrando captura ativa por engano.
31 testes relatados. Patch não pretendia acelerar a inferência.

## 9. Arquitetura fluida 0.3.3

Pedido: “pode tentar melhorar a IA e evitar esse gargalo, e no caso melhorando
a IA eu quero que se aproxime ao maximo daquele video e ter uma visão nitida do
ambiente submarino”.

Implementado worker neural separado, mailbox latest-only, correção com guia
de movimento/confiança, validade limitada e identificação de fallback.
Modelo detalhado mantido. Acrescentado controle opcional de pontos claros.
45 testes relatados, incluindo três do atualizador.

Um ensaio Linux/CPU com recorte ampliado a 540p mostrou ~1,5 FPS por quadro
versus ~30 FPS de vídeo no modo fluido. **Isso não significou 30 inferências/s**,
nem garantia de Windows. Foram dados históricos de outro trecho/ambiente.

## 10. Novo vídeo real e 0.3.4

O usuário mostrou água turva/estruturas e perguntou: “seria possivel usar nossa
IA para reconstruir a imagem e assim melhorar a visualização”. O status
mostrava 4,9 FPS, aplicação 248,1 ms, IA 5,7 análises/s e 79 ms, correção 221 ms.
Era evidência de custo grande fora da inferência.

Foi pedido vídeo original e o usuário anexou **1029.mp4**:
1920 × 1080, 30 FPS, 8.872 quadros, 234.628.760 bytes, ~4min56s.
Mostra estruturas submersas, mudança de orientação, regiões turvas e muitos
pontos/debris em outros trechos; tem depth/temp/timestamp do FIFISH.

Implementada restauração temporal tradicional combinada à WaterNet, trabalho
limitado, transferência da diferença ao Full HD, contraste de luminância e
limite de crominância adicionada. Ajuste padrão da GUI: restauração 35%.

Foi feita amostra offline de 6 s: 0–2, 150–152 e 240–242 s, com restauração 50%,
180 quadros, original à esquerda e tratado à direita. Não é benchmark ao vivo.
O arquivo completo não foi exportado tratado. A melhoria observada foi
principalmente contraste e controle de cor; partículas maiores persistem.

59 testes relatados: 56 app + 3 atualizador. Teste sintético de ruído plano:
MSE 9,31→5,52 (~40,7% menor), que não comprova essa recuperação em água real.
Ensaio final de vídeo Full HD em CPU: ~17,8 FPS; 60 quadros com neural e 48
somente temporal entre 108 medidos. Dados completos preservados em JSON.

## 11. Último estado aprovado e pedido de transferência

O usuário mostrou a comparação da estrutura/cabo e disse: **“ta muito melhor”**.
Último status: 6,5 FPS, aplicação 116,4 ms, IA 7,1 análises/s / 77 ms,
idade da correção 153 ms, correção aplicada. A qualidade foi aprovada; a
fluidez continua aberta. O número da versão não aparece no recorte, portanto
confirmar a versão instalada antes de atribuir todo resultado à 0.3.4.

Pedido atual: **“agora querendo programar mais a fundo essa ia, pode exportar
todo o contexto dessa conversa para eu jogar no codex e melhorar a IA”**.

Esta entrega é a transferência de contexto/código; não introduz um novo
algoritmo ou muda a imagem aprovada. O desenvolvimento seguinte deve partir
da baseline recuperada e verificar o estado real do PC do usuário.
