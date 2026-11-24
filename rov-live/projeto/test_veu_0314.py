"""0.3.14: physical veil removal (I = J·t + A·(1 − t)) as a pointwise affine map."""
import time

import cv2
import numpy as np

import rov_ai
import veil
from processing import Enhancer, Settings


def veiled_scene(seed=5, t=.45, water=(150, 140, 90)):
    rng = np.random.default_rng(seed)
    truth = cv2.GaussianBlur(rng.integers(0, 255, (360, 640, 3), dtype=np.uint8), (0, 0), 6)
    truth = cv2.normalize(truth, None, 5, 200, cv2.NORM_MINMAX)
    cv2.rectangle(truth, (260, 140), (380, 220), (10, 10, 10), -1)      # dark target
    hazy = truth.astype(np.float32) * t + np.array(water, np.float32) * (1 - t)
    return truth, np.clip(hazy + rng.normal(0, 1.5, hazy.shape), 0, 255).astype(np.uint8)


def contrast(image):
    return float(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)[50:-50, 40:-40].astype(np.float32).std())


def test_veil_removal_restores_contrast_without_amplifying_flat_noise():
    truth, hazy = veiled_scene()
    remover = veil.VeilRemover()
    out, correction, strength = veil.restore(remover, hazy, None, .8, .9)
    assert correction.shape == (144, 256, 6) and strength == 1.
    assert contrast(out) > contrast(hazy) * 1.5          # veil removed
    assert contrast(out) < contrast(truth) * 1.25        # bounded: no over-shoot
    # Structure follows the truth better than the veiled input does not lose it.
    def corr(a):
        g = lambda x: cv2.cvtColor(x, cv2.COLOR_BGR2GRAY).astype(np.float32).ravel()
        return float(np.corrcoef(g(a), g(truth))[0, 1])
    assert corr(out) > .97
    # Flat veiled water: noise is not amplified by the gain.
    rng = np.random.default_rng(1)
    flat = np.clip(rng.normal((150, 140, 90), 2, (360, 640, 3)), 0, 255).astype(np.uint8)
    flat_out, _, _ = veil.restore(veil.VeilRemover(), flat, None, .8, .9)
    assert float(flat_out.astype(np.float32).std(axis=(0, 1)).max()) < 2 * 1.4


def test_veil_off_is_the_previous_path_and_water_colour_is_smoothed():
    _, hazy = veiled_scene()
    remover = veil.VeilRemover()
    out, correction, strength = veil.restore(remover, hazy, None, .8, 0.)
    assert out is hazy and correction is None and strength == .8
    assert remover.air is None
    gain = np.zeros((144, 256, 6), np.float32)
    gain[:, :, :3] = .2
    out, correction, strength = veil.restore(remover, hazy, gain, .8, 0.)
    assert np.array_equal(out, rov_ai.RovAI.apply(hazy, gain, .8)) and correction is gain
    # A sudden change of water colour moves the estimate only a little per frame.
    remover.correction(hazy, .9, 1 / 30)
    first = remover.air.copy()
    remover.correction(cv2.add(hazy, (60, 60, 60, 0)), .9, 1 / 30)
    assert float(np.abs(remover.air - first).max()) < 6


def test_merged_map_equals_network_then_veil_and_gain_is_bounded():
    _, hazy = veiled_scene()
    network = np.zeros((144, 256, 6), np.float32)
    network[:, :, :3] = .25
    network[:, :, 3:] = -12
    merged = veil.VeilRemover().merged(hazy, network, .8, .9)
    assert float(merged[:, :, :3].max()) <= (1 + .25 * .8) * 2.5 * 1.6 - 1 + 1e-3
    one = rov_ai.apply_affine(hazy, merged, 1., protect=0)
    step = rov_ai.apply_affine(hazy, network, .8, protect=0)
    two = rov_ai.apply_affine(step, veil.VeilRemover().correction(step, .9), 1., protect=0)
    assert float(np.abs(one.astype(np.int16) - two).mean()) < 4


def test_hud_text_does_not_define_the_water_colour():
    _, hazy = veiled_scene()
    plain = veil.VeilRemover()
    plain.correction(hazy, .9)
    hud = hazy.copy()
    hud[:30] = 255
    hud[-25:] = 255
    marked = veil.VeilRemover()
    marked.correction(hud, .9)
    assert float(np.abs(marked.air - plain.air).max()) < 3


def test_live_pipeline_with_veil_removal_runs_and_changes_the_image():
    from live_ai import LiveAI
    _, hazy = veiled_scene()
    outputs = {}
    for amount in (0., .9):
        live = LiveAI()
        settings = Settings(True, .8, mode='ai', quality='fast', backend='cpu', ai_noise=.3,
                            ai_sharp=.15, ai_realtime=True, ai_restore=.35, ai_dehaze=amount)
        try:
            for i in range(25):
                out, info = live.process(hazy, settings, i + 1, time.perf_counter())
                time.sleep(.03)
            assert info['ai_state'] in ('applied', 'global', 'temporal')
            outputs[amount] = out
        finally:
            live.close()
    assert contrast(outputs[.9]) > contrast(outputs[0.]) * 1.15


def test_exporter_path_accepts_veil_removal():
    _, hazy = veiled_scene()
    enhancer = Enhancer()
    settings = Settings(True, .8, mode='ai', quality='fast', backend='cpu', ai_restore=.35,
                        ai_sharp=.15, ai_dehaze=.9)
    for _ in range(3):
        out = enhancer.process(hazy, settings, 1 / 30)
    assert out.shape == hazy.shape and contrast(out) > contrast(hazy) * 1.3
