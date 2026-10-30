"""Offline export: every decoded frame, constant source FPS, without audio."""
import argparse,os,sys,time
from pathlib import Path
import cv2,numpy as np
from processing import Enhancer,Settings

def export(source,dest,quality='fast',backend='auto',device_id=0,strength=.8,noise=0.0,sharp=0.0,specks=0.0,restore=0.0):
    src,dst=Path(source).resolve(),Path(dest).resolve()
    if src==dst:raise ValueError('Escolha outro nome para a saída.')
    tmp=Path(str(dst)+'.rov-part.mp4')
    if tmp.exists():raise ValueError('Arquivo temporário já existe; escolha outro destino.')
    cap=cv2.VideoCapture(str(src));writer=None;n=0;start=time.perf_counter()
    try:
        if not cap.isOpened():raise ValueError('Não foi possível abrir o vídeo.')
        fps=cap.get(cv2.CAP_PROP_FPS)
        if not np.isfinite(fps) or not 1<=fps<=240:raise ValueError('FPS inválido para exportar. Use outro vídeo de taxa constante.')
        total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));enhancer=Enhancer()
        settings=Settings(mode='ai',quality=quality,backend=backend,device_id=device_id,strength=strength,ai_noise=noise,ai_sharp=sharp,ai_specks=specks,ai_restore=restore)
        while True:
            ok,frame=cap.read()
            if not ok:break
            if writer is None:
                h,w=frame.shape[:2]
                if w%2 or h%2:raise ValueError('Exportação MP4 exige dimensões pares.')
                writer=cv2.VideoWriter(str(tmp),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h))
                if not writer.isOpened():raise RuntimeError('Encoder MP4 indisponível.')
            result=enhancer.process(frame,settings,1/fps)
            writer.write(result);n+=1
            if n==1 or n%10==0:print(f'Exportando {n}/{total if total>0 else "?"} quadros • {enhancer.status}',flush=True)
        if n==0:raise ValueError('Nenhum quadro decodificado.')
        if total>0 and n<total:raise ValueError(f'Leitura incompleta: {n}/{total}; saída não confirmada.')
        writer.release();writer=None
        os.replace(tmp,dst)
        print(f'Concluído: {n} quadros; {time.perf_counter()-start:.1f} s de processamento. Sem áudio.',flush=True)
        return n
    finally:
        cap.release()
        if writer is not None:writer.release()
        if tmp.exists():tmp.unlink()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('dest');p.add_argument('--quality',default='fast',choices=['fast','detail']);p.add_argument('--backend',default='auto',choices=['auto','cpu']);p.add_argument('--device',type=int,default=0);p.add_argument('--strength',type=float,default=.8);p.add_argument("--noise",type=float,default=0);p.add_argument("--sharp",type=float,default=0);p.add_argument("--specks",type=float,default=0);p.add_argument("--restore",type=float,default=0);a=p.parse_args()
    cv2.setNumThreads(2)
    try:export(a.source,a.dest,a.quality,a.backend,a.device,a.strength,a.noise,a.sharp,a.specks,a.restore)
    except Exception as e:print('Falha: '+str(e),flush=True);sys.exit(1)
