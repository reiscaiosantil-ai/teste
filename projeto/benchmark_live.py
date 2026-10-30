"""Reproducible live-pipeline benchmark: real capture process + both stages.

Uso (Windows, pasta do portátil):
    runtime\\python.exe -u app\\benchmark_live.py video.mp4 --segundos 30
    runtime\\python.exe -u app\\benchmark_live.py --dispositivo 0 --backend DirectShow

Grava um JSON com FPS exibido, latência no app, custo por estágio (p50/p95),
estado de cada quadro (IA aplicada / só temporal / original) e o executor real
do ONNX. Não mede câmera, cabo, driver, pintura da tela nem monitor.
"""
import argparse
import json
import multiprocessing as mp
import os
import platform
import sys
import time
from collections import Counter
from pathlib import Path

os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
import cv2
import numpy as np

from engine import Session, Source
from processing import Settings


def summary(values):
    values = [v for v in values if v is not None]
    if not values:
        return None
    return {"p50": round(float(np.median(values)), 2),
            "p95": round(float(np.percentile(values, 95)), 2),
            "n": len(values)}


def run(source, settings, seconds, warmup):
    session = Session(source, settings)
    samples, last_seq = [], -1
    try:
        deadline = time.perf_counter() + warmup + seconds
        measuring_from = time.perf_counter() + warmup
        while time.perf_counter() < deadline:
            packet = session.snapshot()
            now = time.perf_counter()
            if packet is not None and packet["seq"] != last_seq:
                last_seq = packet["seq"]
                if now >= measuring_from:
                    samples.append((now, packet))
            time.sleep(0.002)
        message = session.message
    finally:
        session.close()
    if len(samples) < 2:
        return {"erro": "Poucos quadros tratados: " + message}
    span = samples[-1][0] - samples[0][0]
    packets = [p for _, p in samples]
    states = Counter(p.get("ai_state", p.get("mode", "?")) for p in packets)
    first = packets[-1]
    def field(name):
        return summary([p.get(name) for p in packets])
    return {
        "quadros_exibidos": len(packets),
        "fps_exibido": round((len(packets) - 1) / span, 2) if span > 0 else None,
        "estados": dict(states),
        "fracao_ia_aplicada": round(states.get("applied", 0) / len(packets), 3),
        "aplicacao_ms": field("processing_ms"),
        "latencia_no_app_ms": field("latency_ms"),
        "estagio1_ms": field("prepare_ms"),
        "estagio2_ms": field("render_ms"),
        "temporal_ms": field("temporal_ms"),
        "transferencia_ms": field("transfer_ms"),
        "acabamento_ms": field("finish_ms"),
        "analise_ia_ms": field("ai_ms"),
        "analises_por_s": field("ai_fps"),
        "idade_correcao_ms": field("ai_age_ms"),
        "entrada": list(first["source_size"]),
        "tratada": list(first["enhanced"].shape),
        "executor": first.get("processor", ""),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("video", nargs="?", help="Arquivo de vídeo (repetido em loop)")
    parser.add_argument("--dispositivo", type=int, help="Índice da placa de captura")
    parser.add_argument("--backend", default="DirectShow")
    parser.add_argument("--largura", type=int, default=1920)
    parser.add_argument("--altura", type=int, default=1080)
    parser.add_argument("--segundos", type=float, default=20)
    parser.add_argument("--aquecimento", type=float, default=8)
    parser.add_argument("--qualidade", default="detail", choices=["fast", "detail"])
    parser.add_argument("--execucao", default="auto", choices=["auto", "cpu"])
    parser.add_argument("--gpu", type=int, default=-1, help="-1 = escolha automática")
    parser.add_argument("--sem-fluido", action="store_true")
    parser.add_argument("--saida", default="benchmark_rov_live.json")
    args = parser.parse_args()
    if args.dispositivo is None and not args.video:
        parser.error("Informe um vídeo ou --dispositivo.")
    if args.dispositivo is not None:
        source = Source("capture", str(args.dispositivo), args.backend, args.largura, args.altura)
    else:
        source = Source("file", str(Path(args.video).resolve()), width=args.largura,
                        height=args.altura, loop=True)
    # Same values the GUI shows by default (0.3.4 approved look).
    settings = Settings(True, .8, mode="ai", quality=args.qualidade, backend=args.execucao,
                        device_id=args.gpu, ai_noise=.3, ai_sharp=.15,
                        ai_realtime=not args.sem_fluido, ai_specks=0, ai_restore=.35)
    cv2.setNumThreads(2)
    result = {"versao": "0.3.8", "python": sys.version.split()[0], "opencv": cv2.__version__,
              "sistema": platform.platform(), "cpu": platform.processor(),
              "nucleos": os.cpu_count(), "fonte": source.kind,
              "controles": settings.__dict__, **run(source, settings, args.segundos, args.aquecimento)}
    text = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    Path(args.saida).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    mp.freeze_support()
    main()
