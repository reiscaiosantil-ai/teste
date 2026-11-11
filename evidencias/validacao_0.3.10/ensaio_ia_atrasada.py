"""Movimento contínuo (sem cortes) + IA de 77 ms que às vezes trava (até 0,9 s)."""
import sys, time, math, json, collections, random
sys.path.insert(0, sys.argv[1])
import cv2, numpy as np, dataclasses
cv2.setNumThreads(2)
import rov_ai
from live_ai import LiveAI
from processing import Settings
real=rov_ai.RovAI
class Jittery(real):
    rng=random.Random(5)
    def estimate(self, frame):
        r=super().estimate(frame)
        time.sleep(.9 if self.rng.random()<.12 else .077)   # ~12% das análises travam
        return r
cap=cv2.VideoCapture('/home/user/rov/ROV_Live_Transferencia_Codex/evidencias/exemplos_0.3.4/1029_comparacao_034.mp4')
src=[]
while True:
    ok,f=cap.read()
    if not ok: break
    src.append(cv2.resize(f[:, :960],(1280,780),interpolation=cv2.INTER_CUBIC))
seg=src[120:180]; seq=seg+seg[::-1]   # trecho único em vai-e-volta: sem cortes
frames=[]
for t in range(330):
    x=int(160+140*math.sin(t/14)+8*math.sin(t*1.9)); y=int(120+60*math.sin(t/19)+6*math.cos(t*2.3))
    frames.append(np.ascontiguousarray(seq[t%len(seq)][y:y+540, x:x+960]))
kw=dict(mode='ai',quality='fast',backend='cpu',ai_noise=.3,ai_sharp=.15,ai_restore=.35,ai_realtime=True)
if 'ai_auto' in {f.name for f in dataclasses.fields(Settings)}: kw['ai_auto']=True
s=Settings(True,.8,**kw)
live=LiveAI(factory=lambda b,q,d: Jittery('cpu',q,0)); mags=[]; st=collections.Counter()
for i,f in enumerate(frames):
    t0=time.perf_counter(); out,info=live.process(f,s,i+1,t0)
    if i>=20: mags.append(float(cv2.absdiff(out,f).mean())); st[info['ai_state']]+=1
    time.sleep(max(0,1/30-(time.perf_counter()-t0)))
live.close()
m=np.array(mags); med=np.median(m); j=np.abs(np.diff(m))
print(json.dumps({'estados':dict(st),'quadros_com_veu(<60%)':int(np.sum(m<.6*med)),'saltos_de_forca>5':int(np.sum(j>5)),'salto_max':round(float(j.max()),1)},ensure_ascii=False))
