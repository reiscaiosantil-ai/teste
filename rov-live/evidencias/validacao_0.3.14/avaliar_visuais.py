import sys, json, numpy as np, cv2
R='/home/user/rov/ROV_Live_Transferencia_Codex/'
sys.path.insert(0,R+'projeto'); sys.path.insert(0,R+'evidencias/validacao_0.3.13')
cv2.setNumThreads(2)
import cena
from processing import Enhancer, Settings
kw=dict(mode='ai',quality='detail',backend='cpu')
P={'0.3.13 Natural':Settings(True,.8,ai_noise=.3,ai_sharp=.15,ai_restore=.35,**kw),
   '0.3.14 Automatico':Settings(True,.8,ai_noise=.3,ai_sharp=.15,ai_restore=.35,ai_auto=True,ai_dehaze=.5,**kw),
   '0.3.14 Maxima visibilidade':Settings(True,.8,ai_noise=.35,ai_sharp=.35,ai_restore=.45,ai_color=.4,ai_contrast=.7,ai_dehaze=.9,**kw)}
print('preset: ssim corr ratio falso dE')
for n,s in P.items():
    rows=[]
    for sd in (0,1,2):
        J,d=cena.scene(sd); e=Enhancer()
        for k in range(6): out=e.process(cena.degrade(J,d,seed=100*sd+k),s,1/30)
        rows.append((cena.ssim(out,J),*cena.detail(out,J),cena.color_err(out,J)))
    print(n,[round(float(v),3) for v in np.array(rows).mean(0)])
# real video: flicker + image
cap=cv2.VideoCapture(R+'projeto/dados/amostra_1080p.mp4'); frames=[]
while len(frames)<90:
    ok,f=cap.read()
    if not ok: break
    frames.append(f)
outs={}
for n,s in P.items():
    e=Enhancer(); m=[]
    for f in frames:
        o=e.process(f,s,1/30); m.append(float(o[200:900].mean()))
    m=np.array(m[10:]); outs[n]=o
    print(n,'tremulacao (dp da diferenca de brilho entre quadros):',round(float(np.diff(m).std()),3),'brilho medio',round(float(m.mean()),1))
def lab(x,t):
    x=x.copy(); cv2.rectangle(x,(0,0),(900,80),(0,0,0),-1); cv2.putText(x,t,(20,58),cv2.FONT_HERSHEY_SIMPLEX,1.7,(255,255,255),3); return x
imgs=[lab(frames[-1],'Original')]+[lab(v,k) for k,v in outs.items()]
g=np.vstack([np.hstack(imgs[:2]),np.hstack(imgs[2:])])
cv2.imwrite('comparacao_0314.jpg',cv2.resize(g,None,fx=.5,fy=.5,interpolation=cv2.INTER_AREA),[cv2.IMWRITE_JPEG_QUALITY,90])
