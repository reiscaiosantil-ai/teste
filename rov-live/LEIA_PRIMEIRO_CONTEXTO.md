# ROV Live — transferência de contexto para o Codex

Atualizado em 29/10/2026. Projeto da Underwater/Underocean para melhorar a
visualização de câmeras de ROV, com funcionamento local e distribuição offline.

## Como usar este pacote

1. Abra a pasta deste pacote no Codex.
2. Leia este documento, `ARQUITETURA_E_ALGORITMOS.md`, `HISTORICO_E_DECISOES.md`
   e `VALIDACAO_E_GARGALOS.md`.
3. O código completo reconstruído da última entrega está em `projeto/`.
   Inclui os dois modelos ONNX, dependências, interface e testes.
4. Veja `evidencias/ULTIMO_RESULTADO_APROVADO.png` antes de mudar o tratamento.
5. Use `PROMPT_PARA_CODEX.txt` como primeira instrução para continuar.
6. O vídeo real completo `1029.mp4` precisa ser adicionado separadamente.
   Consulte `ARQUIVOS_E_REFERENCIAS.md`. Há exemplos curtos incluídos.

Este é um contexto técnico consolidado do histórico acessível e dos arquivos
recuperados, não uma exportação oficial ou transcrição bruta integral do chat.
Falas relevantes foram preservadas e as decisões foram documentadas.
Não contém instruções internas da plataforma nem assuntos de outros projetos.
O documento de transferência original está em `historico/` e descreve uma
pausa antiga da versão 0.2; seu status não substitui o estado atual abaixo.

## Estado atual e prioridade principal

**A versão mais recente entregue é a 0.3.4 experimental. O usuário aprovou a
melhoria visual, mas a fluidez no computador dele continua insuficiente.**

Último feedback: **“ta muito melhor”**, com print da estrutura submersa,
cabo claro e elemento alongado enferrujado no centro. O painel tratado deixa
os contornos mais perceptíveis. Há sombras mais fechadas e dominante roxa
residual em algumas regiões; não supor fidelidade de cor comprovada.

Status do último print, no computador do usuário:

| Medida | Valor |
|---|---:|
| Vídeo | 6,5 FPS |
| Aplicação | 116,4 ms |
| Análises da IA | 7,1 análises/s |
| Tempo indicado da IA | 77 ms |
| Idade da correção | 153 ms |
| Estado | Correção aplicada |

O recorte não mostra o número da versão instalada: confirmar no aplicativo.
Esses dados são de um instante e não uma medição controlada. Ainda assim,
mostram que **o gargalo não se resume à inferência neural**. Transferência,
restauração temporal, acabamento, cópias, concorrência, captura e renderização
precisam ser medidos no Windows. O usuário observou CPU e GPU totais abaixo
de 40%; isso não prova ausência de gargalo, nem identifica o adaptador usado.

**Preservar a qualidade aprovada. Não resolver apenas escolhendo a análise
Rápida: o usuário testou e considerou a imagem insuficiente.**

## O que o usuário quer

- Imagem submarina mais nítida e útil, com menos véu, granulação e partículas.
- Vídeo ao vivo com pouca espera e movimento fluido.
- Evolução real do software e da IA, com entregas utilizáveis, não só planos.
- Aproximar o resultado das demonstrações de Orphiecam/SeaVision; deseja
  competitividade, mas não houve demonstração de equivalência ou superioridade.
- Inspiração declarada em DLSS 5: análise contínua e reconstrução percebida.
  Isso é uma referência de experiência, não uma especificação técnica pronta.
- Aplicativo Windows que funcione sem internet no simulador, levado em pendrive.
- Deseja agora programar mais a fundo no Codex e pediu esta transferência.

Não foi pedido controle do ROV, alteração de firmware ou navegação autônoma.

## Hardware e implantação conhecidos

- Windows no computador de uso; o modelo exato de CPU não foi confirmado.
- Na máquina atual o usuário informou gráficos integrados.
- Outros computadores para testes teriam GPUs com 8 GB de VRAM. Não sabemos
  fabricante/modelo, capacidade real de execução nem drivers instalados.
- Não inferir NVIDIA, CUDA, AMD ou Intel a partir de “8 GB”.
- O simulador está sem internet; pacote deve incluir runtime, dependências e
  modelos. Arquivo local/câmera local não devem exigir rede.
- Câmera IP exige conectividade local com a câmera; isso difere de internet.
- Drivers da capturadora e da GPU precisam existir no Windows. Não foram
  testados fisicamente pelo assistente.

## O que a “IA” atual realmente é

1. Uma réplica pré-treinada de **WaterNet**, proveniente de `tnwei/waternet`,
   exportada para ONNX, usada para estimar uma correção em resolução reduzida.
2. Um wrapper próprio que limita e suaviza a correção e a transfere aos pixels
   de entrada, preservando detalhes da imagem original em vez de substituir
   toda a imagem pela saída reduzida da rede.
3. Algoritmos tradicionais de acabamento, alinhamento e fusão temporal.

**Não houve treinamento de pesos próprios da Underwater.** Não há modelo
generativo que reconstrua livremente o ambiente oculto, super-resolução neural
de vídeo implementada, DLSS integrado, malha 3D ou validação de inspeção.
A palavra “restauração” no produto identifica esse processamento híbrido.
Não converter uma hipótese de detalhe em evidência de geometria real.

## Funções existentes

- Captura por dispositivo/câmera, arquivo e URL RTSP/HTTP.
- Comparação original/tratado, vista individual, tela cheia e referência
  original pressionada; PNG de comparação de quadro recente.
- Modo clássico protegido e modo IA.
- IA Rápida 128 × 72 e Detalhada 256 × 144.
- Execução Automático (DirectML quando disponível, com CPU) ou CPU explícita;
  índice de GPU numérico. “Automático” não significa seleção da GPU mais rápida.
- Intensidade, redução de ruído, nitidez, suavização de pontos claros e
  restauração temporal. Controles clássicos ficam desativados no modo IA.
- Modo de vídeo fluido que desacopla análise neural da apresentação.
- Exportação MP4 de todos os quadros decodificados, sem áudio, com taxa
  constante plausível da fonte. A exportação pode ser muito mais lenta que o vídeo.
- Captura isolada em processo, reconexão manual e descarte de quadros em
  sobrecarga; sem fila longa acumulando atraso.

## Defaults que precisam ser distinguidos

Na GUI 0.3.4: IA, Detalhada, Automático, índice 0, vídeo fluido ligado,
intensidade 80%, ruído 30%, nitidez 15%, pontos claros 0%, restauração 35%.

Na dataclass `Settings`, por compatibilidade: `mode='classic'`, `quality='fast'`,
`ai_realtime=False`, `ai_restore=0`, `ai_noise=0`, `ai_sharp=0`,
`ai_specks=0`, intensidade 1. A GUI monta seus próprios valores.
Não confundir os defaults da API/CLI com os mostrados ao usuário.

Intensidade zero ou melhoria desligada faz bypass. Acima de zero, intensidade
muda a força da correção; não reduz proporcionalmente o custo da inferência.
O usuário encontrou 30,1 FPS / 0,6 ms em intensidade zero — isso era o bypass.

## Abertura e executável

O pacote portátil original continha Python 3.12.10 embutido x64 e dependências.
O primeiro launcher Go chamava `pythonw.exe`, alterava variáveis Qt e usava
`app/` como diretório de trabalho. No PC do usuário ficou só o processo do
launcher, sem janela. O log tinha apenas o cabeçalho; a causa exata não foi isolada.

Funcionou no computador do usuário, partindo da pasta do portátil:

```bat
runtime\python.exe -u app\app.py
```

Depois foi compilado um novo `ROV_Live_IA.exe` que chama
`cmd.exe /d /c INICIAR_PORTATIL.cmd` na pasta correta, com console visível.
Fonte Go, licença e binário estão em `iniciador_windows/`.
Esse launcher foi compilado e inspecionado como PE Windows x64, mas sua abertura
não teve confirmação explícita posterior do usuário. O uso por CMD foi confirmado.
Não afirmar que a causa era comprovadamente `pythonw.exe` ou uma DLL específica.

O launcher **não é o aplicativo inteiro em um único arquivo**. Precisa das
pastas `app/` e `runtime/`, mantendo o pacote portátil completo junto dele.
Este ZIP de transferência contém o projeto para desenvolvimento e o iniciador,
mas **não inclui o runtime Windows de centenas de megabytes**. Há link para
o portátil original em `ARQUIVOS_E_REFERENCIAS.md`.

## Como foi montado o código deste pacote

- Base completa: `ROV_Live_IA_v0.3.2.zip`, recuperada dos arquivos da conversa.
- Aplicados os sete módulos de `ROV_Live_IA_Atualizacao_0.3.4.zip`.
- Substituídos/adicionados os testes encontrados na atualização 0.3.4.
- Preservados modelos ONNX, requisitos, instaladores e licenças da base.
- Documentos antigos da base movidos a `projeto/documentacao_anterior/`.
- Mantidas as instruções e a validação da entrega 0.3.4 em `historico/`.

Não é uma captura do disco do usuário: pode haver alterações locais feitas por
ele que não aparecem nos arquivos entregues. O código não foi reescrito nesta
transferência. Os benchmarks/testes relatados pertencem às entregas anteriores;
neste empacotamento foram conferidos integridade, sintaxe e correspondência
dos módulos recuperados, sem alegar nova validação operacional.

## Próxima sessão no Codex

1. Reproduzir o estado atual com vídeo e parâmetros registrados.
2. Confirmar versão instalada, resolução efetivamente recebida e executores
   reais do ONNX no PC de destino. A lista de providers não prova que todas
   as operações rodem na GPU.
3. Instrumentar etapas e medir p50/p95, FPS e idade da correção. Separar tempo
   de filtro do custo da GUI e da latência total câmera-monitor.
4. Otimizar primeiro o caminho de aplicação, acabamento, fusão e renderização,
   comparando com a imagem aprovada; não apenas trocar para 128 × 72.
5. Avaliar qualidade temporal: rastros, oclusão, cabos finos, pequenas partículas,
   mudanças de luz e alternância entre neural e somente temporal.
6. Para modelos novos, comparar com esta baseline e documentar pesos,
   licença, hardware, velocidade e fidelidade. Não assumir que modelo mais
   pesado ou mais “generativo” será melhor para operação de ROV.
7. Validar Windows/DirectML/captura e distribuição offline antes de prometer
   uma versão pronta para o simulador.

O alvo desejado é vídeo útil e próximo de 25–30 FPS quando o hardware permitir,
com atraso controlado. Isso é uma meta de desenvolvimento, não resultado
confirmado no computador do usuário.
