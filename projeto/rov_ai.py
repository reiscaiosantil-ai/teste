"""Experimental ROV-specific correction transfer from a pretrained WaterNet.
Not a newly trained network; not validated for inspection or live operation.
"""
from pathlib import Path
import os
import sys
import cv2
import numpy as np

_ADAPTERS = None


def list_adapters():
    """DXGI adapters in EnumAdapters1 order, the order DirectML's device_id uses.

    Returns [{'index', 'name', 'vendor', 'dedicated_mb', 'shared_mb', 'software'}].
    Empty off Windows or on failure; never raises.
    """
    global _ADAPTERS
    if _ADAPTERS is not None:
        return _ADAPTERS
    adapters = []
    if sys.platform == 'win32':
        try:
            import ctypes
            import uuid

            class DESC1(ctypes.Structure):
                _fields_ = [('Description', ctypes.c_wchar * 128), ('VendorId', ctypes.c_uint),
                            ('DeviceId', ctypes.c_uint), ('SubSysId', ctypes.c_uint),
                            ('Revision', ctypes.c_uint), ('DedicatedVideoMemory', ctypes.c_size_t),
                            ('DedicatedSystemMemory', ctypes.c_size_t),
                            ('SharedSystemMemory', ctypes.c_size_t), ('LuidLow', ctypes.c_uint),
                            ('LuidHigh', ctypes.c_int), ('Flags', ctypes.c_uint)]

            def call(pointer, index, argtypes, *args):
                table = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))[0]
                return ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *argtypes)(table[index])(pointer, *args)

            iid = (ctypes.c_ubyte * 16).from_buffer_copy(
                uuid.UUID('770aae78-f26f-4dba-a829-253c83d1b387').bytes_le)
            factory = ctypes.c_void_p()
            if ctypes.windll.dxgi.CreateDXGIFactory1(ctypes.byref(iid), ctypes.byref(factory)) >= 0:
                vendors = {0x10DE: 'NVIDIA', 0x1002: 'AMD', 0x1022: 'AMD', 0x8086: 'Intel',
                           0x1414: 'Microsoft', 0x5143: 'Qualcomm'}
                for index in range(16):
                    adapter = ctypes.c_void_p()
                    # IDXGIFactory1::EnumAdapters1 = 12; IDXGIAdapter1::GetDesc1 = 10.
                    if call(factory, 12, (ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p)),
                            index, ctypes.byref(adapter)) < 0:
                        break
                    desc = DESC1()
                    if call(adapter, 10, (ctypes.POINTER(DESC1),), ctypes.byref(desc)) >= 0:
                        adapters.append({'index': index, 'name': desc.Description.strip(),
                                         'vendor': vendors.get(desc.VendorId, hex(desc.VendorId)),
                                         'dedicated_mb': desc.DedicatedVideoMemory // 2**20,
                                         'shared_mb': desc.SharedSystemMemory // 2**20,
                                         'software': bool(desc.Flags & 2) or desc.VendorId == 0x1414})
                    call(adapter, 2, ())
                call(factory, 2, ())
        except Exception:
            adapters = []
    _ADAPTERS = adapters
    return adapters


def best_adapter(adapters=None):
    """Hardware adapter with the most dedicated memory (a discrete 8 GB card
    beats an integrated GPU even if Windows lists the integrated one first)."""
    candidates = [a for a in (list_adapters() if adapters is None else adapters) if not a['software']]
    if not candidates:
        return None
    return max(candidates, key=lambda a: (a['dedicated_mb'], -a['index']))


def adapter_label(adapter):
    if adapter is None:
        return ''
    memory = adapter['dedicated_mb']
    size = f'{memory / 1024:.0f} GB' if memory >= 1024 else f'{memory} MB'
    return f"{adapter['name']} ({size} dedicada)"


class RovAI:
    def __init__(self, backend='auto', quality='fast', device_id=0):
        import onnxruntime as ort
        opts=ort.SessionOptions();opts.intra_op_num_threads=int(os.environ.get('ROV_ORT_THREADS', 2))
        opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
        opts.enable_mem_pattern=False
        model=str(Path(__file__).parent/('models/waternet_fast.onnx' if quality=='fast' else 'models/waternet.onnx'))
        self.adapter=None
        self.fallback=''
        self.session=None
        if backend=='auto' and 'DmlExecutionProvider' in ort.get_available_providers():
            device_id=int(device_id)
            adapters=list_adapters()
            if device_id<0:
                self.adapter=best_adapter(adapters)
                device_id=self.adapter['index'] if self.adapter else 0
            else:
                self.adapter=next((a for a in adapters if a['index']==device_id),None)
            try:
                self.session=ort.InferenceSession(model,sess_options=opts,
                    providers=[('DmlExecutionProvider',{'device_id':device_id}),'CPUExecutionProvider'])
            except Exception as exc:
                # A driver/adapter problem must not leave the operator without IA.
                self.fallback=f'DirectML indisponível ({type(exc).__name__}); usando CPU'
                self.adapter=None
        if self.session is None:
            self.session=ort.InferenceSession(model,sess_options=opts,providers=['CPUExecutionProvider'])
        self.providers=self.session.get_providers()
        if self.providers[0]!='DmlExecutionProvider':
            self.adapter=None
        self.nh,self.nw=self.session.get_inputs()[0].shape[2:]
        self.clahe=cv2.createCLAHE(clipLimit=.1,tileGridSize=(8,8))

    @property
    def description(self):
        """Executor actually used, with the GPU name when DirectML is active."""
        text='/'.join(self.providers)
        if self.adapter:
            text+=' • GPU '+adapter_label(self.adapter)
        return text+(' • '+self.fallback if self.fallback else '')

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
