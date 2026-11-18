# Evidências, limites e trabalho aberto

## Não confundir estes resultados

| Contexto | Resultado | Interpretação |
|---|---|---|
| PC do usuário, IA inicialmente | 5,1 FPS; filtro 206 ms | Tratamento bloqueava cadência |
| PC do usuário, outro instante | 6,9 FPS; filtro 152,5 ms | Melhor que o primeiro, ainda lento |
| PC do usuário, intensidade zero | 30,1 FPS; 0,6 ms | Bypass do tratamento, não IA acelerada |
| PC do usuário, print com novo vídeo | 4,9 FPS; aplicação 248,1 ms; IA 79 ms | Custo relevante fora da inferência |
| Último print aprovado do usuário | 6,5 FPS; aplicação 116,4 ms; IA 77 ms | Qualidade aprovada, fluidez ainda insuficiente |
| Ensaio histórico 0.3.3 em Linux/CPU, recorte a 540p | ~30 FPS no modo fluido | Vídeo atualizado entre análises, não 30 inferências/s |
| Ensaio final 0.3.4 em Linux/CPU, 1029.mp4 Full HD | ~17,8 FPS | 60 frames neural + 48 somente temporal, de 108 medidos |
| Amostra exportada 0.3.4 | 180 quadros, 6 s, 30 FPS no arquivo | Resultado offline, não medição de execução ao vivo |

São máquinas, cenas, protocolos e instantes diferentes. Não calcular ganho
percentual entre linhas como se fossem um benchmark pareado. Nem o FPS nem
“idade no app” demonstram sozinhos latência câmera-monitor.

JSON do ensaio final: `evidencias/validacao_0.3.4/desempenho_full_hd.json`.
Aplicação mediana 56,74 ms, p95 80,89 ms, análise neural mediana 520,88 ms,
idade mediana da correção 859,43 ms. Guia/trabalho 640 × 360; saída 1080 × 1920.
O custo por estágio depende do estado e de campos disponíveis no snapshot.
Ensaios anteriores da mesma sessão variaram com a carga do ambiente.

## Testes existentes e alcance

Na entrega 0.3.4 foram reportados 59 testes passando: 56 dos módulos do app
e 3 do atualizador/backup/rollback. Os testes `test_*.py` recuperados do ZIP
da atualização estão em `projeto/` e também preservados nas evidências.
Os três testes do atualizador foram executados na sessão de origem; seus
fontes separados não estavam no ZIP recuperado. Não confundir a presença
do código do atualizador com a recuperação desses três testes.

Cobertura reportada: bypass, preto, limites, não mutação, sessão contínua,
falha da IA, exportação e GUI, captura antiga, carregamento inicial, atraso
neural independente da exibição, correspondência/expiração/cortes,
translação, pontos transitórios e persistentes, ruído conhecido, HUD,
novas bordas, gaps de tempo e mudança de resolução.

Teste sintético de ruído em região plana, restauração 80%:
MSE de 9,314 para 5,523, redução relativa 40,7%. Não implica a mesma redução
em partículas reais, turbidez ou contornos de estruturas submersas.
Não há sequência limpa pareada de 1029.mp4 para medir fidelidade verdadeira.

Na transferência atual: leitura dos arquivos reais, recuperação dos módulos,
conferência de sintaxe e integridade, sem executar novamente a suíte completa
ou afirmar nova validação de Windows. O Codex deve rodar a suíte no ambiente
em que continuar e medir regressões decorrentes de suas próprias alterações.

## Gaps ainda abertos

1. **Windows e hardware real:** testes anteriores do assistente foram em Linux,
   CPU e Qt offscreen. Capturadora, RTSP real, DirectML e driver do simulador
   não foram validados fisicamente por ele.
2. **Execução GPU real:** Automático e lista de providers não provam que
   todos os operadores rodem na GPU nem que o índice 0 seja a melhor GPU.
3. **Renderização:** o tempo “Aplicação” mede o worker, não toda a pintura da
   GUI, cópias QImage ou monitor. Medir ambos separadamente.
4. **Cadência e latência:** falta benchmark longo, repetível, de câmera até
   tela. Não compensar FPS com fila longa ou congelamento silencioso.
5. **Cor/contraste:** dominante roxa e sombras fechadas podem persistir.
   O limite de crominância também pode impedir recuperação legítima de cor.
6. **Temporal:** oclusões, rotação rápida, regiões sem textura, reflexos e
   pontos luminosos pequenos podem produzir correspondências ruins.
   Mudança entre neural e temporal pode alterar a aparência.
7. **HUD:** proteção temporal fixa nas faixas superior/inferior, não detector
   de telemetria em qualquer posição. Acabamento pode mudar cor/contraste do texto.
8. **Detalhe real:** não há super-resolução neural nem prova de reconstrução
   de objetos escondidos. Contorno mais contrastado não comprova informação nova.
9. **Compatibilidade do launcher:** novo EXE compilado/inspecionado; abertura
   por ele ainda sem confirmação explícita. CMD foi confirmado funcional.
10. **Empacotamento:** não existe build/release automatizado reprodutível completo
   do runtime portátil neste pacote. Há fonte do launcher e registro dos componentes.
11. **Treino e dados:** não há dataset proprietário anotado, script de treino,
   checkpoint PyTorch próprio ou pesos novos Underwater. Só os modelos ONNX
   atuais e a proveniência descrita. Investigar direitos de distribuição de
   pesos/dados antes de comercializar uma nova solução.
12. **Congelamento da fonte:** captura pode entregar repetidamente a mesma
   imagem; o heartbeat atual não detecta esse caso.

## Protocolo sugerido para o próximo desenvolvimento

- Registrar versão exata, commit local quando criado, hashes dos modelos,
  CPU/GPU/driver/Windows/provider, resolução recebida e todos os controles.
- Baseline visual: screenshot aprovado + mesmos trechos de 1029.mp4. Incluir
  partes claras, turvas, com muitas partículas e movimento da câmera.
- Aquecer sessões, separar benchmark de exportação/compilação/testes pesados.
- Medir leitura/cópias, pré-processamento, inferência, fluxo, fusão, acabamento,
  lift e GUI. p50/p95, FPS sustentado, idade da correção e estados aplicados.
- Relatar explicitamente porcentagem de frames com neural, somente temporal
  e original. Evitar melhorar FPS apenas desativando etapas sem declarar.
- Comparar original, baseline 0.3.4 e candidato na mesma escala/cadência.
  Observar sombras, contorno de cabos, pontos pequenos, halos, sobreposições,
  rastros e oscilação. Um still não valida estabilidade temporal.
- Se mudar a rede, manter baseline disponível e testar classe de cenas,
  não apenas um frame que favoreça o novo modelo.
- Preservar operações offline e fallback por CPU. Validar novo pacote numa
  máquina sem Python instalado e sem internet, com os drivers esperados.
