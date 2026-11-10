# ROV Live IA 0.3.5: captura Elgato, fluidez, partículas e nitidez

Versão experimental desenvolvida a partir da baseline 0.3.4 recuperada em
`projeto/`. Tudo funciona offline e não há dependências novas. O portátil
existente (Python 3.12 + runtime) continua valendo e só os módulos mudam.

## 1. Captura da Elgato

**Causa provável do “Não foi possível abrir a fonte”.** O código anterior fazia
uma única tentativa (`VideoCapture(índice, backend)`) e, se falhasse, mostrava
uma mensagem genérica. Não havia nome de dispositivo, nem outro backend, nem
outro formato, e nenhuma razão era informada. Sem a placa física não dá para
apontar uma causa única. As candidatas mais comuns, todas agora detectadas ou
contornadas, são:

- **Índice errado.** A webcam ou uma câmera virtual (OBS, Camera Hub) ocupa o
  índice 0, e a numeração do DirectShow e do Media Foundation pode ser diferente.
- **Placa ocupada.** 4K Capture Utility, Camera Hub, OBS, Teams ou outro programa
  com a placa aberta. A Elgato costuma aceitar um cliente por vez.
- **Privacidade do Windows.** “Permitir que aplicativos da área de trabalho
  acessem a câmera” desligado. O Windows trata a Elgato como câmera.
- **Driver.** Modelos PCIe e alguns antigos (HD60 Pro, 4K60 Pro, HD60 original)
  precisam do driver da Elgato. Sem ele, a placa não aparece como dispositivo
  de vídeo.
- **Formato.** 960 × 540 (o padrão da GUI) raramente é um modo nativo de
  captura. Saídas HDR/10 bits podem não converter para BGR.

**O que mudou.**

- `capture_devices.py` (novo) lista os dispositivos **pelo nome**, via COM com
  ctypes, na mesma ordem do índice do OpenCV, separadamente para DirectShow e
  Media Foundation. Também une as duas listas pelo caminho do dispositivo. A
  listagem roda em processo isolado: um driver travado não congela o app.
- Na GUI, o campo “Dispositivo” mostra os nomes e seleciona automaticamente a
  placa de captura Elgato. A Elgato Virtual Camera e a Facecam não são escolhidas
  no lugar da placa. O “Índice manual” continua disponível.
- Abertura com tentativas em cadeia, cada uma registrada:
  1. backend escolhido com o formato pedido;
  2. o mesmo backend em formato nativo;
  3. DirectShow com YUY2;
  4. o outro backend, usando o índice correto **daquele** backend.

  960 × 540 é pedido ao driver como 1080p e reduzido no app. O tempo para o
  primeiro quadro passou a 6 s por tentativa, e a GUI aguarda até 45 s enquanto
  há tentativas em curso.
- Uma falha agora explica cada tentativa (“DirectShow 1: não abriu; Media
  Foundation 0: abriu, sem quadros em 6 s”) e acrescenta dicas locais:
  privacidade bloqueada, programas que ocupam a placa, sinal HDMI e HDCP.
- Depois de aberta, o status mostra o dispositivo, o backend, o índice, a
  resolução e o FourCC reais. Avisos aparecem durante o vídeo em dois casos:
  **quadros pretos** (sem HDMI, HDCP ou resolução da fonte não suportada) e
  **imagem congelada**. Isso fecha o gap 12 da 0.3.4.
- O botão **Diagnóstico** e o `DIAGNOSTICO_CAPTURA.cmd` geram um relatório em
  `logs/` com:
  - sistema e backends do OpenCV;
  - dispositivos com os índices em cada backend;
  - entradas do Gerenciador de Dispositivos (câmera, mídia, VID 0FD9 da Elgato)
    com o código de erro do driver traduzido;
  - privacidade e programas em conflito;
  - teste isolado de abertura e leitura em cada backend e formato (FPS medido,
    FourCC, preto ou congelado).
- O log de cada sessão (todas as tentativas e avisos) é gravado em
  `logs/rov_live_AAAAMMDD.log`.
- `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS=0` é definido antes do OpenCV.
  Isso evita aberturas lentas ou falhas do Media Foundation com placas de captura.

## 2. Fluidez da IA (qualidade aprovada preservada)

A baseline foi reproduzida aqui, com processo de captura real e inferência
concorrendo pela CPU: **9,0 FPS / aplicação 109 ms em 1080p**, perfil
semelhante ao do print do usuário (6,5 FPS / 116 ms). O gargalo estava fora
da rede, como já se suspeitava.

| Estágio (640 × 360, isolado) | 0.3.4 | 0.3.5 | Como |
|---|---:|---:|---|
| Limite de crominância | 16,7 ms | 2,3 ms | OpenCV/SIMD em vez de reduções int16 do NumPy; diferença ≤2 níveis em <0,1% dos pixels |
| Fusão temporal | 17,4 ms | ~12 ms | Grades de coordenadas em cache, remap com mapa único, `inRange`/`magnitude` |
| Ampliação da diferença (1080p) | 5,8 ms | ~4 ms | Caminho uint8 com deslocamento quando a diferença cabe em ±127 (caso usual); diferença ≤1 |
| Transferência e acabamento | 4 + 5 ms | 3,6 + 5 ms | Mesmas técnicas |

- **Pipeline em dois estágios paralelos.** O estágio 1 faz a fusão temporal,
  o envio à IA e o detalhe de nitidez. O estágio 2 faz a transferência da
  correção, o acabamento e a ampliação. Entre os dois há uma única vaga,
  ocupada pelo trabalho mais recente, sem fila acumulando atraso. A
  publicação nunca volta para um quadro mais antigo.
- A GUI não copia mais cada quadro para a QImage nem cria uma cópia escalada a
  cada pintura.
- **GPU.** A lista mostra os adaptadores reais (DXGI, na mesma ordem do
  `device_id` do DirectML). O padrão “Automática” escolhe o de **maior memória
  dedicada**, ou seja, a placa de 8 GB em vez da integrada. O status mostra o
  nome da GPU usada. Se o DirectML falhar ao criar a sessão, o app cai para a
  CPU e avisa, em vez de ficar sem IA.
- A métrica nova “Latência no app” vai da leitura do quadro até a publicação.
  O tempo de cada estágio aparece no rodapé.

**Medidas.** CPU Xeon de 4 núcleos a 2,1 GHz, Linux, sem GPU, vídeo 1080p
derivado da amostra 0.3.4, IA Detalhada 256 × 144, controles padrão da GUI. Os
valores são o p50 de 20 s depois de 8 s de aquecimento. Os JSON estão em
`evidencias/validacao_0.3.5/`.

| Cenário | Resolução | 0.3.4 | 0.3.5 | Latência no app (p50) |
|---|---|---:|---:|---:|
| IA em CPU | 960 × 540 | 13,4 FPS | **26,2 FPS** | 79 ms |
| IA em CPU | 1920 × 1080 | 9,0 FPS | **14,9 FPS** | 143 ms |
| IA fora da CPU (emula DirectML, 77 ms) | 960 × 540 | 15,0 FPS | **29,0 FPS** (fonte de 30) | 54 ms |
| IA fora da CPU (emula DirectML, 77 ms) | 1920 × 1080 | 9,9 FPS | **17,1 FPS** | 122 ms |

Em todos os casos, 100% dos quadros saíram com correção neural aplicada (estado
`applied`). Ganho de FPS não veio de exibir o original. A GUI completa com IA
em CPU marcou 27,6 FPS em 960 × 540. A análise Detalhada foi mantida.

## 3. Partículas e nitidez, sem inventar detalhes

**Partículas.** Encontrei três problemas na 0.3.4:

1. O teste fotométrico de alinhamento rejeitava justamente as partículas
   visíveis.
2. Partículas grandes “puxavam” o fluxo óptico. O quadro anterior alinhado
   trazia a partícula junto, e ela parecia estável.
3. O peso de supressão em 35% era só 0,28, e a correção era ampliada borrada a
   partir de 480 × 270.

Na 0.3.5:

- A validade do alinhamento vem da vizinhança, e a referência das partículas
  usa o movimento da cena numa grade grossa.
- Uma partícula confirmada (pequena, compacta, ausente nos dois quadros
  anteriores alinhados, que concordam entre si) é **limitada em resolução
  cheia ao nível observado nesses quadros reais**, com peso min(1; 2,4 ×
  restauração) e no máximo 70 níveis.
- O teto nunca cria textura. Ele só impede que o ponto fique mais claro que o
  fundo já observado.
- Marcas paradas na tela enquanto a cena se move (HUD, profundidade, logo)
  ficam num mapa de proteção persistente. Uma versão intermediária danificava
  o texto “Depth:15.00m” e foi corrigida.

Ensaio sintético com referência conhecida (1080p, panorâmica, ruído e 40
partículas por quadro):

| Medida | 0.3.4 | 0.3.5 |
|---|---:|---:|
| Excesso de brilho que sobra nas partículas (restauração 35%) | 82% | **24%** |
| Excesso de brilho que sobra nas partículas (restauração 60%) | 69% | **14%** |
| Falsos positivos sem partículas (fração de pixels) | 5,7e-5 | 1,0e-5 |
| MSE fora das partículas | 6,93 | 6,97 |

Na amostra real (`comparacao_240s_particulas.png`), muitos pontos pequenos
somem ou ficam bem mais fracos. **Partículas grandes ou lentas, que aparecem
também nos quadros anteriores, permanecem.** Não há observação real limpa
para usar, e preencher esse espaço seria inventar conteúdo.

**Nitidez.** Na 0.3.4, o padrão de 15% limitava o realce a ±1,5 nível em
640 × 360, então o efeito real era quase nulo. Na 0.3.5:

- O realce é aplicado na **resolução de saída** e só na luminância.
- Variações do tamanho do ruído estimado no próprio quadro (MAD) não são
  realçadas.
- Cada pixel fica limitado ao mínimo e ao máximo da sua vizinhança 3 × 3:
  as bordas ficam mais íngremes, mas **sem halo, anel ou valor novo**.
- Testes: em uma borda, a faixa de valores fica exatamente igual e a
  inclinação aumenta; em ruído plano, o desvio fica igual (3,01 → 3,01).
- O controle “Nitidez IA” continua em 15% por padrão. Vale experimentar 30–50%.

O visual geral continua o aprovado. A diferença média para a 0.3.4 nos quadros
de 1 s e 150 s foi de 0,1 a 0,5 nível. Veja `comparacao_1s.png` e
`comparacao_150s.png`.

## 4. Como atualizar no pendrive (offline)

1. Feche o ROV Live.
2. Extraia `ROV_Live_Atualizacao_0.3.5.zip` e copie **todo** o conteúdo para a
   pasta que contém `app`, `runtime` e `ROV_Live_IA.exe`. Aceite substituir.
3. Execute `ATUALIZAR_PORTATIL.cmd`. O atualizador aceita 0.3.2 a 0.3.4, faz
   backup e desfaz tudo se algo falhar.
4. Abra com `INICIAR_PORTATIL.cmd`. Para a captura, use o botão Diagnóstico
   ou `DIAGNOSTICO_CAPTURA.cmd`.

## 5. Testes executados aqui e alcance

- 78 testes passam: os 56 herdados (um ajustado para o novo limite de
  partículas) e 22 novos. Os novos cobrem:
  - equivalência numérica das otimizações;
  - nitidez sem halo;
  - partículas e proteção do HUD;
  - ordem e integridade do pipeline em dois estágios;
  - escolha de GPU e fallback;
  - cadeia de tentativas, mensagens, sinal preto ou congelado;
  - mapeamento por nome entre backends;
  - atualizador com backup e reversão.
- Ambiente: Linux, Python 3.13, OpenCV 4.11.0.86, ONNX Runtime 1.23.2 em CPU e
  Qt offscreen. **Nada aqui foi executado no Windows, com DirectML ou com
  uma Elgato física.**
- A enumeração COM (DirectShow e Media Foundation), o DXGI, o PowerShell e o
  registro de privacidade foram escritos com base nas interfaces documentadas
  do Windows e protegidos por processo isolado e `try/except`, mas não foram
  executados.
- Sem o `1029.mp4` original, as medidas usaram a amostra 0.3.4 incluída
  (metade esquerda do comparativo, 960 px, ampliada para 1080p). Essa amostra
  é mais suave e mais comprimida que a fonte real.

## 6. O que ainda precisa ser validado no Windows com a Elgato

1. **Modelo exato da Elgato** e forma de conexão (USB 3 ou PCIe). Rodar
   `DIAGNOSTICO_CAPTURA.cmd` e enviar o `.txt` de `logs/`. Isso confirma a
   listagem por nome e os índices.
2. Se a placa **não aparecer na lista**: driver da Elgato (levar o instalador
   offline no pendrive) ou código de erro do Gerenciador de Dispositivos
   mostrado no relatório.
3. Se ela **aparecer mas não abrir**: confirmar a privacidade da câmera e os
   programas em conflito, e comparar DirectShow com Media Foundation no
   relatório.
4. Se **abrir mas vier preta**: a fonte HDMI precisa estar ligada, em
   1080p/720p e sem HDCP (consoles e alguns players bloqueiam). Testar outra
   fonte HDMI.
5. Conferir o **status** depois de conectar: resolução, FourCC e FPS reais. O
   alvo é 1080p30 ou 1080p60 a partir da placa.
6. **GPU**: na lista “GPU”, verificar o nome e a memória mostrados e se o
   Gerenciador de Tarefas mostra uso do adaptador escolhido. A correspondência
   entre a ordem DXGI e o `device_id` do DirectML vem da implementação do ONNX
   Runtime e precisa ser confirmada no PC.
7. **Desempenho real**: `MEDIR_DESEMPENHO.cmd` com o `1029.mp4` e com a placa,
   em 960 × 540 e 1080p, no PC com integrada e no PC com a GPU de 8 GB. Enviar
   os JSON.
8. **Visual**: comparar 0.3.4 × 0.3.5 nos mesmos trechos de partículas e
   movimento. Verificar rastros, partículas cortadas pela metade (supressão
   parcial), HUD e o texto “Depth”, e a nitidez em 15% e 40%.
9. Abertura pelo `ROV_Live_IA.exe`, ainda sem confirmação desde a 0.3.4. O CMD
   segue como caminho confirmado.

## Riscos conhecidos

- Pequenos objetos claros reais que se movem diferente da cena (peixe pequeno,
  reflexo) podem ser atenuados como partículas. Restauração em 0% desliga isso.
- Uma partícula detectada só em parte pode ficar “cortada” por um quadro.
- Em 1080p, a CPU continua sendo o limite neste ensaio. Em PCs fracos, comece
  em 960 × 540 ou 1280 × 720.

---

# 0.3.6: visual natural, sem efeitos acumulados

Retorno do usuário sobre a 0.3.5: “ficou muito melhor”, mas com efeitos
visíveis. Na cena enviada (19:32:53) aparecem água azul-violeta saturada,
cantos escurecidos, viga amarelo-neon, brilho difuso nas bordas e discos
escuros em volta de pontos claros.

**Causas medidas.** A saturação média dobrava (47 → 89) e o brilho caía
(119 → 98). Quase tudo vinha da própria WaterNet: ela corrige o verde da água
criando violeta e escurece a cena em grande escala. A correção de 256 × 144
era ampliada sem respeitar bordas, o que gerava halos, e a resposta da rede a
um ponto isolado virava um disco ao ser ampliada.

**Mudanças:**

- Mediana 5 × 5 no mapa de correção. Remove a resposta a pontos isolados.
- Ampliação guiada pelas bordas do quadro atual (guided filter rápido). A
  correção não atravessa mais as bordas.
- Preservação do brilho em grande escala. Sai 70% do escurecimento amplo da
  rede e fica o contraste local.
- Composição natural (`TemporalRestorer.natural`):
  - a luminância vem da restauração;
  - a cor vem do quadro original, sem 60% do tom médio da água e com
    saturação no máximo ×(1 + Cor IA);
  - só 0,8 × Cor IA da cor da própria rede é misturada.
- Contraste local limitado (CLAHE clip 2 na luminância, misturado). Abre
  áreas escuras e veladas sem mudar a cor.
- A mesma composição vale no modo “só temporal”, para a aparência não
  trocar quando a IA atrasa.
- A correção antiga é reaproveitada por no máximo 1,2 s (antes até 2 s), para
  não arrastar cor atrás de bordas em movimento.
- Novos controles: **Cor IA** (padrão 30%; 100% fica perto do visual vivo da
  0.3.5) e **Contraste local IA** (padrão 50%). A exportação aceita
  `--color` e `--contrast`.

**Na cena do print:**

| Medida | Original | 0.3.5 | 0.3.6 |
|---|---:|---:|---:|
| Brilho médio | 119 | 99 | 112 |
| Saturação média / p95 | 47 / 81 | 100 / 180 | 64 / 116 |
| Contraste (desvio da luminância) | 22,6 | 49,8 | 43,5 |
| Detalhe (Laplaciano) | 6,3 | 7,2 | **8,2** |

**Fluidez (p50, mesmo ensaio).** Com a IA fora da CPU: 29,4 FPS em
960 × 540 e 18,9 FPS em 1080p. Com a IA na CPU: 24,7 e 16,2 FPS. Em todos os
casos, 100% dos quadros saíram com correção aplicada. O custo extra é de cerca
de 2 a 4 ms, dentro da variação das medidas.

**A validar no Windows.** Confirmar se Cor IA 30% e Contraste local 50% são o
melhor padrão nas cenas reais. Se quiser mais cor, suba Cor IA. Se o texto do
HUD ou o ruído ficarem realçados demais, baixe o Contraste local.

---

# 0.3.7: interface simplificada

Retorno do usuário: “a visualização ficou complicada”. O print mostrava o
painel lateral cortado à esquerda (rótulos invisíveis) e excesso de controles.

**Causa.** Listas com textos longos (nome da GPU, “IA — restauração automática”)
deixavam o conteúdo mais largo que o painel. Mesmo sem barra horizontal, o Qt
rolava o painel lateralmente para mostrar o campo em foco, e os rótulos sumiam.
Os controles do modo inativo e os da entrada não usada ficavam na tela,
desabilitados.

**Mudanças:**

- Os campos não forçam mais largura. Os rótulos vão para cima do campo quando
  falta espaço e os textos das opções foram encurtados. Testado em 1366 × 768
  com escala de 125%: rolagem lateral zero.
- **Modo simples por padrão:** Entrada, Dispositivo, Conectar, Modo, **Visual**
  e Intensidade.
- **Visual** escolhe tudo de uma vez:
  - Natural: o padrão da 0.3.6;
  - Mais detalhe: contraste local 70%, nitidez 35%, restauração 45%;
  - Cores vivas: Cor IA 90%;
  - mexer num ajuste fino muda para Personalizado.
- Seções recolhidas: “Opções de captura” (backend, resolução, FPS, formato) e
  “Ajustes finos da IA” (análise, execução, GPU, vídeo fluido e os seis ajustes).
- O painel só mostra os campos da entrada escolhida (placa, arquivo ou IP) e do
  modo escolhido (IA ou Clássico).
- Botão “Ocultar controles” (F9) deixa o vídeo com a largura toda.
- O processamento não mudou: mesmos padrões, mesma fluidez. 83 testes passam.

---

# 0.3.8: linha do tempo para vídeos

Pedido: “uma linha para controlar o trecho do vídeo (apenas se for vídeo)”.

- Abaixo dos painéis aparece **⏸ Pausar / ▶ Continuar**, uma barra de posição
  e o tempo “atual / total”. A barra **só aparece com Arquivo de vídeo
  conectado**. Não aparece para placa de captura nem câmera IP.
- Clicar na barra vai direto ao ponto; arrastar mostra o tempo e vai ao soltar.
  Com o vídeo pausado, ir a outro ponto mostra o quadro novo.
- Pausado, o processo de captura reenvia o mesmo quadro na cadência do
  arquivo. A imagem não some como “sem sinal” e dá para comparar ajustes
  (Visual, Cor, Contraste…) com a cena parada. A IA continua processando.
- Implementação: comandos de posição e de pausa em memória compartilhada com o
  processo de captura. A posição e a duração voltam nos metadados do quadro.
  Nada muda para placa ou IP.
- 85 testes passam. Os novos cobrem ir a um ponto, pausar com a imagem viva,
  ir a outro ponto pausado, continuar, e a barra visível só para arquivo.

---

# 0.3.9: melhor visualização no fundo (automático, ruído, partículas, estabilização)

Pedido: aplicar as melhorias propostas para enxergar ainda melhor.

**Visual Automático (novo padrão).** Mede, na própria cena:
- **véu:** faixa de luminância p2–p98;
- **granulação:** desvio robusto (MAD) na resolução de trabalho;
- **escuridão;**
- **partículas medidas.**

Com isso ajusta aos poucos (constante de ~1,5 s) o contraste local, a
nitidez, a redução de ruído e a restauração. Em água turva ele abre mais as
sombras e **reduz** a nitidez, porque nitidez alta contornava blocos de
compressão e partículas no teste. O rodapé mostra os valores em uso
(“Auto: contraste … nitidez …”). Natural, Mais detalhe e Cores vivas
continuam fixos.

**Redução de ruído em resolução cheia.** A cada quadro, o atual é misturado
com o anterior, alinhado por uma transformação global robusta (RANSAC sobre
o fluxo já medido), só onde os três canais concordam dentro de 10 níveis.
Não é recursivo e não deixa rastros: onde houve movimento ou partícula, o
pixel fica intacto. As faixas do HUD não são misturadas. Custa cerca de
13 ms em 1080p e é controlado por “Redução de ruído”.

**Partículas lentas.** A referência usa até 4 observações anteriores
alinhadas e descarta a mais clara. Assim, uma partícula lenta ainda visível
num quadro anterior não contamina a referência.

**Estabilização digital (opcional, desligada por padrão).**
- O movimento é medido com pontos rastreados e RANSAC, que ignora partículas
  e as faixas do HUD.
- Só o tremor é compensado: a panorâmica intencional é seguida.
- Um zoom de ~5% esconde as bordas. Em teste, o tremor caiu de 8,5 px para
  1,1 px por quadro.
- O HUD da FIFISH está gravado na imagem e acompanha a correção.
- Tentei mantê-lo parado colando o texto original, mas isso deixou letras
  duplicadas e contornos em pontos fixos. Removi para não criar artefatos.

**Medidas (mesmo ensaio, p50; IA em GPU emulada / CPU):**

| | 0.3.8 | 0.3.9 |
|---|---:|---:|
| 960 × 540 | 29,4 / 24,7 FPS | **29,7 / 27,0 FPS** |
| 1920 × 1080 | 18,9 / 16,2 FPS | **22,9 / 18,3 FPS** |

A 0.3.9 ficou mais rápida mesmo com mais processamento, porque a nitidez
passou para o estágio 2 e o alinhamento do ruído virou uma passada só.
Em todos os casos, 100% dos quadros saíram com correção aplicada.

Ensaio sintético com referência conhecida (`particulas_e_ruido.txt`):

| Medida | 0.3.8 | 0.3.9 |
|---|---:|---:|
| Partículas rápidas que sobram | 22,6% | **16,1%** |
| Partículas lentas que sobram | 49,1% | **27,3%** |
| Erro fora das partículas (MSE) | 7,3 | **5,6** (original 6,9) |

Ou seja, o ruído fica abaixo do original. 90 testes passam (3.12 e 3.13).

**A validar no Windows:**
- o Automático em cenas reais longas (se oscila, se escolhe bem);
- se a estabilização ajuda o piloto e se o HUD acompanhando incomoda;
- o FPS real no PC com GPU integrada e no de 8 GB.
