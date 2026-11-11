"""Automatic performance level (0.3.10): keep the video fluid on weak PCs.

The governor watches the sequence numbers of the frames actually shown. When
more than ~12% of the source frames are being skipped for over a second, the
pipeline is not keeping up and the video looks jerky (irregular skips), so it
raises the economy level. After 4 s with almost no skips it tries the lower
level again; if that fails quickly, the next try waits twice as long (up to
64 s), so the level does not keep flipping (each flip is a visible hiccup).

Economy levels, cheapest image loss first (see live_ai.LiveAI):
  1 - no full-resolution two-frame noise reduction
  2 - no full-resolution sharpening
  3 - smaller internal working resolution (512 × 288 instead of 640 × 360)
"""
from collections import deque

MAX_LEVEL = 3
LEVEL_TEXT = {0: "", 1: "economia 1 (sem ruído em resolução cheia)",
              2: "economia 2 (sem ruído/nitidez em resolução cheia)",
              3: "economia 3 (resolução interna menor)"}


class Governor:
    def __init__(self, raise_at=.12, lower_at=.03, window=1.5, hold_raise=1., hold_lower=4.):
        self.raise_at, self.lower_at, self.window = raise_at, lower_at, window
        self.hold_raise, self.hold_lower = hold_raise, hold_lower
        self.level = 0
        self.drop = 0.
        self.samples = deque()
        self.changed = None
        self.lowered_at = None
        self.base_hold = hold_lower

    def update(self, now, seq):
        """Record a shown frame; return the economy level to use."""
        if self.changed is None:
            self.changed = now
        self.samples.append((now, seq))
        while self.samples and now - self.samples[0][0] > self.window:
            self.samples.popleft()
        if len(self.samples) < 3 or now - self.samples[0][0] < 1.:
            return self.level
        span = self.samples[-1][1] - self.samples[0][1]
        if span <= 0:
            return self.level
        self.drop = max(0., 1 - (len(self.samples) - 1) / span)
        since = now - self.changed
        if self.drop > self.raise_at and since >= self.hold_raise and self.level < MAX_LEVEL:
            if self.lowered_at is not None and now - self.lowered_at < 8:
                self.hold_lower = min(64., self.hold_lower * 2)  # Failed probe.
            self.lowered_at = None
            self._set(self.level + 1, now)
        elif self.drop < self.lower_at and since >= self.hold_lower and self.level > 0:
            self.lowered_at = now
            self._set(self.level - 1, now)
        elif self.lowered_at is not None and now - self.lowered_at >= 8:
            self.lowered_at = None
            self.hold_lower = self.base_hold  # The lower level held: reset.
        return self.level

    def _set(self, level, now):
        self.level, self.changed = level, now
        self.samples.clear()  # Judge the new level on its own frames.
