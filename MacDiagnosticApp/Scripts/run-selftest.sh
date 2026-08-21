# Self-test runner for environments without Xcode/XCTest (CLI tools only).
# Runs the same verification logic via a small executable and exits non-zero on
# failure. The XCTest suite in Tests/ runs under Xcode/CI.
swift run macdiagnostic-selftest
