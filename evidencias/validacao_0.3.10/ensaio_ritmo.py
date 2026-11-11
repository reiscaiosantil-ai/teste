import sys, time, json
sys.path.insert(0, sys.argv[1])
import numpy as np, cv2
from engine import Session, Source
from processing import Settings
import dataclasses
def main():
    W,H=int(sys.argv[2]),int(sys.argv[3])
    kw=dict(mode='ai',quality='detail',backend='cpu',ai_noise=.3,ai_sharp=.15,ai_restore=.35,ai_realtime=True)
    if 'ai_auto' in {f.name for f in dataclasses.fields(Settings)}: kw['ai_auto']=True
    s=Session(Source('file','/home/user/rov/ROV_Live_Transferencia_Codex/projeto/dados/amostra_1080p.mp4',width=W,height=H,loop=True),Settings(True,.8,**kw))
    last=-1; stamps=[]; seqs=[]
    t_end=time.perf_counter()+28
    while time.perf_counter()<t_end:
        p=s.snapshot()
        if p is not None and p['seq']!=last:
            last=p['seq']; stamps.append(time.perf_counter()); seqs.append(p['seq'])
        time.sleep(.001)
    s.close()
    st=np.array(stamps[-400:]); iv=np.diff(st)*1000; sq=np.diff(np.array(seqs[-400:]))
    print(json.dumps({'fps':round(len(iv)/(st[-1]-st[0]),1),'intervalo_p50_ms':round(float(np.median(iv)),1),'p95_ms':round(float(np.percentile(iv,95)),1),
      'max_ms':round(float(iv.max()),1),'quadros_pulados_por_exibido':round(float(sq.mean()-1),2),'pulos_irregulares':int(np.sum(sq>=2))}))
if __name__=='__main__': main()
