"""Test modules for the Windows Diagnostic Center.

`automated` holds headless tests that return a TestOutcome. Interactive tests
(display, keyboard, touchpad, speakers, mic, camera) live in the GUI layer and
are wired into the dashboard; stress/fan tests have both a headless probe and a
GUI controller.
"""

from .automated import AUTOMATED_TESTS  # noqa: F401
