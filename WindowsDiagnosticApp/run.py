#!/usr/bin/env python3
"""Launcher for the Windows Diagnostic Center dashboard.

Run:  python run.py
"""

import sys

from windiag.app import main

if __name__ == "__main__":
    sys.exit(main())
