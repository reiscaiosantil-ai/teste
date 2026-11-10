"""ROV Live 0.3.5 IA — local capture and underwater dehazing workstation."""
import os
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("OPENCV_LOG_LEVEL", "SILENT")
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
import argparse
import json
import multiprocessing as mp
from pathlib import Path
import sys
import threading
import time

import cv2
import numpy as np
from PySide6.QtCore import Qt, QTimer, QSettings, QProcess, QSignalBlocker, QRect
from PySide6.QtGui import QImage, QPixmap, QPainter, QColor, QFont, QKeySequence, QShortcut
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QLabel, QPushButton,
    QComboBox, QSpinBox, QDoubleSpinBox, QLineEdit, QFileDialog, QMessageBox, QCheckBox,
    QHBoxLayout, QVBoxLayout, QFormLayout, QGroupBox, QSplitter, QScrollArea, QToolButton,
    QSizePolicy, QSlider, QStyle)

from engine import Session, Source
from processing import Settings
import capture_devices
from rov_ai import list_adapters, adapter_label

VERSION = "0.3.9"

STYLE = """
QWidget { background: #0b1420; color: #d9e6ef; font-family: 'Segoe UI'; font-size: 13px; }
QMainWindow { background: #0b1420; }
QLabel#brand { font-size: 25px; font-weight: 700; color: #ffffff; }
QLabel#sub { color: #8da7b8; }
QLabel#status { color: #65e0c5; padding: 9px; background: #122736; border-radius: 6px; }
QGroupBox { border: 1px solid #273e50; border-radius: 8px; margin-top: 16px; padding: 14px 10px 10px; font-weight: 600; }
QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; color: #83c6d1; }
QPushButton { background: #1c3549; border: 1px solid #34526a; border-radius: 6px; padding: 9px 12px; }
QPushButton:hover { background: #29475d; }
QPushButton#primary { background: #167b70; border-color: #28b69c; color: white; font-weight: 700; }
QPushButton:disabled { color: #526777; background: #142230; border-color: #223542; }
QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox { background: #122332; border: 1px solid #345063; border-radius: 5px; padding: 6px; }
QComboBox QAbstractItemView { selection-background-color: #236c70; }
QCheckBox { spacing: 8px; padding: 5px 0; }
QSplitter::handle { background: #1e3548; width: 3px; }
QToolTip { background: #20394e; color: white; border: 1px solid #4c758e; }
QToolButton#section { border: none; color: #83c6d1; font-weight: 600; padding: 6px 0; text-align: left; }
QToolButton#section:hover { color: #b7e6ee; }
QSlider::groove:horizontal { height: 6px; background: #1c3549; border-radius: 3px; }
QSlider::sub-page:horizontal { background: #28b69c; border-radius: 3px; }
QSlider::handle:horizontal { background: #e8f6f3; width: 16px; height: 16px; margin: -6px 0; border-radius: 8px; }
"""

# 0.3.7: "Visual" presets of the AI look (restoration, specks, color, local
# contrast, noise, sharpness) so the common case needs a single choice.
# "Automático" starts from the Natural values and adapts them to the scene.
VISUALS = [("Automático", (35, 0, 30, 50, 30, 15)),
           ("Natural", (35, 0, 30, 50, 30, 15)),
           ("Mais detalhe", (45, 0, 30, 70, 25, 35)),
           ("Cores vivas", (35, 0, 90, 40, 30, 15))]


def compact_form(parent=None):
    """Form that fits a narrow panel: labels move above fields when needed."""
    form = QFormLayout(parent)
    form.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
    form.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)
    form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
    form.setContentsMargins(0, 0, 0, 0)
    return form


def fit(widget):
    """Never let a long item text force the panel wider than the screen."""
    if isinstance(widget, QComboBox):
        widget.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        widget.setMinimumContentsLength(6)
    widget.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
    widget.setMinimumWidth(0)
    return widget


class Section(QWidget):
    """Collapsible block of settings: a header and a hideable compact form."""
    def __init__(self, title, expanded=False):
        super().__init__()
        box = QVBoxLayout(self)
        box.setContentsMargins(0, 2, 0, 0)
        box.setSpacing(2)
        self.button = QToolButton()
        self.button.setObjectName("section")
        self.button.setText(title)
        self.button.setCheckable(True)
        self.button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        self.body = QWidget()
        self.form = compact_form(self.body)
        box.addWidget(self.button)
        box.addWidget(self.body)
        self.button.toggled.connect(self.expand)
        self.button.setChecked(expanded)
        self.expand(expanded)

    def expand(self, expanded):
        self.button.setArrowType(Qt.ArrowType.DownArrow if expanded else Qt.ArrowType.RightArrow)
        self.body.setVisible(expanded)
        self.updateGeometry()


class JumpSlider(QSlider):
    """Timeline: a click jumps straight to that point (not page steps)."""
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.maximum() > 0:
            value = QStyle.sliderValueFromPosition(self.minimum(), self.maximum(),
                                                   round(event.position().x()), self.width())
            self.setValue(value)
            self.sliderMoved.emit(value)
        super().mousePressEvent(event)


def clock(seconds):
    seconds = max(0, int(seconds))
    hours, rest = divmod(seconds, 3600)
    return f"{hours}:{rest // 60:02d}:{rest % 60:02d}" if hours else f"{rest // 60:02d}:{rest % 60:02d}"


class VideoPanel(QWidget):
    def __init__(self, title, accent):
        super().__init__()
        self.title, self.accent = title, accent
        self.image = None
        self.overlay = "Aguardando conexão"
        self.setMinimumSize(220, 200)

    def set_frame(self, frame):
        h, w = frame.shape[:2]
        # Packets are never modified after publication: keep a reference to
        # the array instead of copying a full frame into the QImage.
        frame = np.ascontiguousarray(frame)
        self._pixels = frame
        self.image = QImage(frame.data, w, h, frame.strides[0], QImage.Format.Format_BGR888)
        self.overlay = ""
        self.update()

    def clear_frame(self, message):
        self.image = None
        self.overlay = message
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#060d15"))
        view = self.rect().adjusted(8, 42, -8, -10)
        if self.image is not None:
            size = self.image.size().scaled(view.size(), Qt.AspectRatioMode.KeepAspectRatio)
            x, y = view.x() + (view.width() - size.width()) // 2, view.y() + (view.height() - size.height()) // 2
            # Let the paint engine scale while drawing; no scaled copy per paint.
            painter.drawImage(QRect(x, y, size.width(), size.height()), self.image)
        painter.setPen(QColor(self.accent))
        painter.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        painter.drawText(14, 26, self.title)
        if self.overlay:
            painter.setPen(QColor("#8da7b8"))
            painter.setFont(QFont("Segoe UI", 12))
            painter.drawText(view, Qt.AlignmentFlag.AlignCenter | Qt.TextFlag.TextWordWrap, self.overlay)


class Window(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ROV Live • tratamento de vídeo ao vivo")
        self.resize(1440, 870)
        self.session = None
        self.last_sequence = -1
        self.current = None
        self.reference_held = False
        self.export_process = None
        self.export_tmp = None
        self.export_last = ""
        self.failed_open = False
        self._applying_profile = False
        self.preferences = QSettings("ROVLive", "ROVLive")
        root = QWidget()
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(20, 16, 20, 12)
        heading = QHBoxLayout()
        title = QLabel("ROV / LIVE")
        title.setObjectName("brand")
        heading.addWidget(title)
        subtitle = QLabel(f"Melhoria subaquática  •  Protótipo {VERSION} IA  •  Processamento local")
        subtitle.setObjectName("sub")
        heading.addWidget(subtitle)
        heading.addStretch()
        help_btn = QPushButton("Ajuda")
        help_btn.clicked.connect(self.show_help)
        heading.addWidget(help_btn)
        layout.addLayout(heading)
        self.status = QLabel("Conecte a captura ou abra um vídeo para começar.")
        self.status.setObjectName("status")
        self.status.setWordWrap(True)
        layout.addWidget(self.status)
        body = QHBoxLayout()
        sidebar = QWidget()
        side = QVBoxLayout(sidebar)
        side.setContentsMargins(0, 0, 8, 0)
        # ---- 01 / Fonte: only the fields of the chosen input are shown.
        source_box = QGroupBox("01  /  Fonte de vídeo")
        source_layout = QVBoxLayout(source_box)
        form = compact_form()
        self.source_form = form
        source_layout.addLayout(form)
        self.kind = fit(QComboBox())
        self.kind.addItems(["Placa de captura", "Arquivo de vídeo", "Câmera IP (RTSP)"])
        form.addRow("Entrada", self.kind)
        self.device = fit(QComboBox())
        self.device.setToolTip("Dispositivos de vídeo encontrados no Windows, pelo nome. "
                               "A Elgato é marcada e escolhida automaticamente quando presente.")
        form.addRow("Dispositivo", self.device)
        self.index = fit(QSpinBox())
        self.index.setRange(0, 20)
        self.index.setValue(int(self.preferences.value("device_index", 0)))
        self.index.setToolTip("Índice do dispositivo no OpenCV. Teste 0, 1, 2… A webcam pode ser o índice 0.")
        form.addRow("Índice", self.index)
        self.device_buttons = QWidget()
        device_buttons = QHBoxLayout(self.device_buttons)
        device_buttons.setContentsMargins(0, 0, 0, 0)
        self.refresh_devices_btn = fit(QPushButton("Atualizar lista"))
        self.refresh_devices_btn.clicked.connect(self.refresh_devices)
        self.diagnose_btn = fit(QPushButton("Diagnóstico"))
        self.diagnose_btn.setToolTip("Testa drivers, privacidade da câmera, programas que ocupam a placa "
                                     "e a abertura por DirectShow e Media Foundation. Salva um relatório.")
        self.diagnose_btn.clicked.connect(self.run_diagnosis)
        device_buttons.addWidget(self.refresh_devices_btn)
        device_buttons.addWidget(self.diagnose_btn)
        form.addRow(self.device_buttons)
        self.path = fit(QLineEdit())
        self.path.setPlaceholderText("Arquivo ou URL")
        form.addRow("Endereço", self.path)
        self.browse = fit(QPushButton("Escolher vídeo…"))
        self.browse.clicked.connect(self.choose_file)
        form.addRow(self.browse)
        self.loop = QCheckBox("Repetir o arquivo")
        self.loop.setChecked(True)
        form.addRow(self.loop)
        self.start = fit(QPushButton("Conectar"))
        self.start.setObjectName("primary")
        self.start.clicked.connect(self.connect_source)
        self.stop = fit(QPushButton("Desconectar"))
        self.stop.setEnabled(False)
        self.stop.clicked.connect(self.disconnect)
        buttons = QHBoxLayout()
        buttons.addWidget(self.start)
        buttons.addWidget(self.stop)
        source_layout.addLayout(buttons)
        capture_options = Section("Opções de captura")
        self.capture_options = capture_options
        self.backend = fit(QComboBox())
        self.backend.addItems(["DirectShow", "Media Foundation", "Automático"])
        self.backend.setToolTip("Se o escolhido falhar, o app tenta o formato nativo e o outro backend.")
        capture_options.form.addRow("Backend", self.backend)
        self.resolution = fit(QComboBox())
        self.resolution.addItems(["1280 × 720", "1920 × 1080", "640 × 480", "960 × 540"])
        self.resolution.setCurrentIndex(3)  # More CPU headroom for dehazing.
        self.resolution.setToolTip("Resolução de trabalho. Comece em 960 × 540; teste 1280 × 720 se houver folga.")
        capture_options.form.addRow("Resolução", self.resolution)
        self.fps = fit(QComboBox())
        self.fps.addItems(["30", "25", "60"])
        capture_options.form.addRow("FPS pedidos", self.fps)
        self.fourcc = fit(QComboBox())
        self.fourcc.addItems(["Auto", "MJPG", "YUY2"])
        capture_options.form.addRow("Formato", self.fourcc)
        source_layout.addWidget(capture_options)
        source_box.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Maximum)
        side.addWidget(source_box)
        # ---- 02 / Tratamento: simple choices first, details collapsed.
        treatment = QGroupBox("02  /  Tratamento")
        treatment_layout = QVBoxLayout(treatment)
        controls = compact_form()
        self.treatment_form = controls
        treatment_layout.addLayout(controls)
        self.motor = fit(QComboBox())
        self.motor.addItems(["IA (WaterNet)", "Clássico"])
        controls.addRow("Modo", self.motor)
        self.visual = fit(QComboBox())
        self.visual.addItems([name for name, _ in VISUALS] + ["Personalizado"])
        self.visual.setToolTip("Automático: mede véu, ruído e escuridão da cena e ajusta contraste, nitidez, "
                               "ruído e restauração aos poucos. Natural: cor fiel, contraste local moderado. Mais detalhe: abre mais as "
                               "sombras e realça bordas. Cores vivas: aparência mais saturada.")
        controls.addRow("Visual", self.visual)
        self.stabilize = QCheckBox("Estabilizar imagem")
        self.stabilize.setChecked(False)
        self.stabilize.setToolTip("Compensa o tremor do ROV na imagem tratada, com zoom de ~5% para esconder "
                                  "as bordas. Movimentos intencionais são seguidos. O texto gravado na imagem "
                                  "(profundidade, hora) acompanha a correção e pode balançar um pouco.")
        self.strength = fit(self.number(0, 100, 80, 5, " %"))
        controls.addRow("Intensidade", self.strength)
        self.enabled = QCheckBox("Aplicar melhoria  [Espaço]")
        self.enabled.setChecked(True)
        controls.addRow(self.enabled)
        controls.addRow(self.stabilize)
        self.stabilize.toggled.connect(self.update_settings)
        self.ai_section = Section("Ajustes finos da IA")
        ai = self.ai_section.form
        self.ai_quality = fit(QComboBox())
        self.ai_quality.addItems(["Rápida 128×72", "Detalhada 256×144"])
        self.ai_quality.setCurrentIndex(1)
        ai.addRow("Análise", self.ai_quality)
        self.ai_backend = fit(QComboBox())
        self.ai_backend.addItems(["Automático (GPU/CPU)", "CPU"])
        ai.addRow("Execução", self.ai_backend)
        self.ai_device = fit(QComboBox())
        self.ai_device.addItem("Automática", -1)
        adapters = list_adapters()
        for adapter in adapters:
            self.ai_device.addItem(f"{adapter['index']}: {adapter_label(adapter)}"
                                   + (" • software" if adapter["software"] else ""), adapter["index"])
        if not adapters:
            for index in range(3):
                self.ai_device.addItem(f"Índice {index}", index)
        self.ai_device.setToolTip("Adaptador usado pelo DirectML. Automática escolhe a placa com mais "
                                  "memória dedicada (ex.: GPU de 8 GB em vez da integrada).")
        ai.addRow("GPU", self.ai_device)
        self.ai_realtime = QCheckBox("Vídeo fluido (recomendado)")
        self.ai_realtime.setChecked(True)
        self.ai_realtime.setToolTip("Analisa em paralelo e reaplica correções com verificação de movimento. Quando a correção neural não serve, usa a restauração temporal, se ativada; caso contrário mostra o original. Desmarque para analisar cada quadro exibido.")
        ai.addRow(self.ai_realtime)
        self.ai_restore = fit(self.number(0, 100, 35, 5, " %"))
        self.ai_restore.setToolTip("Combina observações de quadros anteriores com verificação de movimento e realça a luminância. Partículas claras pequenas e passageiras, confirmadas em dois quadros anteriores alinhados, são limitadas ao nível observado nesses quadros. Pode atenuar pequenos objetos claros em movimento ou criar rastros se a correspondência falhar. Zero desativa. Protege as faixas superior e inferior da mistura temporal.")
        self.ai_specks = fit(self.number(0, 100, 0, 5, " %"))
        self.ai_specks.setToolTip("Atenua pontos claros muito pequenos. Pode atenuar detalhes reais. Comece em 15–25%; zero preserva esses pontos.")
        self.ai_color = fit(self.number(0, 100, 30, 5, " %"))
        self.ai_color.setToolTip("Quanto de cor a IA pode acrescentar. A cor vem da imagem original, sem parte do tom da água; 30% evita água violeta e amarelo exagerado. 100% fica próximo do visual mais vivo da 0.3.5.")
        self.ai_contrast = fit(self.number(0, 100, 50, 5, " %"))
        self.ai_contrast.setToolTip("Contraste local limitado na luminância (CLAHE): abre áreas escuras e veladas sem mudar a cor. Valores altos podem realçar ruído e o texto da telemetria.")
        self.ai_noise = fit(self.number(0, 100, 30, 5, " %"))
        self.ai_noise.setToolTip("Suaviza granulação. Valores altos podem suavizar detalhes; não remove partículas reais com garantia.")
        self.ai_sharp = fit(self.number(0, 100, 15, 5, " %"))
        self.ai_sharp.setToolTip("Realça bordas na resolução de saída. Ignora variações do tamanho do ruído estimado e nunca ultrapassa o claro/escuro vizinho (sem halos). Não recupera detalhes ausentes.")
        for label, widget in [("Partículas / temporal", self.ai_restore), ("Pontos claros", self.ai_specks),
                              ("Cor", self.ai_color), ("Contraste local", self.ai_contrast),
                              ("Redução de ruído", self.ai_noise), ("Nitidez", self.ai_sharp)]:
            ai.addRow(label, widget)
        treatment_layout.addWidget(self.ai_section)
        self.classic_box = QWidget()
        classic = compact_form(self.classic_box)
        self.profile = fit(QComboBox())
        self.profile.addItems(["Água turva", "Névoa forte", "Suave / pouca névoa", "Personalizado"])
        classic.addRow("Perfil", self.profile)
        self.exposure = fit(self.number(-1, 2, 0, 0.1, "", 1))
        self.color = fit(self.number(0, 100, 15, 5, " %"))
        self.contrast = fit(self.number(1, 2, 1.3, 0.1, "", 1))
        self.haze = fit(self.number(0, 100, 80, 5, " %"))
        self.haze.setToolTip("Comece em 80%. Aumentar pode revelar contornos, mas também ruído, halos e artefatos de compressão.")
        for label, widget in [("Clareamento", self.exposure), ("Correção de cor", self.color),
                              ("Contraste local", self.contrast), ("Redução de névoa", self.haze)]:
            classic.addRow(label, widget)
        self.denoise = QCheckBox("Redução de ruído (mais lenta)")
        classic.addRow(self.denoise)
        reset = fit(QPushButton("Reaplicar perfil"))
        reset.clicked.connect(self.reset_settings)
        classic.addRow(reset)
        treatment_layout.addWidget(self.classic_box)
        for widget in [self.strength, self.exposure, self.color, self.contrast, self.haze]:
            widget.valueChanged.connect(self.update_settings)
        self.enabled.toggled.connect(self.update_settings)
        self.denoise.toggled.connect(self.update_settings)
        self.profile.currentIndexChanged.connect(self.reset_settings)
        self._applying_visual = False
        self.visual.currentIndexChanged.connect(self.apply_visual)
        for widget in [self.ai_restore, self.ai_specks, self.ai_color, self.ai_contrast,
                       self.ai_noise, self.ai_sharp]:
            widget.valueChanged.connect(self.visual_edited)
        treatment.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Maximum)
        side.addWidget(treatment)
        side.addStretch()
        scroll = QScrollArea()
        self.panel = scroll
        scroll.setWidgetResizable(True)
        scroll.setWidget(sidebar)
        scroll.setMinimumWidth(330)
        scroll.setMaximumWidth(380)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        body.addWidget(scroll)
        right = QVBoxLayout()
        toolbar = QHBoxLayout()
        self.panel_btn = QPushButton("Ocultar controles  [F9]")
        self.panel_btn.clicked.connect(self.toggle_panel)
        toolbar.addWidget(self.panel_btn)
        self.view = QComboBox()
        self.view.addItems(["Comparar", "Somente tratada", "Somente original"])
        self.view.currentIndexChanged.connect(self.change_view)
        toolbar.addWidget(self.view)
        full = QPushButton("Tela cheia  [F11]")
        full.clicked.connect(self.toggle_fullscreen)
        toolbar.addWidget(full)
        reference = QPushButton("Segure: ver original")
        reference.pressed.connect(lambda: self.hold_original(True))
        reference.released.connect(lambda: self.hold_original(False))
        toolbar.addWidget(reference)
        self.export_btn=QPushButton("Exportar vídeo com IA")
        self.export_btn.clicked.connect(self.export_video)
        toolbar.addWidget(self.export_btn)
        toolbar.addStretch()
        self.snapshot_btn = QPushButton("Salvar comparação PNG")
        self.snapshot_btn.setEnabled(False)
        self.snapshot_btn.clicked.connect(self.save_snapshot)
        toolbar.addWidget(self.snapshot_btn)
        right.addLayout(toolbar)
        self.original = VideoPanel("ORIGINAL • sem tratamento", "#a9bdcd")
        self.enhanced = VideoPanel("TRATADA • filtros locais", "#65e0c5")
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.addWidget(self.original)
        splitter.addWidget(self.enhanced)
        right.addWidget(splitter, 1)
        # Timeline: shown only while a video file is connected (0.3.8).
        self.timeline = QWidget()
        bar = QHBoxLayout(self.timeline)
        bar.setContentsMargins(0, 4, 0, 0)
        self.play_btn = QPushButton("⏸  Pausar")
        self.play_btn.setToolTip("Pausar / continuar o vídeo. Pausado, o tratamento continua no quadro parado.")
        self.play_btn.setFixedWidth(118)
        self.play_btn.clicked.connect(self.toggle_play)
        self.seek_bar = JumpSlider(Qt.Orientation.Horizontal)
        self.seek_bar.setRange(0, 0)
        self.seek_bar.setToolTip("Arraste ou clique para ir a um trecho do vídeo.")
        self.seek_bar.sliderMoved.connect(self.preview_seek)
        self.seek_bar.sliderReleased.connect(self.commit_seek)
        self.time_label = QLabel("00:00 / 00:00")
        self.time_label.setMinimumWidth(110)
        self.time_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        bar.addWidget(self.play_btn)
        bar.addWidget(self.seek_bar, 1)
        bar.addWidget(self.time_label)
        self.timeline.setVisible(False)
        self._seek_pending = None
        right.addWidget(self.timeline)
        self.metrics = QLabel("FPS: —   |   Filtro: — ms   |   Idade no app: — ms")
        self.metrics.setWordWrap(True)
        right.addWidget(self.metrics)
        self.export_status=QLabel("Exportação: MP4 sem áudio; processamento pode ser mais lento que o vídeo.")
        self.export_status.setWordWrap(True)
        right.addWidget(self.export_status)
        explain = QLabel("Idade no app começa após a leitura do quadro. Não mede o atraso da câmera, do cabo, do driver ou do monitor.")
        explain.setObjectName("sub")
        explain.setWordWrap(True)
        right.addWidget(explain)
        body.addLayout(right, 1)
        layout.addLayout(body, 1)
        self.kind.currentIndexChanged.connect(self.source_visibility)
        self.device.currentIndexChanged.connect(self.source_visibility)
        self._device_listing = None
        self._diagnosis = None
        self.fill_devices([])
        self.source_visibility()
        self.refresh_devices()
        for control in [self.motor,self.ai_quality,self.ai_backend]:
            control.currentIndexChanged.connect(self.update_settings)
        self.ai_device.currentIndexChanged.connect(self.update_settings)
        self.ai_noise.valueChanged.connect(self.update_settings)
        self.ai_sharp.valueChanged.connect(self.update_settings)
        self.ai_restore.valueChanged.connect(self.update_settings)
        self.ai_specks.valueChanged.connect(self.update_settings)
        self.ai_color.valueChanged.connect(self.update_settings)
        self.ai_contrast.valueChanged.connect(self.update_settings)
        self.ai_realtime.toggled.connect(self.update_settings)
        self.update_settings()
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(16)
        QShortcut(QKeySequence("F11"), self, activated=self.toggle_fullscreen)
        QShortcut(QKeySequence("F9"), self, activated=self.toggle_panel)
        QShortcut(QKeySequence("Escape"), self, activated=self.showNormal)
        QShortcut(QKeySequence("Space"), self, activated=self.enabled.toggle)

    @staticmethod
    def number(low, high, value, step, suffix, decimals=0):
        widget = QDoubleSpinBox()
        widget.setRange(low, high)
        widget.setDecimals(decimals)
        widget.setSingleStep(step)
        widget.setSuffix(suffix)
        widget.setValue(value)
        return widget

    def settings(self):
        return Settings(self.enabled.isChecked(), self.strength.value() / 100,
            self.exposure.value(), self.color.value() / 100, self.contrast.value(),
            self.haze.value() / 100, self.denoise.isChecked(),
            "ai" if self.motor.currentIndex()==0 else "classic",
            "fast" if self.ai_quality.currentIndex()==0 else "detail",
            "auto" if self.ai_backend.currentIndex()==0 else "cpu",int(self.ai_device.currentData()),self.ai_noise.value()/100,self.ai_sharp.value()/100,self.ai_realtime.isChecked(),self.ai_specks.value()/100,self.ai_restore.value()/100,
            self.ai_color.value()/100,self.ai_contrast.value()/100,
            self.visual.currentIndex()==0, 1.0 if self.stabilize.isChecked() else 0.0)

    def update_settings(self, *_):
        classic=self.motor.currentIndex()==1
        # Show only the controls of the active mode (disabled rows were clutter).
        self.classic_box.setVisible(classic)
        self.classic_box.setEnabled(classic)
        self.ai_section.setVisible(not classic)
        self.ai_section.setEnabled(not classic)
        self.visual.setEnabled(not classic)
        self.treatment_form.setRowVisible(self.visual, not classic)
        self.treatment_form.setRowVisible(self.stabilize, not classic)
        if classic and not self._applying_profile and self.profile.currentIndex()<3:
            presets=[(100,0,15,1.3,80),(100,0,15,1.2,95),(65,.6,35,1.6,0)]
            actual=[w.value() for w in [self.strength,self.exposure,self.color,self.contrast,self.haze]]
            if any(abs(a-b)>.001 for a,b in zip(actual,presets[self.profile.currentIndex()])) or self.denoise.isChecked():
                blocker=QSignalBlocker(self.profile)
                self.profile.setCurrentIndex(3)
                del blocker
        if self.session:
            self.session.settings = self.settings()

    def apply_visual(self, index):
        if index >= len(VISUALS):
            return
        self._applying_visual = True
        values = VISUALS[index][1]
        for widget, value in zip([self.ai_restore, self.ai_specks, self.ai_color, self.ai_contrast,
                                  self.ai_noise, self.ai_sharp], values):
            widget.setValue(value)
        self._applying_visual = False
        self.update_settings()

    def visual_edited(self, *_):
        if self._applying_visual:
            return
        values = tuple(round(w.value()) for w in [self.ai_restore, self.ai_specks, self.ai_color,
                                                   self.ai_contrast, self.ai_noise, self.ai_sharp])
        current = self.visual.currentIndex()
        if current < len(VISUALS) and VISUALS[current][1] == values:
            return
        match = next((i for i, (_, preset) in enumerate(VISUALS) if i and preset == values), len(VISUALS))
        if match != self.visual.currentIndex():
            blocker = QSignalBlocker(self.visual)
            self.visual.setCurrentIndex(match)
            del blocker

    def file_session(self):
        return self.session is not None and getattr(self.session, "source", None) is not None \
            and self.session.source.kind == "file" and hasattr(self.session, "timeline")

    def toggle_play(self):
        if not self.file_session():
            return
        paused = not self.session.paused
        self.session.set_paused(paused)
        self.play_btn.setText("▶  Continuar" if paused else "⏸  Pausar")

    def preview_seek(self, value):
        duration = self.seek_bar.maximum() / 1000
        self.time_label.setText(f"{clock(value / 1000)} / {clock(duration)}")
        if not self.seek_bar.isSliderDown():  # click on the track
            self.commit_seek()

    def commit_seek(self):
        if self.file_session():
            self.session.seek(self.seek_bar.value() / 1000)
            # Keep the handle where the user put it until the file catches up.
            self._seek_pending = (self.seek_bar.value(), time.perf_counter())

    def update_timeline(self):
        show = self.file_session()
        if self.timeline.isVisible() != show:
            self.timeline.setVisible(show)
        if not show:
            return
        position, duration = self.session.timeline()
        maximum = int(duration * 1000)
        if self.seek_bar.maximum() != maximum:
            self.seek_bar.setRange(0, maximum)
        if self.seek_bar.isSliderDown():
            return
        if self._seek_pending is not None:
            target, since = self._seek_pending
            if abs(position * 1000 - target) > 1500 and time.perf_counter() - since < 2:
                return
            self._seek_pending = None
        blocker = QSignalBlocker(self.seek_bar)
        self.seek_bar.setValue(int(position * 1000))
        del blocker
        self.time_label.setText(f"{clock(position)} / {clock(duration)}" if duration else clock(position))
        self.play_btn.setText("▶  Continuar" if self.session.paused else "⏸  Pausar")

    def toggle_panel(self):
        visible = not self.panel.isVisible()
        self.panel.setVisible(visible)
        self.panel_btn.setText("Ocultar controles  [F9]" if visible else "Mostrar controles  [F9]")

    def reset_settings(self, *_):
        if self.profile.currentIndex()==3:return
        self._applying_profile=True
        self.enabled.setChecked(True)
        presets = [(100, 0, 15, 1.3, 80), (100, 0, 15, 1.2, 95), (65, .6, 35, 1.6, 0)]
        values = presets[self.profile.currentIndex()]
        for widget, value in zip([self.strength, self.exposure, self.color, self.contrast, self.haze], values):
            widget.setValue(value)
        self.denoise.setChecked(False)
        self._applying_profile=False
        self.update_settings()

    def fill_devices(self, devices):
        blocker = QSignalBlocker(self.device)
        self.device.clear()
        for device in devices:
            label = device["name"] + ("  • ELGATO" if device["elgato"] else "")
            self.device.addItem(label, device)
        self.device.addItem("Índice manual", None)
        remembered = self.preferences.value("device_name", "")
        names = [d["name"] for d in devices]
        if remembered in names:
            self.device.setCurrentIndex(names.index(remembered))
        elif capture_devices.preferred_device(devices) is not None:
            self.device.setCurrentIndex(capture_devices.preferred_device(devices))
        else:
            self.device.setCurrentIndex(len(devices))
        del blocker
        self.source_visibility()

    def refresh_devices(self):
        """List devices in a background process; the GUI never waits on drivers."""
        if self._device_listing is not None or not capture_devices.WINDOWS:
            return
        self.refresh_devices_btn.setEnabled(False)
        self.refresh_devices_btn.setText("Procurando…")
        box = {}
        def work():
            try:
                box["result"] = capture_devices.list_devices()
            except Exception as exc:
                box["result"] = {"devices": [], "errors": [type(exc).__name__]}
        self._device_listing = (threading.Thread(target=work, daemon=True), box)
        self._device_listing[0].start()

    def poll_background(self):
        if self._device_listing is not None and not self._device_listing[0].is_alive():
            result = self._device_listing[1].get("result", {"devices": [], "errors": []})
            self._device_listing = None
            self.refresh_devices_btn.setEnabled(True)
            self.refresh_devices_btn.setText("Atualizar lista")
            self.fill_devices(result["devices"])
            if not self.session:
                found = len(result["devices"])
                elgato = [d["name"] for d in result["devices"] if d["elgato"]]
                self.status.setText(
                    (f"Elgato encontrada: {', '.join(elgato)}. " if elgato else
                     f"{found} dispositivo(s) de vídeo encontrado(s); nenhuma Elgato pelo nome. "
                     if found else "Nenhum dispositivo de vídeo listado. Use Diagnóstico. ")
                    + "Selecione a fonte e clique em Conectar.")
        if self._diagnosis is not None:
            thread, box = self._diagnosis
            if box.get("progress"):
                self.status.setText("Diagnóstico: " + box["progress"])
            if not thread.is_alive():
                self._diagnosis = None
                self.diagnose_btn.setEnabled(True)
                self.diagnose_btn.setText("Diagnóstico")
                text = box.get("report", "Falha ao gerar o diagnóstico.")
                path = box.get("path")
                self.status.setText("Diagnóstico concluído" + (f" • salvo em {path}" if path else ""))
                dialog = QMessageBox(self)
                dialog.setWindowTitle("Diagnóstico da captura")
                dialog.setText("Relatório" + (f" salvo em:\n{path}" if path else "") +
                               "\n\nEnvie o arquivo ao suporte se a placa não abrir.")
                dialog.setDetailedText(text)
                dialog.show()

    def run_diagnosis(self):
        if self._diagnosis is not None:
            return
        if self.session and self.session.source.kind == "capture":
            # A capture card normally accepts one client at a time.
            self.disconnect()
        self.diagnose_btn.setEnabled(False)
        self.diagnose_btn.setText("Testando…")
        w, h = [(1280, 720), (1920, 1080), (640, 480), (1920, 1080)][self.resolution.currentIndex()]
        fps = int(self.fps.currentText())
        box = {}
        def work():
            try:
                box["report"] = capture_devices.diagnose(w, h, fps, progress=lambda t: box.__setitem__("progress", t))
                box["path"] = str(capture_devices.save_report(box["report"]))
            except Exception as exc:
                box["report"] = f"Falha ao gerar o diagnóstico: {type(exc).__name__}"
        self._diagnosis = (threading.Thread(target=work, daemon=True), box)
        self._diagnosis[0].start()

    def write_session_log(self, session):
        log = getattr(session, "log", None)
        if not log:
            return
        try:
            path = capture_devices.log_dir() / f"rov_live_{time.strftime('%Y%m%d')}.log"
            with open(path, "a", encoding="utf-8") as handle:
                source = session.source
                handle.write(f"--- sessão {source.kind} {getattr(source, 'device_name', '') or ''} "
                             f"{source.backend if source.kind == 'capture' else ''}\n")
                for stamp, kind, text in log:
                    handle.write(f"{time.strftime('%H:%M:%S', time.localtime(stamp))} [{kind}] {text}\n")
            session.log = []
        except OSError:
            pass

    def source_visibility(self, *_):
        capture = self.kind.currentIndex() == 0
        is_file = self.kind.currentIndex() == 1
        form = self.source_form
        # Only the fields of the selected input are shown (0.3.7).
        form.setRowVisible(self.device, capture)
        form.setRowVisible(self.index, capture and self.device.currentData() is None)
        form.setRowVisible(self.device_buttons, capture)
        form.setRowVisible(self.path, not capture)
        form.setRowVisible(self.browse, is_file)
        form.setRowVisible(self.loop, is_file)
        self.capture_options.setVisible(capture)
        for widget in [self.device, self.backend, self.fourcc]:
            widget.setEnabled(capture)
        self.index.setEnabled(capture and self.device.currentData() is None)
        self.path.setEnabled(not capture)
        self.path.setEchoMode(QLineEdit.EchoMode.Password if self.kind.currentIndex() == 2 else QLineEdit.EchoMode.Normal)
        self.browse.setEnabled(is_file)
        self.loop.setEnabled(is_file)

    def choose_file(self):
        name, _ = QFileDialog.getOpenFileName(self, "Abrir vídeo", "", "Vídeos (*.mp4 *.avi *.mkv *.mov *.m4v);;Todos (*)")
        if name:
            self.path.setText(name)

    def connect_source(self):
        kind = ["capture", "file", "stream"][self.kind.currentIndex()]
        device = self.device.currentData() if kind == "capture" else None
        value = str(self.index.value()) if kind == "capture" else self.path.text().strip()
        named = {}
        if device:
            dshow = device["dshow_index"] if device["dshow_index"] is not None else -1
            msmf = device["msmf_index"] if device["msmf_index"] is not None else -1
            chosen = msmf if self.backend.currentText() == "Media Foundation" and msmf >= 0 else dshow
            value = str(chosen if chosen >= 0 else msmf)
            named = dict(device_name=device["name"], dshow_index=dshow, msmf_index=msmf)
        if kind == "file" and not Path(value).is_file():
            QMessageBox.warning(self, "Arquivo", "Selecione um arquivo de vídeo existente.")
            return
        if kind == "stream" and not value.lower().startswith(("rtsp://", "http://", "https://")):
            QMessageBox.warning(self, "Fluxo IP", "Informe uma URL RTSP, HTTP ou HTTPS do fluxo de vídeo.")
            return
        self.disconnect()
        w, h = [(1280, 720), (1920, 1080), (640, 480), (960, 540)][self.resolution.currentIndex()]
        source = Source(kind, value, self.backend.currentText(), w, h, int(self.fps.currentText()),
                        self.fourcc.currentText(), self.loop.isChecked(), **named)
        try:
            self.session = Session(source, self.settings())
        except Exception:
            QMessageBox.critical(self, "Inicialização", "Não foi possível iniciar a captura. Feche outros aplicativos de câmera e tente novamente.")
            return
        self.preferences.setValue("device_index", self.index.value())
        if kind == "capture":
            self.preferences.setValue("device_name", device["name"] if device else "")
        self.start.setText("Reconectar")
        self.stop.setEnabled(True)
        self.status.setText("Conectando… O primeiro quadro pode levar alguns segundos.")
        self.failed_open = False

    def disconnect(self):
        if self.session:
            self.session.close()
            self.write_session_log(self.session)
            self.session = None
        self.update_timeline()
        self.current = None
        self.last_sequence = -1
        self.stop.setEnabled(False)
        self.snapshot_btn.setEnabled(False)
        self.start.setText("Conectar")
        for panel in [self.original, self.enhanced]:
            panel.clear_frame("Sem conexão")
        self.status.setText("Desconectado. Selecione a fonte e clique em Conectar.")
        self.metrics.setText("FPS: —   |   Filtro: — ms   |   Idade no app: — ms")

    def refresh(self):
        self.poll_background()
        self.update_timeline()
        if not self.session:
            return
        packet = self.session.snapshot()
        now = time.perf_counter()
        capture_seq, capture_received = self.session.capture_health()
        capture_active = capture_seq > 0 and now - capture_received <= 0.75
        if packet is None and capture_active:
            self.status.setText("Captura ativa • Aguardando o primeiro tratamento da IA…")
            self.metrics.setText("A fonte está recebendo quadros; o tratamento ainda não terminou.")
            return
        if packet is None:
            self.status.setText(self.session.message)
            failure = getattr(self.session, "failure", "")
            # Capture tries several backends/formats; allow time while it works.
            limit = 45 if self.session.source.kind == "capture" and self.session.process.is_alive() else 15
            if (failure or now - self.session.started > limit) and not self.failed_open:
                self.failed_open = True
                if not failure:
                    hints = " ".join(capture_devices.quick_hints()) if self.session.source.kind == "capture" else ""
                    failure = (f"Nenhum quadro recebido em {limit} s. Confira o dispositivo/backend e clique "
                               f"em Reconectar. {hints} Use Diagnóstico para um relatório completo.")
                self.status.setText(failure)
                self.session.close()
                self.write_session_log(self.session)
                self.session = None
                self.stop.setEnabled(False)
                self.start.setText("Conectar")
            return
        age = now - packet["received"]
        if not capture_active:
            self.current = None
            self.snapshot_btn.setEnabled(False)
            for panel in [self.original, self.enhanced]:
                panel.clear_frame("SEM QUADRO RECENTE\nConfira o sinal e reconecte")
            self.metrics.setText(f"Sem quadro na captura há {max(0, now - capture_received):.1f} s. A imagem anterior foi retirada da tela.")
            self.status.setText(self.session.message if not self.session.process.is_alive() else "A captura não está entregando quadros recentes. Confira a fonte.")
            return
        if age > 0.75:
            self.current = packet
            self.snapshot_btn.setEnabled(False)
            if packet["seq"] != self.last_sequence or self.original.image is None:
                self.render_packet(packet)
                self.last_sequence = packet["seq"]
            warning = f"IMAGEM ATRASADA • {age:.1f} s\nAguardando atualização do tratamento"
            for panel in [self.original, self.enhanced]:
                panel.overlay = warning
                panel.update()
            self.status.setText(f"CAPTURA ATIVA • Tratamento atrasado • {packet.get('processor', '')}")
            self.metrics.setText(f"Idade do quadro exibido: {age * 1000:.0f} ms • A imagem foi mantida; não é vídeo atualizado.")
            return
        if (packet["seq"] == self.last_sequence and self.original.image is not None
                and not self.original.overlay):
            return
        self.last_sequence = packet["seq"]
        self.current = packet
        self.render_packet(packet)
        self.snapshot_btn.setEnabled(True)
        source_w, source_h = packet["source_size"]
        h, w = packet["original"].shape[:2]
        mode = "TESTE COM ARQUIVO" if self.session.source.kind == "file" else "CAPTURA AO VIVO"
        if packet.get("filter_error"):
            self.status.setText("ERRO NO FILTRO • Exibindo original nos dois painéis. Reconecte a fonte.")
            self.enhanced.title = "FILTRO INDISPONÍVEL • original"
        else:
            info = getattr(self.session, "capture_info", "")
            warning = getattr(self.session, "warning", "")
            self.status.setText((f"⚠ {warning}  •  " if warning else "") +
                f"{mode} • Entrada {source_w} × {source_h} • {w} × {h}"
                + (f" • {info}" if info else "") + f" • {packet.get('processor','')}")
        if 'ai_state' in packet:
            state = {"waiting":"Aguardando IA — original", "changed":"Cena mudou — original",
                     "expired":"Correção antiga — original", "black":"Quadro preto — original", "temporal":"Somente restauração temporal — IA aguardando", "applied":"Correção aplicada"}.get(packet['ai_state'], '')
            stages = (f" ({packet['prepare_ms']:.0f} + {packet['render_ms']:.0f} em paralelo)"
                      if 'render_ms' in packet else "")
            latency = f" | Latência no app: {packet['latency_ms']:.0f} ms" if 'latency_ms' in packet else ""
            self.metrics.setText(f"Vídeo: {packet['fps']:.1f} FPS | Aplicação: {packet['processing_ms']:.1f} ms{stages}"
                f"{latency} | IA: {packet['ai_fps']:.1f} análises/s • {packet['ai_ms']:.0f} ms | "
                f"Idade da correção: {packet['ai_age_ms']:.0f} ms | {state}"
                + (f" | {packet['auto']}" if packet.get('auto') else ""))
        else:
            self.metrics.setText(f"Processados: {packet['fps']:.1f} FPS | Filtro: {packet['processing_ms']:.1f} ms | "
                f"Idade no app: {age * 1000:.0f} ms | Quadros pulados pelo app: {packet['skipped']}")

    def render_packet(self, packet):
        self.original.set_frame(packet["original"])
        self.enhanced.set_frame(packet["original"] if self.reference_held else packet["enhanced"])
        self.enhanced.title = ("REFERÊNCIA • original" if self.reference_held else
            "ERRO NO FILTRO • original" if packet.get("filter_error") else
            "TRATAMENTO DESLIGADO • original" if not packet.get("enabled",True) else
            "AGUARDANDO IA • original" if packet.get("ai_state") in ("waiting", "changed", "expired", "black") else
            "RESTAURAÇÃO TEMPORAL • aguardando IA" if packet.get("ai_state")=="temporal" else
            "TRATADA • IA WaterNet" if packet.get("mode")=="ai" else "TRATADA • clássico")

    def hold_original(self, held):
        self.reference_held = held
        if self.current and time.perf_counter() - self.current["received"] < .75:
            self.render_packet(self.current)

    def change_view(self, index):
        self.original.setVisible(index != 1)
        self.enhanced.setVisible(index != 2)

    def toggle_fullscreen(self):
        self.showNormal() if self.isFullScreen() else self.showFullScreen()

    def save_snapshot(self):
        packet = self.current
        if packet is None or time.perf_counter() - packet["received"] > .75:
            return
        name, _ = QFileDialog.getSaveFileName(self, "Salvar comparação", "comparacao_rov.png", "PNG (*.png)")
        if not name:
            return
        if not name.lower().endswith(".png"):
            name += ".png"
        image = np.hstack([packet["original"], packet["enhanced"]])
        image = cv2.copyMakeBorder(image, 40, 0, 0, 0, cv2.BORDER_CONSTANT, value=(20, 14, 11))
        width = packet["original"].shape[1]
        for label, x in [("ORIGINAL", 12), ("TRATADA / FILTROS", width + 12)]:
            cv2.putText(image, label, (x, 27), cv2.FONT_HERSHEY_SIMPLEX, .65, (220, 235, 235), 1, cv2.LINE_AA)
        try:
            success, encoded = cv2.imencode(".png", image)
            if not success:
                raise OSError("encode")
            encoded.tofile(name)
        except OSError:
            QMessageBox.warning(self, "Salvar", "Não foi possível salvar. Escolha uma pasta com permissão de escrita.")

    def show_help(self):
        QMessageBox.information(self,"ROV Live IA — ajuda",
            "Selecione Arquivo de vídeo ou Placa de captura e clique em Conectar.\n"
            "Placa de captura: escolha a Elgato pelo nome. Se o backend falhar, o app tenta o formato nativo e o outro backend.\n"
            "Se não abrir: feche 4K Capture Utility, Camera Hub, OBS e apps de câmera; confira Privacidade > Câmera do Windows.\n"
            "O botão Diagnóstico gera um relatório (pasta logs) com drivers, programas abertos e testes de abertura.\n"
            "A IA detalhada está selecionada. Vídeo fluido analisa em paralelo e trata em dois estágios.\n"
            "Intensidade controla a força da correção. Os outros ajustes pertencem ao modo Clássico.\n"
            "Automático tenta DirectML no Windows; CPU é usada quando não disponível.\n"
            "GPU Automática escolhe o adaptador com mais memória dedicada; o nome aparece no status.\n"
            "Se houver erro, tente CPU e Reconectar.\n"
            "A rede analisa uma versão reduzida e transfere correções ao original.\n"
            "Vídeo fluido verifica correções por até 2 s; sem correspondência usa somente restauração temporal, se ativada.\n"
            "Restauração temporal combina observações; zero desativa. Não recupera o que ficou invisível.\n"
            "O acabamento usa até 640 × 360; o quadro recebido é preservado e recebe as diferenças.\n"
            "Suavizar pontos claros é opcional e pode atenuar detalhes reais.\n"
            "Sem captura recente por 0,75 s, a imagem é retirada. IA atrasada mantém a imagem com aviso.\n"
            "Use Exportar vídeo para gerar um arquivo tratado sem descartar quadros (sem áudio).")

    def export_video(self):
        if self.export_process is not None:
            self.export_last="Exportação cancelada."
            self.export_process.kill()
            return
        source,_=QFileDialog.getOpenFileName(self,"Vídeo para tratar com IA","","Vídeos (*.mp4 *.avi *.mkv *.mov)")
        if not source:return
        dest,_=QFileDialog.getSaveFileName(self,"Salvar vídeo tratado (sem áudio)","video_tratado.mp4","MP4 (*.mp4)")
        if not dest:return
        if not dest.lower().endswith('.mp4'):dest+='.mp4'
        if Path(source).resolve()==Path(dest).resolve():
            QMessageBox.warning(self,"Destino","Escolha um nome diferente do original.");return
        tmp=Path(dest+'.rov-part.mp4')
        if tmp.exists():
            QMessageBox.warning(self,"Destino","Existe uma exportação temporária nesse destino. Escolha outro nome.");return
        self.disconnect()
        settings=self.settings()
        process=QProcess(self);process.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self.export_process=process;self.export_tmp=tmp;self.export_last="Preparando IA…"
        self.export_status.setText(self.export_last);self.export_btn.setText("Cancelar exportação")
        self.start.setEnabled(False)
        process.readyReadStandardOutput.connect(self.export_read)
        process.finished.connect(self.export_finished)
        process.errorOccurred.connect(self.export_error)
        process.start(sys.executable,[str(Path(__file__).with_name('export_video.py')),source,dest,
            '--quality',settings.quality,'--backend',settings.backend,'--device',str(settings.device_id),'--strength',str(settings.strength),'--noise',str(settings.ai_noise),'--sharp',str(settings.ai_sharp),'--specks',str(settings.ai_specks),'--restore',str(settings.ai_restore),'--color',str(settings.ai_color),'--contrast',str(settings.ai_contrast),'--stabilize',str(settings.stabilize)]+(['--auto'] if settings.ai_auto else []))

    def export_read(self):
        if self.export_process:
            lines=bytes(self.export_process.readAllStandardOutput()).decode('utf-8',errors='replace').strip().splitlines()
            if lines:self.export_last=lines[-1];self.export_status.setText(self.export_last)

    def export_error(self,error):
        if error==QProcess.ProcessError.FailedToStart:
            self.export_last="Não foi possível iniciar a exportação."
            self.export_finished(1)

    def export_finished(self,code,*_):
        self.export_read()
        if code and not self.export_last.startswith(('Falha:','Exportação cancelada','Não foi')):
            self.export_last="Exportação interrompida: "+self.export_last
        self.export_status.setText(self.export_last)
        if self.export_tmp and self.export_tmp.exists():self.export_tmp.unlink()
        if self.export_process:self.export_process.deleteLater()
        self.export_process=None;self.export_tmp=None
        self.export_btn.setText("Exportar vídeo com IA");self.start.setEnabled(True)

    def closeEvent(self, event):
        if self.export_process:
            self.export_process.kill();self.export_process.waitForFinished(3000)
        self.timer.stop()
        self.disconnect()
        event.accept()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", help="Abrir um arquivo de vídeo para teste")
    parser.add_argument("--screenshot", help=argparse.SUPPRESS)
    parser.add_argument("--quit-after", type=float, help=argparse.SUPPRESS)
    args = parser.parse_args()
    cv2.setNumThreads(2)
    app = QApplication(sys.argv[:1])
    app.setStyle("Fusion")
    app.setStyleSheet(STYLE)
    window = Window()
    window.show()
    if args.video:
        window.kind.setCurrentIndex(1)
        window.path.setText(args.video)
        QTimer.singleShot(200, window.connect_source)
    if args.screenshot:
        QTimer.singleShot(3500, lambda: window.grab().save(args.screenshot))
    if args.quit_after:
        QTimer.singleShot(int(args.quit_after * 1000), window.close)
    return app.exec()


if __name__ == "__main__":
    mp.freeze_support()
    raise SystemExit(main())
