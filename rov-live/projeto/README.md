# ROV Live IA — fonte 0.3.5

Base 0.3.4 (0.3.2 + módulos 0.3.4) com as mudanças da 0.3.5: captura com
identificação por nome e diagnóstico (`capture_devices.py`), vídeo fluido em
dois estágios, escolha automática da GPU, partículas e nitidez. O resumo das
mudanças, medidas e pendências de validação no Windows está em
`../ENTREGA_0.3.5.md`.
Os modelos ONNX estão em `models/`. Não é o portátil Windows com runtime
vendorizado. Documentos antigos foram preservados em `documentacao_anterior/`.
Leia o contexto atualizado na pasta acima antes de alterar o algoritmo.

## Desenvolvimento

Python usado nas entregas: 3.12. Requisitos exatos nos arquivos incluídos.
Em um ambiente de desenvolvimento com acesso a pacotes, a partir desta pasta:

```bash
python -m venv .venv
```

Windows, com DirectML quando disponível:

```bat
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe app.py
```

CPU explícita / dependências alternativas:

```bat
.venv\Scripts\python.exe -m pip install -r requirements_cpu.txt
```

Não instalar os dois pacotes ONNX Runtime diferentes juntos no mesmo venv
sem verificar como seus arquivos se sobrepõem. Use ambientes separados ao
comparar builds CPU e DirectML. Há instaladores CMD herdados da base.

Linux/CPU:

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

Em máquina sem display, a interface pode ser testada com `QT_QPA_PLATFORM=offscreen`;
isso não valida uma janela Windows ou uma GPU DirectML.

## Testes

Os requisitos de produto não incluem pytest. Instale-o somente no ambiente
de desenvolvimento e execute a partir desta pasta:

```bash
python -m pip install pytest
python -m pytest -q
```

No Linux sem display:

```bash
QT_QPA_PLATFORM=offscreen python -m pytest -q
```

Mantenha os testes na mesma pasta durante esta primeira reprodução: alguns
importam fixtures de `test_rov.py`. Não reorganizar a suíte sem ajustar imports.

## Diagnóstico da captura e medição

```bat
python capture_devices.py --diagnostico
python capture_devices.py --listar-json
python benchmark_live.py dados\1029.mp4 --largura 960 --altura 540 --segundos 30
python benchmark_live.py --dispositivo 0 --backend DirectShow --largura 1920 --altura 1080
```

O diagnóstico lista os dispositivos na ordem do índice do OpenCV (DirectShow e
Media Foundation), drivers com erro, privacidade da câmera, programas que
ocupam a placa e testa a abertura de cada um em processo isolado. Relatórios e
logs vão para `logs/` ao lado de `app/` (ou na pasta temporária do usuário).
O benchmark grava JSON com FPS, latência no app, estágios p50/p95 e estados.

## Abrir vídeo e exportar

```bash
python app.py --video dados/1029.mp4
python export_video.py dados/1029.mp4 dados/saida_tratada.mp4 --quality detail --backend cpu --strength 0.8 --noise 0.3 --sharp 0.15 --specks 0 --restore 0.35
```

Escolha um destino diferente da fonte. O diretório `dados/` pode ser criado
localmente; `1029.mp4` não está neste pacote. A exportação é offline, processa
todos os quadros e não mantém áudio. Cadência do arquivo não é benchmark de IA.

## Distribuição

O pacote de desenvolvimento pode baixar dependências no preparo. O aplicativo
final do simulador deve levar dependências e modelos prontos em pendrive.
Não pedir instalação online no PC que está offline.

O iniciador em `../iniciador_windows/` espera um layout portátil `app/` e
`runtime/`. Não executá-lo apontando para esta fonte e supor que contenha Python.
Fonte do launcher: `../iniciador_windows/suporte/launcher.go`.
Compilação histórica em Go 1.25.3, por cross-build Linux:

```bash
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-H windowsgui -s -w' -o ROV_Live_IA.exe launcher.go
```

Essa compilação apenas gera o launcher. Não empacota Python, Qt, ONNX,
OpenCV, modelos, licenças ou drivers. A abertura real exige teste Windows.
