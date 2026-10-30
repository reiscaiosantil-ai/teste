import cv2
import numpy as np
import pytest
from temporal_restore import TemporalRestorer, working_frame, lift_change, limit_added_chroma


def textured():
    f = np.random.default_rng(22).integers(60,140,(120,192,3),dtype=np.uint8)
    return cv2.GaussianBlur(f,(7,7),1.6)


def test_zero_and_black_exact_no_mutation():
    f=textured();saved=f.copy();r=TemporalRestorer()
    assert np.array_equal(r.clean(f,0,1/30),f)
    r.clean(f,.5,1/30)
    assert np.array_equal(f,saved)
    blank=np.zeros_like(f)
    assert np.array_equal(r.clean(blank,.5,1/30),blank)
    assert np.array_equal(r.clarify(blank,.5,1/30),blank)


def test_static_bright_transient_is_reduced_using_two_observations():
    f=np.full((120,192,3),100,np.uint8);r=TemporalRestorer()
    r.clean(f,.8,1/30);r.clean(f,.8,1/30)
    current=f.copy();current[60,90]=230
    y=r.clean(current,.8,1/30)
    assert y[60,90,0]<current[60,90,0]-40
    # Bounded: at most 70 levels and never below the earlier aligned observations.
    assert y[60,90,0]>=max(100, int(current[60,90,0])-70)
    assert r.metrics['particle_fraction']>0
    assert np.array_equal(y[75:90,120:150],current[75:90,120:150])


def test_independent_noise_is_reduced_against_known_flat_reference():
    rng=np.random.default_rng(129)
    r=TemporalRestorer()
    for _ in range(3):
        current=np.clip(rng.normal(110,3,(120,192,3)),0,255).astype(np.uint8)
        result=r.clean(current,.8,1/30)
    region=(slice(20,-20),slice(20,-20))
    before=np.mean((current[region].astype(float)-110)**2)
    after=np.mean((result[region].astype(float)-110)**2)
    assert after < before*.85


def test_persistent_small_highlight_is_preserved():
    f=np.full((120,192,3),100,np.uint8);f[60,90]=230
    r=TemporalRestorer()
    for _ in range(4):result=r.clean(f,.8,1/30)
    assert np.array_equal(result[60,90],f[60,90])
    assert r.metrics['particle_fraction']==0


def test_hud_and_new_edge_are_not_replaced_with_old_pixels():
    f=np.full((120,192,3),100,np.uint8);r=TemporalRestorer()
    r.clean(f,.8,1/30);r.clean(f,.8,1/30)
    current=f.copy();current[2:9,3:80]=230;current[-9:-2,70:140]=220
    current[50:80,80:120]=190
    y=r.clean(current,.8,1/30)
    assert np.array_equal(y[:14],current[:14])
    assert np.array_equal(y[-12:],current[-12:])
    assert np.array_equal(y[55:75,90:110],current[55:75,90:110])


@pytest.mark.parametrize('gap',[0,.5])
def test_time_gap_restarts_history(gap):
    f=textured();r=TemporalRestorer()
    r.clean(f,.5,1/30);r.clean(f,.5,1/30)
    current=cv2.add(f,(3,3,3,0))
    assert np.array_equal(r.clean(current,.5,gap),current)
    assert r.older is None


def test_cut_and_resolution_change_restart_history():
    r=TemporalRestorer();f=textured();r.clean(f,.5,1/30)
    changed=np.full_like(f,230)
    assert np.array_equal(r.clean(changed,.5,1/30),changed)
    smaller=cv2.resize(changed,(96,60))
    assert np.array_equal(r.clean(smaller,.5,1/30),smaller)


def test_lifting_difference_preserves_original_fine_texture():
    f=textured();f=cv2.resize(f,(1920,1080))
    work=working_frame(f);assert work.shape==(360,640,3)
    assert np.array_equal(lift_change(f,work,work.copy()),f)
    restored=cv2.add(work,(5,5,5,0))
    out=lift_change(f,work,restored)
    assert np.array_equal(out,cv2.add(f,(5,5,5,0)))
    r=TemporalRestorer();r.clean(work,.5,1/30)
    assert r.previous.shape[:2]==(270,480)


def test_clarification_is_bounded_and_does_not_add_texture_to_flat_image():
    r=TemporalRestorer();f=textured();f[:,96:]=170
    y=r.clarify(f,.5,1/30)
    assert np.max(abs(y.astype(int)-f.astype(int)))<=16
    flat=np.full_like(f,120)
    assert np.array_equal(r.clarify(flat,.5,1/30),flat)
    with pytest.raises(ValueError):r.clean(f,float('nan'),1/30)


def test_chroma_cap_limits_new_color_without_changing_shape():
    original=np.full((120,192,3),110,np.uint8)
    enhanced=np.full_like(original,(150,80,150))
    y=limit_added_chroma(original,enhanced,.5)
    before=cv2.cvtColor(enhanced,cv2.COLOR_BGR2YCrCb)[:,:,1:].astype(int)-128
    after=cv2.cvtColor(y,cv2.COLOR_BGR2YCrCb)[:,:,1:].astype(int)-128
    assert np.abs(after).mean()<np.abs(before).mean()*.6
    assert np.array_equal(limit_added_chroma(original,enhanced,0),enhanced)


def test_ui_restoration_control_applies_and_disables_in_classic():
    from PySide6.QtWidgets import QApplication
    from app import Window
    qt=QApplication.instance() or QApplication([]);w=Window()
    try:
        assert w.settings().ai_restore==.35
        w.ai_restore.setValue(0);assert w.settings().ai_restore==0
        w.motor.setCurrentIndex(1);assert not w.ai_restore.isEnabled()
    finally:w.close()


def test_export_with_temporal_restoration_keeps_every_frame(tmp_path):
    from test_rov import make_video
    from export_video import export
    source=make_video(tmp_path,4);dest=tmp_path/'temporal.mp4'
    assert export(source,dest,backend='cpu',restore=.5)==4
    c=cv2.VideoCapture(str(dest));count=0
    while True:
        ok,_=c.read()
        if not ok:break
        count+=1
    c.release();assert count==4


def test_motion_fallback_is_labeled_temporal_without_old_scene_pixels():
    import time
    from dataclasses import replace
    from processing import Settings
    from live_ai import LiveAI, Correction
    class NoResult:
        providers=['TEST']
        def __init__(self,*_):pass
        def estimate(self,f):
            time.sleep(.15)
            return np.zeros(f.shape,np.float32),f.copy()
    live=LiveAI(NoResult);f=textured();f[:,96:]=180
    # Core bounds without the 0.3.6 color/local-contrast stage (tested separately).
    s=Settings(mode='ai',ai_realtime=True,ai_restore=.5,ai_color=0,ai_contrast=0)
    try:
        # A pending neural analysis need not stop the conventional restoration.
        output,info=live.process(f,s,1,time.perf_counter())
        assert info['ai_state']=='temporal' and info['ai_reason']=='waiting'
        # 20 (was 16): the 0.3.6 water-tint removal shifts chroma a few levels.
        assert output.shape==f.shape and np.max(abs(output.astype(int)-f.astype(int)))<=20
        # Expired correction is never reused. Temporal-only stage remains clear.
        with live.condition:
            live.result=Correction(live.epoch,live.key,1,time.perf_counter()-3,
                np.full(f.shape,80,np.float32),f.copy(),50,('TEST',))
        output,info=live.process(f,s,2,time.perf_counter())
        assert info['ai_state']=='temporal' and info['ai_reason']=='expired'
        assert np.max(abs(output.astype(int)-f.astype(int)))<=20
    finally:live.close()
