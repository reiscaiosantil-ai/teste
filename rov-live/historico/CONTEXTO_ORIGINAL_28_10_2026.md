# Continuidade — ROV Live / Underwater

Este é um resumo técnico de transferência da conversa de Caio com o ChatGPT,
preparado em 28/10/2026. Não é uma transcrição literal ou exportação oficial da
conta. O pacote inclui o código e as evidências necessárias para retomar o projeto.
Não retome automaticamente tarefas de desenvolvimento só por ler este documento:
Caio havia pausado o trabalho e pediu esta transferência. Aguarde sua instrução.

## Objetivo do usuário

Criar um programa para melhorar a imagem ao vivo das câmeras dos ROVs da Underwater,
especialmente a visibilidade em água turva, com redução forte da névoa e baixo atraso.
O usuário comparou a experiência desejada a um “DLSS 5 para ROV”, processando
continuamente o sinal recebido. Quer resultados práticos, não mais discussão teórica.
Não foi pedido controle dos movimentos do ROV nem alteração de firmware.

## Equipamento conhecido

- Computador Windows; há uma placa de captura, uma GPU com 8 GB de VRAM e um
  “processador decente”. Modelos, fabricante da GPU e interfaces físicas desconhecidos.
- O usuário instalou e abriu a versão 0.1 com sucesso, como comprova o print anexado.
- Na tela de teste: entrada 1920 × 1080, processamento 1280 × 720; aproximadamente
  29,8 FPS processados, filtro 27,0 ms, idade no app 69 ms naquele instante.
- Esses valores não são latência câmera-monitor. A idade começa após a entrega
  do quadro pelo VideoCapture.read, excluindo buffers anteriores e o monitor.
- Python recomendado para o pacote: 3.12 x64. O usuário inicialmente abriu a página
  da série 3.14; foi orientado a usar Windows installer (64-bit) da versão 3.12.10:
  https://www.python.org/downloads/release/python-31210/

## Referência visual e arquivos

Referência Orphiecam: https://www.youtube.com/watch?v=lsXASTLiQZY
O acesso direto ao YouTube falhou; depois o usuário enviou `31904.mp4`, analisado
por amostras. A comparação nele pode envolver câmeras diferentes; não comprova
que a imagem clara é apenas uma transformação de software da imagem turva.

O usuário também enviou `Meu primeiro vídeo(1).mp4`, disponível na conversa de
origem. Cerca de 7min43s, 1080p, quadros em ritmo variável; o metadado r_frame_rate
é anômalo (30000/1), por isso não deve ser interpretado como 30.000 FPS reais.
O programa usa timestamps quando disponíveis, com fallback de FPS plausível.

Vídeo usado pelo usuário para avaliar a névoa na versão 0.1:
`YTDown.com_YouTube_Media_ggSf0MmYOlw_Toughest-ROV-Yet-Flooded-MINE-w-t-cloudy-water-MAKING-IT-HARD_001_1080p.mp4`.
Inicialmente sua materialização falhou. Depois apareceu como disponível na Library,
mas NÃO chegou a ser lido antes da pausa. Se necessário, peça para anexá-lo no novo chat.

O pacote NÃO inclui vídeos grandes. Inclui o print de teste e uma comparação
estática feita a partir do painel original desse print. Não apresentar essa
comparação estática como validação de vídeo ou de fidelidade de detalhes.

## Versão 0.1 entregue

`ROV_Live_v0.1.zip` contém a versão já recebida e executada pelo usuário.

- Aplicativo Python/PySide6/OpenCV com interface em português.
- Entradas: dispositivo de captura/câmera, arquivo de vídeo e URL RTSP/HTTP.
- Captura em processo separado e um único buffer compartilhado de imagem.
- Processamento em thread, priorizando o quadro mais recente em sobrecarga.
- Original e tratado lado a lado, ajustes de brilho/cor/contraste/névoa/ruído.
- Remoção da imagem exibida se não chega quadro recente por 0,75 s.
- Reconexão manual e encerramento de captura travada por isolamento de processo.
- Instalação por INSTALAR.cmd e abertura por INICIAR.cmd; não há .exe pronto.
- Dependências: numpy==2.2.4, opencv-python-headless==4.11.0.86, PySide6==6.8.3.
- Tudo roda em CPU; NÃO há CUDA, DLSS, IA generativa ou uso dos 8 GB de VRAM.
- Não grava vídeo, não cria câmera virtual e não controla o ROV.

Validação da versão 0.1: 12 testes passaram em Linux/Python 3.12; interface
inspecionada visualmente em modo offscreen. Testes com o vídeo do usuário.
Filtro isolado em 720p, 150 quadros após 10 de aquecimento, trecho de 115 s:
mediana 16,26 ms; p95 27,95 ms. Névoa e redução de ruído estavam desligadas.
Windows/captura física/RTSP real não foram testados remotamente.

## Feedback que motivou a atualização

O usuário disse: “melhorou bem pouco”, “o resultado tá extremamente parecido” e
“gostaria bastante de uma melhora na redução da névoa”. No print, o controle
“Névoa experimental” estava em 0%, intensidade 65%, clareamento 0,6,
cor 10%, contraste 1,6. Logo, a remoção de névoa estava desligada.

Não responder apenas que ele deve mudar o slider: já foi iniciado um reforço do
algoritmo, com novos perfis, para atender ao efeito visual desejado.

## Estado exato da atualização 0.2 — PAUSADA / NÃO ENTREGUE

A pasta `ROV_Live_v02_EM_DESENVOLVIMENTO` é um checkpoint do código em andamento.
Ela não substitui uma versão final validada. Não foi instalada pelo usuário.

Mudanças implementadas:

- Defaults: intensidade 100%, névoa 80%, clareamento 0, cor 15%, contraste 1,3.
- Perfis: Água turva (80%), Névoa forte (95%), Suave / pouca névoa (0%).
- Redução de névoa aplicada antes de gamma/cor/CLAHE.
- Estimativa de transmissão inspirada em UDCP, usando azul/verde em vez de RGB.
- Estimativa robusta da luz de véu, excluindo bordas com overlays.
- Refinamento da transmissão por filtro guiado em baixa resolução, limite mínimo
  de transmissão 0,16 e suavização temporal dos parâmetros (sem misturar pixels
  de quadros diferentes).
- Reinicialização dos estimadores em mudanças grandes de cena; preto total
  preservado exatamente.
- Botão “Segure: ver original” para comparar no mesmo painel.
- Resolução adicional 960 × 540.

A prévia no print mostrou mais contornos da estrutura ao fundo, mas também mais
ruído, partículas, cores intensas e artefatos de compressão, sobretudo em 95%.
Não afirmar que todo contorno enfatizado é informação nova ou defeito real.

Testes: 15 passaram após as mudanças de algoritmo/perfis e ANTES da última
otimização SIMD e da opção 960 × 540. Incluem teste sintético com referência
conhecida, reinicialização em corte de cena e mapa constante no filtro guiado.
No cenário sintético, MSE caiu aproximadamente de 3583 para 1059; isso não
generaliza automaticamente para a câmera real nem para o vídeo da mina.

Problema de desempenho ainda em análise: a primeira implementação 0.2 levou
mediana 55,65 ms e p95 86,57 ms por filtro em 720p no vídeo anterior. Isso é
insuficiente para prometer 30 FPS nessa máquina de teste. Depois, as operações
NumPy de reconstrução foram trocadas por operações OpenCV SIMD para acelerar.
Esse último patch está no código. Foi iniciado um novo benchmark, mas o usuário
mandou “pausa a tarefa!” antes de o resultado ser examinado. Portanto não há
medição confirmada desse patch nem teste final posterior a ele.

Os documentos da pasta estão parcialmente atualizados: `VALIDACAO.md` ainda
descreve a versão 0.1 e deve ser refeito antes da entrega. O README menciona
`COMPARACAO_PRINT.png`, que ainda não foi criada dentro da pasta do programa.
Há uma prévia de teste fora dela, em `evidencias/comparacao_estatica_print.jpg`.

## Próximos passos quando Caio autorizar retomar

1. Ler este documento e conferir o código atual, sem reconstruir o projeto.
2. Abrir o vídeo da mina, se anexado; testar trechos reais representativos.
3. Rodar os testes após o último patch; medir filtro e aplicativo completos
   separadamente, sem tarefas concorrentes afetando os benchmarks.
4. Ajustar força e transmissão para equilibrar visibilidade, ruído e halos.
5. Verificar visualmente a interface com os novos perfis e comparação pressionada.
6. Medir 720p e 960 × 540; não prometer baixa latência apenas por FPS.
7. Atualizar documentação/validação, empacotar 0.2 e entregar instrução para copiar
   os arquivos sobre a instalação existente, mantendo `.venv`. As dependências
   não mudaram até este checkpoint.

Preservar entrada original. A checagem de sinal detecta ausência de quadros,
não uma captura que continua enviando a mesma imagem congelada. Não alegar
equivalência com Orphiecam, recuperação de objetos totalmente ocultos ou
validação operacional com o ROV real.

## Referências técnicas usadas

- UDCP: https://openaccess.thecvf.com/content_iccv_workshops_2013/W24/html/Drews_Jr._Transmission_Estimation_in_2013_ICCV_paper.html
- Dark channel prior / guided filtering: https://people.csail.mit.edu/kaiming/cvpr09/
- OpenCV VideoCapture: https://docs.opencv.org/4.11.0/d4/d15/group__videoio__flags__base.html
- Qt for Python: https://doc.qt.io/qtforpython-6/

## Preferências de colaboração

Converse em português, chame o usuário de Caio e seja prático. Ele pediu para
reduzir teoria e construir o programa. Não faça promessas de melhoria ou FPS sem
medir. Não faça o usuário reinstalar o que já funciona sem motivo. A tarefa ficou
explicitamente pausada; esta transferência não é autorização para continuar.
