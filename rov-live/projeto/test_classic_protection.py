import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import cv2,numpy as np
from processing import Enhancer,Settings

def test_dehaze_preserves_neutral_chroma_with_tinted_veil():
    f=np.full((180,320,3),(150,149,151),np.uint8)
    f[20:90,20:110]=(240,220,190)
    f[100:160,130:230]=(25,30,25)
    y=Enhancer().process(f,Settings(haze=1,color=0,contrast=1))
    a=cv2.cvtColor(f,cv2.COLOR_BGR2YCrCb)[:,:,1:].astype(int)
    b=cv2.cvtColor(y,cv2.COLOR_BGR2YCrCb)[:,:,1:].astype(int)
    assert np.max(abs(a[:,240:]-b[:,240:]))<=2

def test_custom_profile_does_not_reset_manual_adjustment():
    from PySide6.QtWidgets import QApplication
    from app import Window
    app=QApplication.instance() or QApplication([]);w=Window()
    w.motor.setCurrentIndex(1);w.profile.setCurrentIndex(0)
    assert w.profile.currentText()=='Água turva'
    w.haze.setValue(75)
    assert w.profile.currentText()=='Personalizado' and w.haze.value()==75
    w.profile.setCurrentIndex(1)
    assert w.profile.currentText()=='Névoa forte' and w.haze.value()==95
    w.denoise.setChecked(True)
    assert w.profile.currentText()=='Personalizado'
    assert w.contrast.maximum()==2
    w.close()
