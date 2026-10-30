"""Experimental ROV-specific correction transfer from a pretrained WaterNet.
Not a newly trained network; not validated for inspection or live operation.
"""
from pathlib import Path
import cv2
import numpy as np

class RovAI:
    def __init__(self, backend='auto', quality='fast', device_id=0):
        import onnxruntime as ort
        opts=ort.SessionOptions();opts.intra_op_num_threads=2
        opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
        opts.enable_mem_pattern=False
        providers=['CPUExecutionProvider']
        if backend=='auto' and 'DmlExecutionProvider' in ort.get_available_providers():
            providers=[('DmlExecutionProvider',{'device_id':int(device_id)}),'CPUExecutionProvider']
        self.session=ort.InferenceSession(str(Path(__file__).parent/('models/waternet_fast.onnx' if quality=='fast' else 'models/waternet.onnx')),sess_options=opts,providers=providers)
        self.providers=self.session.get_providers()
        self.nh,self.nw=self.session.get_inputs()[0].shape[2:]
        self.clahe=cv2.createCLAHE(clipLimit=.1,tileGridSize=(8,8))

    def estimate(self, frame):
        if frame.dtype!=np.uint8 or frame.ndim!=3 or frame.shape[2]!=3:
            raise ValueError('Esperado quadro BGR uint8.')
        h,w=frame.shape[:2];scale=min(self.nw/w,self.nh/h)
        sw,sh=max(1,round(w*scale)),max(1,round(h*scale))
        small=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB),(sw,sh),interpolation=cv2.INTER_AREA)
        left,top=(self.nw-sw)//2,(self.nh-sh)//2
        rgb=cv2.copyMakeBorder(small,top,self.nh-sh-top,left,self.nw-sw-left,cv2.BORDER_REPLICATE)
        # Robust version of the upstream color balance: bounded quantiles,
        # no division by zero on dark/constant channels.
        sums=rgb.astype(np.float64).sum(axis=(0,1));ratio=sums.max()/np.maximum(sums,1)
        wb=np.empty_like(rgb)
        for c in range(3):
            q=min(.005*ratio[c],.1);lo,hi=np.quantile(rgb[:,:,c],[q,1-q])
            wb[:,:,c]=rgb[:,:,c] if hi-lo<1 else np.clip((rgb[:,:,c].astype(np.float32)-lo)*255/(hi-lo),0,255).astype(np.uint8)
        gc=np.clip((rgb.astype(np.float32)/255)**.7*255,0,255).astype(np.uint8)
        lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB);lab[:,:,0]=self.clahe.apply(lab[:,:,0]);he=cv2.cvtColor(lab,cv2.COLOR_LAB2RGB)
        feeds={name:np.ascontiguousarray(a.transpose(2,0,1)[None],dtype=np.float32)/255 for name,a in zip(['rgb','wb','he','gc'],[rgb,wb,he,gc])}
        out=self.session.run(None,feeds)[0][0].transpose(1,2,0)
        if not np.isfinite(out).all():raise RuntimeError('Saída da IA inválida.')
        # Transfer a smooth, bounded correction, not low-resolution textures.
        delta=np.clip(out*255-rgb.astype(np.float32),-80,80)
        delta=cv2.GaussianBlur(delta,(5,5),1.2)[top:top+sh,left:left+sw]
        return (np.ascontiguousarray(delta[:, :, ::-1]),
                np.ascontiguousarray(small[:, :, ::-1]))

    @staticmethod
    def apply(frame, delta, strength=.8):
        if not np.isfinite(strength) or not 0 <= strength <= 1:
            raise ValueError('Intensidade entre 0 e 1.')
        if strength == 0:
            return frame.copy()
        h, w = frame.shape[:2]
        # Quantize only the small correction map; avoid full-frame float copies.
        small = np.rint(delta * strength).astype(np.int16)
        large = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.add(frame, large, dtype=cv2.CV_8U)

    def process(self, frame, strength=.8):
        if frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError('Esperado quadro BGR uint8.')
        if not np.isfinite(strength) or not 0 <= strength <= 1:
            raise ValueError('Intensidade entre 0 e 1.')
        if strength == 0 or not np.any(frame):
            return frame.copy()
        delta, _ = self.estimate(frame)
        return self.apply(frame, delta, strength)

if __name__=='__main__':
    import argparse,json,time
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--strength',type=float,default=.8);p.add_argument('--cpu',action='store_true');a=p.parse_args()
    cv2.setNumThreads(2)
    f=cv2.imdecode(np.fromfile(a.input,dtype=np.uint8),cv2.IMREAD_COLOR)
    if f is None:raise SystemExit('Não foi possível abrir a imagem.')
    model=RovAI('cpu' if a.cpu else 'auto');t=time.perf_counter();result=model.process(f,a.strength)
    ok,b=cv2.imencode('.png',np.hstack([f,result]));assert ok;b.tofile(a.output)
    print(json.dumps({'providers':model.providers,'first_frame_ms':round((time.perf_counter()-t)*1000,1),'comparison':a.output},ensure_ascii=False))
