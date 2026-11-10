"""0.3.7 interface: simple by default, presets, no clipped panel on small screens."""
import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PySide6.QtWidgets import QApplication

import app as A


def window():
    qt = QApplication.instance() or QApplication([])
    w = A.Window()
    w.timer.stop()
    return qt, w


def test_visual_presets_set_fine_controls_and_editing_becomes_custom():
    qt, w = window()
    try:
        assert w.visual.currentText() == "Automático"
        s = w.settings()
        assert s.ai_auto and s.stabilize == 0.0
        w.stabilize.setChecked(True)
        assert w.settings().stabilize == 1.0
        assert (s.ai_color, s.ai_contrast, s.ai_sharp) == (.3, .5, .15)
        w.visual.setCurrentIndex(1)  # Natural: same base values, fixed
        assert w.visual.currentText() == "Natural" and not w.settings().ai_auto
        w.stabilize.setChecked(False)
        assert w.settings().stabilize == 0
        w.visual.setCurrentIndex(2)  # Mais detalhe
        assert w.settings().ai_contrast == .7 and w.settings().ai_sharp == .35
        w.ai_color.setValue(55)
        assert w.visual.currentText() == "Personalizado"
        w.visual.setCurrentIndex(0)
        assert w.settings().ai_color == .3 and w.settings().ai_auto
    finally:
        w.close()


def test_only_relevant_controls_visible_and_panel_toggles():
    qt, w = window()
    try:
        w.resize(1093, 614)
        w.show()
        qt.processEvents()
        assert not w.ai_section.body.isVisible() and not w.capture_options.body.isVisible()
        assert not w.classic_box.isVisible() and not w.path.isVisible()
        w.kind.setCurrentIndex(1)
        qt.processEvents()
        assert w.path.isVisible() and w.browse.isVisible() and not w.device.isVisible()
        w.motor.setCurrentIndex(1)
        qt.processEvents()
        assert w.classic_box.isVisible() and not w.ai_section.isVisible()
        w.toggle_panel()
        assert not w.panel.isVisible()
        w.toggle_panel()
        w.ai_section.button.setChecked(True)
        w.capture_options.button.setChecked(True)
        w.kind.setCurrentIndex(0)
        qt.processEvents()
        # Nothing forces the side panel wider than its visible area.
        assert w.panel.horizontalScrollBar().maximum() == 0
    finally:
        w.close()
