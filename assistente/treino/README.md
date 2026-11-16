# Treinar a voz offline da Sexta-feira (Piper)

O Piper fala instantaneamente no PC, **sem placa de vídeo e sem internet**. Para ela ter uma voz própria (jovem e descontraída), a voz precisa ser **treinada uma vez** numa placa de vídeo — dá para fazer de graça no Google Colab.

## Passo a passo

1. **Escolha a voz.** Só use a voz de quem autorizar (você ou alguém que concorde).
2. **Grave no app.** Ajustes → Voz offline (Piper) → **🎙 Estúdio de voz**. São 198 frases curtas (uns 9 minutos de fala, 20 a 30 minutos para gravar). Dicas: lugar silencioso, sempre na mesma distância do microfone, jeito natural e descontraído. A barra de espaço grava e para.
3. **Compacte** a pasta `Documentos\Lumi\estudio-voz` em `estudio-voz.zip` e envie para o Google Drive, em `Meu Drive/Lumi/`.
4. **Treine.** Abra [`treinar-voz-piper.ipynb`](treinar-voz-piper.ipynb) no Google Colab (Arquivo → Fazer upload de notebook), escolha **GPU (T4)** e rode as células na ordem. Com 1000 épocas, a estimativa é de algumas horas; o progresso fica salvo no Drive e continua se cair.
5. **Use.** Baixe `pt_BR-sexta-feira-medium.onnx` e `.onnx.json` do Drive e, no app, **➕ Adicionar voz (.onnx)**.

## Detalhes técnicos

- Treino: [piper1-gpl](https://github.com/OHF-voice/piper1-gpl) (`python3 -m piper.train fit`), com `--model.warmstart_ckpt` a partir de `rhasspy/piper-checkpoints` → `pt/pt_BR/faber/medium` e eSpeak `pt-br`, 22050 Hz.
- Formato do estúdio: `wavs/fraseNNNN.wav` (22050 Hz, mono, 16 bits, silêncio das pontas cortado, volume normalizado) e `metadata.csv` (`arquivo.wav|texto`).
- No app, a voz roda no processo principal com onnxruntime-node e fonemas do eSpeak-NG em WebAssembly (o mesmo eSpeak do Piper); gera ~6 s de fala em ~0,5 s num processador comum.
- **Não testado aqui:** o caderno de treino não pôde ser executado neste ambiente (sem placa de vídeo). O motor Piper do app e o formato das gravações foram testados.
