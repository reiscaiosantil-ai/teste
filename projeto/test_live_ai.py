import time
from dataclasses import replace
import cv2
import numpy as np
import pytest
from live_ai import LiveAI, Correction, transfer
from processing import Settings, finish_ai
from rov_ai import RovAI


def scene():
    f = np.random.default_rng(32).integers(40,160,(72,128,3),dtype=np.uint8)
    return cv2.GaussianBlur(f,(5,5),1)


def correction(f, received=10):
    delta=np.full(f.shape,12,np.float32)
    return Correction(0,('detail','cpu',0),1,received,delta,f.copy(),100,('test',))


def test_transfer_uses_current_pixels_and_bounded_correction():
    f=scene(); saved=f.copy()
    y,state,_,_=transfer(f,correction(f),10.1,.8)
    assert state=='applied' and np.array_equal(f,saved)
    assert y.shape==f.shape and y.dtype==np.uint8
    assert np.max(abs(y.astype(int)-f.astype(int)))<=10
    assert float(y[8:-8,8:-8].mean()-f[8:-8,8:-8].mean())>7


def test_unmatched_or_aging_correction_falls_back_to_coarse_veil_not_original():
    """0.3.10: no white flash. Without a local match (fast motion) or after the
    detailed budget, only the coarse 8×5 veil correction is applied: smooth,
    bounded, and unable to carry structure from the analyzed frame."""
    f = scene()
    unrelated = correction(np.full_like(f, 240))
    unrelated = replace(unrelated, delta=np.random.default_rng(1).normal(12, 20, f.shape).astype(np.float32))
    y, state, _, _ = transfer(f, unrelated, 10.1, .8)
    assert state == 'global'
    change = y.astype(int) - f.astype(int)
    # The veil part survives, reduced to 35% because the analyzed frame had a
    # very different brightness (lights/cut): 12 × 0.8 × 0.35 ≈ 3.4 levels.
    assert 2.5 < change[8:-8, 8:-8].mean() < 4.5
    assert np.abs(cv2.Laplacian(change.astype(np.float32), cv2.CV_32F)).mean() < 2  # smooth
    old = correction(f)
    assert transfer(f, old, 11, .8)[1] == 'global'
    y, state, _, _ = transfer(f, old, 13.1, .8)  # beyond 3 s: original
    assert state == 'expired' and np.array_equal(y, f)


def test_age_budget_tracks_slow_analysis_but_has_absolute_limit():
    f = scene()
    slow = replace(correction(f), milliseconds=700)
    # Detailed budget min(1.2, max(0.5, 3 × analysis + 0.15)) s, then coarse up to 3 s.
    assert transfer(f, slow, 11.1, .8)[1] == 'applied'
    assert transfer(f, slow, 11.3, .8)[1] == 'global'
    assert transfer(f, slow, 13.1, .8)[1] == 'expired'


def test_translated_scene_matches_only_color_not_old_scene_pixels():
    f=scene();m=np.float32([[1,0,3],[0,1,0]])
    new=cv2.warpAffine(f,m,(128,72),borderMode=cv2.BORDER_REPLICATE)
    delta=np.zeros_like(f,dtype=np.float32);delta[:,64:]=20
    c=replace(correction(f),delta=delta)
    y,state,_,_=transfer(new,c,10.15,.8)
    assert state=='applied'
    assert np.mean(abs(y[:,8:45].astype(int)-new[:,8:45].astype(int)))<1
    assert np.mean(y[8:-8,85:-8].astype(int)-new[8:-8,85:-8].astype(int))>12


class SlowModel:
    providers=['TEST']
    def __init__(self,*_): pass
    def estimate(self,f):
        time.sleep(.18)
        return np.full(f.shape,10,np.float32),f.copy()


def wait_result(live,timeout=2):
    until=time.perf_counter()+timeout
    while time.perf_counter()<until:
        if live.result is not None or live.error: return
        time.sleep(.005)
    raise AssertionError('No result')


def test_slow_inference_does_not_block_display_and_mailbox_is_latest():
    live=LiveAI(SlowModel);f=scene();s=Settings(mode='ai',quality='detail',ai_realtime=True)
    try:
        times=[]
        for i in range(15):
            now=time.perf_counter();y,info=live.process(f,s,i,now)
            times.append(time.perf_counter()-now)
            time.sleep(.01)
        assert max(times)<.12
        with live.condition:
            assert live.pending is None or live.pending[2]>=12
        wait_result(live)
        y,info=live.process(f,s,16,time.perf_counter())
        assert info['ai_state']=='applied' and not np.array_equal(y,f)
        assert info['processor'].startswith('IA WaterNet')
    finally: live.close()
    assert not live.thread.is_alive()


def test_cut_and_backend_change_invalidate_inflight_result():
    live=LiveAI(SlowModel);f=scene();s=Settings(mode='ai',ai_realtime=True)
    try:
        live.process(f,s,1,time.perf_counter());time.sleep(.04)
        bright=np.full_like(f,245)
        y,info=live.process(bright,s,2,time.perf_counter())
        assert np.array_equal(y,bright) and info['ai_state']=='waiting'
        time.sleep(.15)
        assert live.result is None
        wait_result(live)
        y,info=live.process(bright,replace(s,backend='cpu'),3,time.perf_counter())
        assert info['ai_state']=='waiting' and np.array_equal(y,bright)
    finally:live.close()


def test_async_failure_preserves_original():
    def fail(*_): raise RuntimeError('private details')
    live=LiveAI(fail);f=scene();s=Settings(mode='ai',ai_realtime=True)
    try:
        live.process(f,s,1,time.perf_counter());wait_result(live)
        y,info=live.process(f,s,2,time.perf_counter())
        assert np.array_equal(y,f) and info['filter_error']
        assert 'private' not in info['processor']
    finally:live.close()


def test_black_frame_cannot_receive_cached_or_inflight_correction():
    live = LiveAI(SlowModel)
    s = Settings(mode='ai', ai_realtime=True)
    try:
        live.process(scene(), s, 1, time.perf_counter())
        blank = np.zeros((72,128,3), np.uint8)
        y, info = live.process(blank, s, 2, time.perf_counter())
        assert not y.any() and info['ai_state'] == 'black'
        time.sleep(.2)
        assert live.result is None
    finally:
        live.close()


def test_speck_control_is_optional_bounded_and_preserves_large_edges():
    f=np.full((90,160,3),80,np.uint8)
    f[10:70,90:150]=180
    f[35,35]=230
    original=f.copy();y=finish_ai(f,0,0,.5)
    assert np.array_equal(f,original)
    assert np.array_equal(finish_ai(f,0,0,0),f)
    assert y[35,35,0]<f[35,35,0] and np.max(f.astype(int)-y.astype(int))<=20
    assert np.array_equal(f[:,90:150],y[:,90:150])
    with pytest.raises(ValueError):finish_ai(f,0,0,float('nan'))


def test_detailed_estimate_apply_matches_sync_path():
    f=scene();m=RovAI('cpu','detail')
    delta,guide=m.estimate(f)
    direct=m.process(f,.8)
    assert np.array_equal(direct,m.apply(f,delta,.8))
    assert guide.dtype==np.uint8 and delta.shape==guide.shape


def test_ui_detailed_fluid_default_and_optional_specks():
    from PySide6.QtWidgets import QApplication
    from app import Window
    qt = QApplication.instance() or QApplication([])
    w = Window()
    try:
        assert w.settings().quality == 'detail'
        assert w.settings().ai_realtime and w.settings().ai_specks == 0
        w.ai_specks.setValue(25)
        assert w.settings().ai_specks == .25
        w.ai_realtime.setChecked(False)
        assert not w.settings().ai_realtime
        w.motor.setCurrentIndex(1)
        assert not w.ai_specks.isEnabled() and not w.ai_realtime.isEnabled()
    finally:
        w.close()
