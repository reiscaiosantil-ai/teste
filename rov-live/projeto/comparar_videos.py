"""Compara vídeos lado a lado, quadro a quadro, para avaliar tratamentos.

Uso (Windows, pasta do portátil):
    runtime\\python.exe app\\comparar_videos.py original.mp4 nvidia.mp4 rovlive.mp4 --saida comparacao.mp4

Cada vídeo é redimensionado para a mesma altura e recebe um rótulo. O
resultado tem a duração do mais curto. Também grava PNGs de alguns instantes
(--quadros) para comparar em tamanho real. Não altera nenhum dos vídeos.
"""
import argparse
from pathlib import Path

import cv2
import numpy as np


def label(frame, text):
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 30), (20, 14, 11), -1)
    cv2.putText(frame, text, (10, 21), cv2.FONT_HERSHEY_SIMPLEX, .65, (230, 235, 235), 1, cv2.LINE_AA)
    return frame


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("videos", nargs="+", help="2 a 4 vídeos do MESMO trecho")
    parser.add_argument("--nomes", nargs="+", help="Rótulos (padrão: nome dos arquivos)")
    parser.add_argument("--saida", default="comparacao.mp4")
    parser.add_argument("--altura", type=int, default=540, help="Altura de cada painel")
    parser.add_argument("--quadros", type=int, nargs="*", default=[30, 150, 300],
                        help="Quadros salvos também como PNG em tamanho real")
    args = parser.parse_args()
    if not 2 <= len(args.videos) <= 4:
        parser.error("Informe de 2 a 4 vídeos.")
    names = args.nomes or [Path(v).stem for v in args.videos]
    caps = [cv2.VideoCapture(v) for v in args.videos]
    for cap, path in zip(caps, args.videos):
        if not cap.isOpened():
            raise SystemExit(f"Não foi possível abrir {path}")
    fps = caps[0].get(cv2.CAP_PROP_FPS) or 30
    writer, count = None, 0
    out = Path(args.saida)
    while True:
        frames = []
        for cap in caps:
            ok, frame = cap.read()
            if not ok:
                frames = None
                break
            frames.append(frame)
        if frames is None:
            break
        if count in args.quadros:
            # Full size, same width as the first video, for detail inspection.
            h, w = frames[0].shape[:2]
            full = [label(cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA), n)
                    for f, n in zip(frames, names)]
            png = out.with_name(f"{out.stem}_quadro{count}.png")
            cv2.imencode(".png", np.vstack(full))[1].tofile(str(png))
        panels = []
        for frame, name in zip(frames, names):
            h, w = frame.shape[:2]
            width = round(w * args.altura / h)
            panels.append(label(cv2.resize(frame, (width - width % 2, args.altura),
                                           interpolation=cv2.INTER_AREA), name))
        row = np.hstack(panels)
        if writer is None:
            writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps,
                                     (row.shape[1], row.shape[0]))
        writer.write(row)
        count += 1
    if writer is not None:
        writer.release()
    for cap in caps:
        cap.release()
    print(f"Concluído: {count} quadros em {out} (+ PNGs dos quadros {args.quadros}).")


if __name__ == "__main__":
    main()
