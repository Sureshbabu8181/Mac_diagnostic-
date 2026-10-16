"""Manual diagnostic providers.

These carry only metadata. The GUI owns the interactive screens (display
patterns, keyboard capture, audio loops, camera preview) and reports the
technician's verdict back to the engine. No run() here.
"""

from __future__ import annotations

from ..models import DiagnosticKind
from ..providers import DiagnosticMeta, ManualDiagnosticProvider, PermissionKind


class DisplayManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.DISPLAY,
            title="Display",
            why_it_matters="Visual patterns reveal dead pixels, stuck pixels and backlight bleed.",
            is_manual=True,
        )


class KeyboardManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.KEYBOARD,
            title="Keyboard",
            why_it_matters="Key-by-key capture confirms every key registers and detects stuck keys.",
            is_manual=True,
        )


class TrackpadManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.TRACKPAD,
            title="Trackpad / Mouse",
            why_it_matters="Click and gesture capture verifies the pointing device responds correctly.",
            is_manual=True,
        )


class SpeakersManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.SPEAKERS,
            title="Speakers",
            why_it_matters="Tone playback lets the technician confirm both channels produce clean audio.",
            is_manual=True,
        )


class MicrophoneManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.MICROPHONE,
            title="Microphone",
            why_it_matters="Live level metering confirms the mic captures sound without clipping.",
            is_manual=True,
            needs_permission=PermissionKind.MICROPHONE,
        )


class CameraManual(ManualDiagnosticProvider):
    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.CAMERA,
            title="Camera",
            why_it_matters="Live preview confirms the camera produces a clear image.",
            is_manual=True,
            needs_permission=PermissionKind.CAMERA,
        )
