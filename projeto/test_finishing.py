import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import cv2,numpy as np
from processing import finish_ai

def test_zero_exact_and_no_mutation():
    f=np.random.default_rng(9).integers(0,256,(90,160,3),dtype=np.uint8);saved=f.copy()
    assert np.array_equal(finish_ai(f,0,0),f)
    finish_ai(f,.3,.15);assert np.array_equal(f,saved)

def test_noise_reduction_on_flat_patch():
    f=np.clip(np.random.default_rng(4).normal(120,7,(128,128,3)),0,255).astype(np.uint8)
    out=finish_ai(f,.7,0)
    assert out[10:-10,10:-10].std()<f[10:-10,10:-10].std()*.8
    assert abs(float(out.mean())-float(f.mean()))<1

def test_sharpness_bounded_and_flat_exact():
    f=np.full((100,160,3),100,np.uint8);f[:,80:]=180
    f=cv2.GaussianBlur(f,(7,7),1.3)
    out=finish_ai(f,0,.5)
    assert np.max(abs(out.astype(int)-f.astype(int)))<=5
    assert not np.array_equal(out,f)
    flat=np.full_like(f,120);assert np.array_equal(finish_ai(flat,.3,.15),flat)

def test_controls_apply_to_ai_and_disable_for_classic():
    from PySide6.QtWidgets import QApplication
    from app import Window
    app=QApplication.instance() or QApplication([]);w=Window()
    assert w.settings().ai_noise==.3 and w.settings().ai_sharp==.15
    w.ai_noise.setValue(0);w.ai_sharp.setValue(0)
    assert w.settings().ai_noise==w.settings().ai_sharp==0
    w.motor.setCurrentIndex(1);assert not w.ai_noise.isEnabled()
    w.close()
