"""Automatic "Visual" (0.3.9): adapt the fine controls to the scene.

Cheap measurements on a small luminance image, smoothed over about 1.5 s
so the look never jumps:

* veil: low luminance range (p2–p98) means hazy/turbid water, which benefits
  from more local contrast and temporal restoration;
* noise: robust (MAD) estimate of fine grain; more noise means less
  sharpening and more noise reduction;
* darkness: a dark scene opens up with more local contrast;
* particles: the measured particle fraction raises the restoration;
* veil also sets how much of the physical veil removal (veil.py) is used.

Only the strengths of existing, bounded stages change; nothing new is drawn.
"""
import math
from dataclasses import replace

import cv2
import numpy as np


def measure(frame):
    """(range, noise, median) of the luminance, HUD bands excluded."""
    h, w = frame.shape[:2]
    sw = min(320, w)
    sh = max(16, round(h * sw / w))
    gray = cv2.cvtColor(cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA),
                        cv2.COLOR_BGR2GRAY)
    gray = gray[round(sh * .12):sh - round(sh * .1)]
    low, median, high = np.percentile(gray, (2, 50, 98))
    # Grain is measured near the working resolution (a reduced copy would
    # already have averaged it away), on a central crop to keep it cheap.
    scale = min(1., 960 / w)
    fine = frame if scale == 1 else cv2.resize(frame, (round(w * scale), round(h * scale)),
                                               interpolation=cv2.INTER_AREA)
    fh, fw = fine.shape[:2]
    crop = cv2.cvtColor(fine[fh // 4:3 * fh // 4, fw // 4:3 * fw // 4], cv2.COLOR_BGR2GRAY)
    detail = cv2.Laplacian(crop, cv2.CV_16S, ksize=1)
    # MAD of the 4-neighbour Laplacian; /sqrt(20) converts it to pixel sigma.
    noise = 1.4826 * float(np.median(np.abs(detail))) / math.sqrt(20)
    return float(high - low), noise, float(median)


def targets(span, noise, median, particles=0.):
    """Map scene measurements to control values (0–1)."""
    veil = float(np.clip((110 - span) / 80, 0, 1))      # 1 = very hazy
    dark = float(np.clip((70 - median) / 50, 0, 1))      # 1 = very dark
    grain = float(np.clip((noise - 1.2) / 4, 0, 1))      # 1 = very noisy
    # Turbid water is low-contrast AND full of compression blocks and
    # particles: open it with moderate local contrast, but sharpen less
    # there (sharpening would outline blocks and specks).
    return {
        'ai_contrast': float(np.clip(.4 + .25 * veil + .1 * dark, .35, .7)),
        'ai_restore': float(np.clip(.3 + .15 * veil + min(.2, particles * 150), .25, .6)),
        'ai_sharp': float(np.clip(.25 - .12 * veil - .2 * grain, .06, .3)),
        'ai_noise': float(np.clip(.2 + .35 * grain, .2, .55)),
        # 0.3.14: veil removal follows the measured haze. In clear water the
        # dark-channel estimate itself finds little veil, so this is safe.
        'ai_dehaze': float(np.clip(.35 + .45 * veil - .2 * grain, .25, .8)),
    }


class AutoVisual:
    def __init__(self, tau=1.5):
        self.tau = tau
        self.reset()

    def reset(self):
        self.values = None
        self.measurements = None

    def apply(self, settings, frame, dt, particles=0.):
        """Return settings with the automatic values (when ai_auto is on)."""
        if not getattr(settings, 'ai_auto', False):
            return settings
        span, noise, median = measure(frame)
        self.measurements = {'range': span, 'noise': noise, 'median': median}
        target = targets(span, noise, median, particles)
        if self.values is None:
            self.values = target
        else:
            blend = 1 - math.exp(-min(max(dt, .001), .5) / self.tau)
            self.values = {k: v + blend * (target[k] - v) for k, v in self.values.items()}
        return replace(settings, **self.values)

    def summary(self):
        if not self.values:
            return ''
        v = self.values
        return (f"Auto: contraste {v['ai_contrast'] * 100:.0f}% • nitidez {v['ai_sharp'] * 100:.0f}% • "
                f"ruído {v['ai_noise'] * 100:.0f}% • restauração {v['ai_restore'] * 100:.0f}% • "
                f"véu {v.get('ai_dehaze', 0) * 100:.0f}%")
