import sys, numpy as np, cv2, importlib.util
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
B=load(sys.argv[1]+'/temporal_restore.py','tb'); N=load(sys.argv[2]+'/temporal_restore.py','tn')
rng=np.random.default_rng(7)
H,W=1080,1920
big=cv2.GaussianBlur(rng.integers(40,170,(H+200,W+400,3),dtype=np.uint8),(0,0),6)
big=cv2.addWeighted(big,1,cv2.GaussianBlur(rng.integers(0,60,(H+200,W+400,3),dtype=np.uint8),(0,0),1.5),.6,-15)
for k in range(40):  # structures/edges (cables, frames)
    x,y=rng.integers(0,W+300),rng.integers(0,H+150)
    cv2.line(big,(int(x),int(y)),(int(x+rng.integers(-500,500)),int(y+rng.integers(-300,300))),tuple(int(v) for v in rng.integers(20,200,3)),int(rng.integers(2,8)),cv2.LINE_AA)
def run(mod, amount, n=40, frames=30):
    r=mod.TemporalRestorer(); res=[]
    for t in range(frames):
        truth=big[60:60+H, 2*t+100:2*t+100+W].copy()
        noisy=cv2.add(truth, rng.normal(0,3,truth.shape).astype(np.int16), dtype=cv2.CV_8U)
        mask=np.zeros((H,W),np.uint8); cur=noisy.copy()
        for i in range(n):
            cx,cy=int(rng.integers(30,W-30)),int(rng.integers(140,H-130)); rad=int(rng.integers(2,7))
            spot=np.zeros((H,W),np.float32); cv2.circle(spot,(cx,cy),rad,1.0,-1,cv2.LINE_AA); spot=cv2.GaussianBlur(spot,(0,0),1.0)
            val=float(rng.integers(40,90)); cur=np.clip(cur+spot[:,:,None]*val,0,255).astype(np.uint8); mask|=(spot>.05).astype(np.uint8)
        work=mod.working_frame(cur)
        cleaned=r.clean(work,amount,1/30)
        if getattr(r,'ceiling',None) is not None:
            base=r.suppress(cur); workb=r.suppress(work)
        else: base,workb=cur,work
        out=mod.lift_change(base,workb,cleaned)
        if t>=5:
            m=mask.astype(bool); o=~cv2.dilate(mask,np.ones((9,9),np.uint8)).astype(bool)
            o[:int(H*.12)]=False; o[-int(H*.1):]=False
            e_in=(cur[m].astype(float)-truth[m]).mean(); e_out=(out[m].astype(float)-truth[m]).mean()
            res.append((e_out/e_in, np.mean((out[o].astype(float)-truth[o])**2), np.mean((cur[o].astype(float)-truth[o])**2)))
    a=np.array(res); return a.mean(0)
for amt in [.35,.6]:
    for name,mod in [('baseline',B),('novo',N)]:
        r=run(mod,amt); print(f'restauração {int(amt*100)}% {name:8s}: excesso de brilho restante nas partículas {r[0]*100:5.1f}% | MSE fora das partículas {r[2]:.2f} -> {r[1]:.2f}')
