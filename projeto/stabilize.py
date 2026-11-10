"""Digital stabilization of the treated view (0.3.9).

Camera motion is measured between consecutive frames with tracked corner
points and a robust (RANSAC) similarity fit, so particles and fixed HUD text
do not drive it. The camera path is smoothed; only the difference between
the real and the smoothed path (the shake) is compensated, with a small zoom
that hides the moving borders. Intentional pans are followed: the smoothed
path is never allowed to fall more than the margin behind the real one.
Only the shown image is moved; no pixels are synthesized. A HUD burned into
the video moves with the correction (it cannot be separated from the scene
without patching pixels, which left visible doubles in tests).
"""
import math

import cv2
import numpy as np


class Stabilizer:
    def __init__(self, margin=.025, tau=.35, width=320):
        self.margin = margin   # fraction of each side that may move / is cropped
        self.tau = tau         # smoothing time constant of the camera path (s)
        self.width = width     # analysis width
        self.reset()

    def reset(self):
        self.previous = None
        self.path = np.zeros(3)      # x, y (analysis pixels), angle (rad)
        self.smooth = np.zeros(3)
        self.correction = np.zeros(3)
        self.inliers = 0

    def _gray(self, frame):
        h, w = frame.shape[:2]
        sw = min(self.width, w)
        sh = max(8, round(h * sw / w))
        gray = cv2.cvtColor(cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA),
                            cv2.COLOR_BGR2GRAY)
        return gray

    def update(self, frame, dt, strength=1.):
        """Measure motion of `frame` and return the correction (dx, dy, angle)
        in analysis pixels; call warp() with it on any resolution."""
        strength = float(np.clip(strength, 0, 1))
        gray = self._gray(frame)
        previous, self.previous = self.previous, gray
        if strength == 0 or previous is None or previous.shape != gray.shape or not 0 < dt <= .5:
            self.path[:] = self.smooth[:] = self.correction[:] = 0
            return self.correction.copy()
        h, w = gray.shape
        mask = np.zeros_like(gray)
        # Ignore the HUD bands (fixed text would read as "no motion").
        mask[round(h * .12):h - round(h * .1)] = 255
        points = cv2.goodFeaturesToTrack(previous, 160, .01, 7, mask=mask, blockSize=5)
        motion = np.zeros(3)
        self.inliers = 0
        if points is not None and len(points) >= 12:
            moved, status, _ = cv2.calcOpticalFlowPyrLK(previous, gray, points, None,
                                                        winSize=(15, 15), maxLevel=2)
            good = status.ravel() == 1
            if good.sum() >= 12:
                matrix, inliers = cv2.estimateAffinePartial2D(
                    points[good], moved[good], method=cv2.RANSAC,
                    ransacReprojThreshold=1.5, maxIters=200)
                if matrix is not None and inliers is not None and inliers.sum() >= 10:
                    self.inliers = int(inliers.sum())
                    motion = np.array([matrix[0, 2], matrix[1, 2],
                                       math.atan2(matrix[1, 0], matrix[0, 0])])
        self.path += motion
        blend = 1 - math.exp(-dt / self.tau)
        self.smooth += blend * (self.path - self.smooth)
        # Follow intentional motion: the view may lag the camera by at most
        # the margin (and 1.5°); beyond that the smoothed path is dragged along.
        limit = np.array([self.margin * w, self.margin * h, math.radians(1.5)])
        self.smooth = self.path + np.clip(self.smooth - self.path, -limit, limit)
        self.correction = (self.smooth - self.path) * strength
        return self.correction.copy()

    def warp(self, image, correction, analysis_width=None, keep=None):
        """Apply a correction to an image of any size, with the border zoom.
        `keep` (uint8 mask, same size) marks pixels left in place (HUD)."""
        h, w = image.shape[:2]
        scale = w / (analysis_width or min(self.width, w))
        dx, dy, angle = correction[0] * scale, correction[1] * scale, correction[2]
        zoom = 1 / (1 - 2 * self.margin)
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), math.degrees(angle), zoom)
        matrix[:, 2] += (dx, dy)
        out = cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REPLICATE)
        if keep is not None:
            cv2.copyTo(image, keep, out)
        return out
