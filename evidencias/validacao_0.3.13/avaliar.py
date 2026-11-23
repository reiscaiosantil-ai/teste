import sys, json, numpy as np, cv2
sys.path.insert(0, sys.argv[1]); sys.path.insert(0, '.')
cv2.setNumThreads(2)
import cena
from processing import Enhancer, Settings
import dataclasses
def evaluate(enh_factory, settings, seeds=(0,1,2), frames=6):
    rows=[]
    for sd in seeds:
        J,d=cena.scene(sd)
        e=enh_factory()
        for k in range(frames):          # alguns quadros (ruído novo) para a parte temporal
            I=cena.degrade(J,d,seed=100*sd+k)
            out=e.process(I,settings,1/30)
        rows.append((cena.ssim(out,J),*cena.detail(out,J),cena.color_err(out,J),
                     cena.ssim(I,J),*cena.detail(I,J),cena.color_err(I,J)))
    r=np.array(rows).mean(0)
    return dict(ssim=r[0],det_corr=r[1],det_ratio=r[2],det_falso=r[3],cor_dE=r[4],
                ent_ssim=r[5],ent_corr=r[6],ent_ratio=r[7],ent_falso=r[8],ent_dE=r[9])
if __name__=='__main__':
    kw=dict(mode='ai',quality='detail',backend='cpu',ai_noise=.3,ai_sharp=.15,ai_restore=.35)
    names={f.name for f in dataclasses.fields(Settings)}
    if 'ai_auto' in names: kw['ai_auto']=True
    s=Settings(True,.8,**kw)
    r=evaluate(Enhancer,s)
    print(json.dumps({k:round(v,3) for k,v in r.items()}))
