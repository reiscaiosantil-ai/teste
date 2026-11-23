"""Cenas sintéticas com verdade conhecida + modelo físico de água turva."""
import numpy as np, cv2

def scene(seed=0, W=960, H=540):
    rng=np.random.default_rng(seed)
    J=np.zeros((H,W,3),np.float32)
    # fundo: estrutura metálica com ferrugem (texturas multi-escala)
    for s,a in [(40,.5),(12,.3),(3,.15),(1,.08)]:
        n=cv2.GaussianBlur(rng.random((H,W)).astype(np.float32),(0,0),s); n=(n-n.mean())/(n.std()+1e-6)
        J+=a*n[:,:,None]
    J=J*30+np.array([70,95,120],np.float32)   # tom ferrugem/bege (BGR)
    # vigas e cabos (bordas fortes e finas)
    for k in range(6):
        p1=(int(rng.integers(0,W)),int(rng.integers(0,H))); p2=(int(rng.integers(0,W)),int(rng.integers(0,H)))
        c=tuple(float(v) for v in rng.integers(150,235,3)); cv2.line(J,p1,p2,c,int(rng.integers(6,30)),cv2.LINE_AA)
    for k in range(10):
        p1=(int(rng.integers(0,W)),int(rng.integers(0,H))); p2=(int(rng.integers(0,W)),int(rng.integers(0,H)))
        cv2.line(J,p1,p2,(40,40,45),int(rng.integers(1,4)),cv2.LINE_AA)
    # marcações finas (texto de placa, solda)
    for k in range(6):
        cv2.putText(J,'N%03d-%d'%(rng.integers(0,999),k),(int(rng.integers(20,W-200)),int(rng.integers(60,H-20))),cv2.FONT_HERSHEY_SIMPLEX,float(rng.uniform(.5,1.2)),(25,25,30),2,cv2.LINE_AA)
    J=np.clip(J,0,255)
    # profundidade: rampa + objetos mais próximos onde há vigas claras
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    d=2.0+3.5*(xx/W*.6+yy/H*.4)+ 1.0*cv2.GaussianBlur(rng.random((H,W)).astype(np.float32),(0,0),60)
    return J.astype(np.uint8), d

def degrade(J, d, seed=0, water=(150,140,60), beta=(.18,.22,.55), noise=2.5):
    """I = J·t + A·(1−t), t = exp(−β·d) por canal (BGR: vermelho some primeiro),
    + espalhamento frontal (desfoque crescente) + ruído do sensor."""
    rng=np.random.default_rng(seed)
    Jf=J.astype(np.float32)
    t=np.exp(-np.array(beta,np.float32)[None,None,:]*d[:,:,None])
    I=Jf*t+np.array(water,np.float32)*(1-t)
    blur=cv2.GaussianBlur(I,(0,0),1.6)
    w=np.clip((1-t.mean(2))*1.3,0,1)[:,:,None]
    I=I*(1-w)+blur*w
    I+=rng.normal(0,noise,I.shape)
    return np.clip(I,0,255).astype(np.uint8)

def _lum(x): return cv2.cvtColor(x,cv2.COLOR_BGR2GRAY).astype(np.float32)

def ssim(a,b):
    a,b=_lum(a),_lum(b)
    # normaliza média/contraste global: mede estrutura, não cor/brilho absolutos
    a=(a-a.mean())/(a.std()+1e-6)*40+128; b=(b-b.mean())/(b.std()+1e-6)*40+128
    C1,C2=(0.01*255)**2,(0.03*255)**2
    g=lambda x: cv2.GaussianBlur(x,(0,0),1.5)
    ma,mb=g(a),g(b); va=g(a*a)-ma*ma; vb=g(b*b)-mb*mb; cab=g(a*b)-ma*mb
    return float((((2*ma*mb+C1)*(2*cab+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2))).mean())

def detail(out,J):
    """Detalhe fino (passa-alta σ=1.5): correlação com a verdade, razão de
    contraste (1 = igual à verdade) e 'detalhe inventado' onde a verdade é lisa."""
    hp=lambda x: (lambda g: g-cv2.GaussianBlur(g,(0,0),1.5))(_lum(x))
    ho,hj=hp(out),hp(J)
    corr=float(np.corrcoef(ho.ravel(),hj.ravel())[0,1])
    ratio=float(ho.std()/(hj.std()+1e-6))
    flat=cv2.dilate((np.abs(hj)>2).astype(np.uint8),np.ones((7,7),np.uint8))==0
    fake=float(np.abs(ho[flat]).mean()) if flat.any() else 0.
    return corr,ratio,fake

def color_err(out,J):
    """Erro de cor (ΔE aproximado em Lab, média), após igualar brilho médio."""
    o=cv2.cvtColor(out,cv2.COLOR_BGR2LAB).astype(np.float32); j=cv2.cvtColor(J,cv2.COLOR_BGR2LAB).astype(np.float32)
    o[...,0]+=j[...,0].mean()-o[...,0].mean()
    return float(np.sqrt(((o-j)**2).sum(2)).mean())
