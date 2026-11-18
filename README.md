# ROV Live IA — Underwater / Underocean

Aplicativo Windows (Python + PySide6) que melhora em tempo real o vídeo de
câmeras de ROV: captura por placa (Elgato), arquivo ou câmera IP; correção
com a rede WaterNet (ONNX, DirectML ou CPU); fusão temporal para ruído e
partículas; cor natural, contraste local e nitidez sem halos. Funciona
offline e é distribuído como pacote portátil (pendrive).

Versão atual: **0.3.11 (experimental)**.

## Estrutura

| Pasta / arquivo | Conteúdo |
|---|---|
| `projeto/` | Código-fonte, modelos ONNX, testes (`pytest`), `README.md` de desenvolvimento |
| `iniciador_windows/` | Launcher, scripts CMD (iniciar, atualizar, diagnóstico da captura, medir desempenho) e atualizador |
| `entregas/` | Pacotes de atualização prontos para o pendrive (`ROV_Live_Atualizacao_*.zip`) |
| `ENTREGA_0.3.5.md` | Histórico técnico das versões 0.3.5 a 0.3.11: mudanças, medidas e pendências de validação |
| `evidencias/` | Comparações visuais, ensaios e medições de cada versão |
| `LEIA_PRIMEIRO_CONTEXTO.md`, `CONTEXTO_COMPLETO_PARA_CODEX.md` e demais `.md` da raiz | Contexto do projeto até a 0.3.4 (decisões, arquitetura, limites) |
| `historico/` | Documentos e pacote das entregas iniciais |

## Desenvolvimento rápido

```bash
cd projeto
python -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest -q
.venv/bin/python app.py --video dados/seu_video.mp4
```

No Windows, o pacote portátil (`runtime\python.exe`) é atualizado com o ZIP
de `entregas/` + `ATUALIZAR_PORTATIL.cmd`. Detalhes em `projeto/README.md`.

## Avisos

- A IA é uma réplica pré-treinada de WaterNet (código MIT, ver
  `projeto/LICENSE_WATERNET.txt`); não há pesos treinados pela Underwater.
  Verificar direitos de uso dos pesos antes de uso comercial.
- O processamento não gera detalhes: restaura contraste, cor e reduz ruído
  e partículas a partir de observações reais.
- Validação em Windows com a Elgato física e com a GPU de 8 GB ainda pendente.
