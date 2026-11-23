import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import time
from dataclasses import replace
import cv2,numpy as np,pytest
from processing import Enhancer,Settings
from engine import Session,Source
from test_rov import make_video,wait_packet

def test_ai_real_model_no_mutation_and_black():
    rng=np.random.default_rng(42);f=rng.integers(10,180,(90,160,3),dtype=np.uint8);saved=f.copy()
    e=Enhancer();s=Settings(mode='ai',backend='cpu',strength=.8)
    y=e.process(f,s)
    assert y.shape==f.shape and y.dtype==np.uint8
    assert np.array_equal(f,saved) and not np.array_equal(y,f)
    assert np.max(abs(y.astype(int)-f.astype(int)))<=65
    assert np.array_equal(e.process(f,replace(s,enabled=False)),f)
    assert not e.process(np.zeros_like(f),s).any()
    assert 'CPUExecutionProvider' in e.status

def test_ai_continuous_session(tmp_path):
    session=Session(Source('file',make_video(tmp_path,90),width=320,height=180),Settings(mode='ai',backend='cpu'))
    try:
        first=wait_packet(session);time.sleep(1);p=session.snapshot()
        assert p['seq']>first['seq'] and not p['filter_error']
        assert p['mode']=='ai' and 'CPUExecutionProvider' in p['processor']
    finally:session.close()
    assert not session.worker.is_alive() and not session.process.is_alive()

def test_ai_failure_preserves_original(tmp_path,monkeypatch):
    import rov_ai
    def fail(*a,**k):raise RuntimeError('modelo ausente')
    monkeypatch.setattr(rov_ai,'RovAI',fail)
    session=Session(Source('file',make_video(tmp_path)),Settings(mode='ai'))
    try:
        p=wait_packet(session);assert p['filter_error'];assert np.array_equal(p['enhanced'],p['original'])
    finally:session.close()

def test_export_all_frames_and_source_unchanged(tmp_path):
    from export_video import export
    import hashlib
    src=make_video(tmp_path,6);before=hashlib.sha256(open(src,'rb').read()).hexdigest()
    dest=tmp_path/'saida.mp4';assert export(src,dest,backend='cpu')==6
    c=cv2.VideoCapture(str(dest));count=0
    while True:
        ok,f=c.read()
        if not ok:break
        count+=1;assert f.shape==(180,320,3)
    assert count==6 and c.get(cv2.CAP_PROP_FPS)==30;c.release()
    assert hashlib.sha256(open(src,'rb').read()).hexdigest()==before
    assert not (tmp_path/'saida.mp4.rov-part.mp4').exists()
    with pytest.raises(ValueError):export(src,src)

def test_interface_ai_default_and_controls():
    from PySide6.QtWidgets import QApplication
    from app import Window
    app=QApplication.instance() or QApplication([]);w=Window()
    assert w.settings().mode=='ai' and not w.haze.isEnabled()
    w.motor.setCurrentIndex(1);assert w.haze.isEnabled() and w.settings().mode=='classic'
    w.close()

def test_gui_export_process(tmp_path,monkeypatch):
    from PySide6.QtWidgets import QApplication,QFileDialog
    from app import Window
    app=QApplication.instance() or QApplication([]);app.setQuitOnLastWindowClosed(False)
    src=make_video(tmp_path,4);dest=str(tmp_path/'gui.mp4')
    monkeypatch.setattr(QFileDialog,'getOpenFileName',lambda *a,**k:(src,''))
    monkeypatch.setattr(QFileDialog,'getSaveFileName',lambda *a,**k:(dest,''))
    w=Window();w.ai_backend.setCurrentIndex(1);w.export_video()
    deadline=time.perf_counter()+20
    while w.export_process and time.perf_counter()<deadline:
        app.processEvents();time.sleep(.02)
    assert w.export_process is None and w.start.isEnabled()
    assert (tmp_path/'gui.mp4').exists()
    assert 'Concluído' in w.export_status.text()
    w.close()
