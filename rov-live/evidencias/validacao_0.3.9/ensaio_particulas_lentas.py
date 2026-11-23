import sys, numpy as np, cv2, importlib.util
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path+'/temporal_restore.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
mods=[(n,load(p,'t'+n)) for n,p in zip(['0.3.4','0.3.8','novo'],sys.argv[1:4])]
H,W=1080,1920
def scene(seed):
    rng=np.random.default_rng(seed)
    big=cv2.GaussianBlur(rng.integers(40,170,(H+200,W+400,3),dtype=np.uint8),(0,0),6)
    big=cv2.addWeighted(big,1,cv2.GaussianBlur(rng.integers(0,60,(H+200,W+400,3),dtype=np.uint8),(0,0),1.5),.6,-15)
    for k in range(40):
        x,y=rng.integers(0,W+300),rng.integers(0,H+150)
        cv2.line(big,(int(x),int(y)),(int(x+rng.integers(-500,500)),int(y+rng.integers(-300,300))),tuple(int(v) for v in rng.integers(20,200,3)),int(rng.integers(2,8)),cv2.LINE_AA)
    return big
def run(mod, slow, amount=.35, frames=30, seed=7):
    rng=np.random.default_rng(seed); big=scene(1)
    r=mod.TemporalRestorer(); res=[]
    n=40
    pos=rng.uniform([30,140],[W-30,H-130],(n,2)); vel=rng.uniform(-1,1,(n,2)); vel=vel/np.linalg.norm(vel,axis=1,keepdims=True)*rng.uniform(3,7,(n,1))
    rad=rng.integers(2,7,n); val=rng.integers(40,90,n)
    for t in range(frames):
        truth=big[60:60+H, 2*t+100:2*t+100+W].copy()
        cur=cv2.add(truth, rng.normal(0,3,truth.shape).astype(np.int16), dtype=cv2.CV_8U)
        mask=np.zeros((H,W),np.uint8)
        if not slow: pos=rng.uniform([30,140],[W-30,H-130],(n,2))
        else: pos=pos+vel
        for i in range(n):
            spot=np.zeros((H,W),np.float32); cv2.circle(spot,(int(pos[i,0]),int(pos[i,1])),int(rad[i]),1.0,-1,cv2.LINE_AA); spot=cv2.GaussianBlur(spot,(0,0),1.0)
            cur=np.clip(cur+spot[:,:,None]*float(val[i]),0,255).astype(np.uint8); mask|=(spot>.05).astype(np.uint8)
        work=mod.working_frame(cur); cleaned=r.clean(work,amount,1/30)
        base,workb=(r.suppress(cur),r.suppress(work)) if getattr(r,'ceiling',None) is not None else (cur,work)
        if hasattr(r,'denoise'): base=r.denoise(base,.3)
        out=mod.lift_change(base,workb,cleaned)
        if t>=6:
            m=mask.astype(bool); o=~cv2.dilate(mask,np.ones((25,25),np.uint8)).astype(bool); o[:int(H*.12)]=False; o[-int(H*.1):]=False
            e_in=(cur[m].astype(float)-truth[m]).mean(); e_out=(out[m].astype(float)-truth[m]).mean()
            res.append((e_out/e_in, np.mean((out[o].astype(float)-truth[o])**2), np.mean((cur[o].astype(float)-truth[o])**2)))
    return np.mean(res,0)
for slow in (False,True):
    for name,mod in mods:
        a=run(mod,slow); print(f"{'lentas  ' if slow else 'rápidas '} {name:6s} partícula restante {a[0]*100:5.1f}% | MSE fora {a[2]:.2f} -> {a[1]:.2f}")
