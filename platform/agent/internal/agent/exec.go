package agent

import (
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

type ExecResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

func (a *Agent) version() string { return Version }

func execute(code string, timeout time.Duration) (ExecResult, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	switch code {
	case "restart":
		bin, args := restartCmd()
		return runSystem(bin, args, timeout)
	case "shutdown":
		bin, args := shutdownCmd()
		return runSystem(bin, args, timeout)
	case "lock_screen":
		bin, args := lockCmd()
		return runSystem(bin, args, timeout)
	case "collect_logs":
		bin, args := logCmd()
		return runSystem(bin, args, timeout)
	default:
		return ExecResult{}, fmt.Errorf("unknown command code %q", code)
	}
}

func restartCmd() (string, []string) {
	if runtime.GOOS == "darwin" {
		return "shutdown", []string{"-r", "now"}
	}
	return "shutdown", []string{"/r", "/t", "0"}
}

func shutdownCmd() (string, []string) {
	if runtime.GOOS == "darwin" {
		return "shutdown", []string{"-h", "now"}
	}
	return "shutdown", []string{"/s", "/t", "0"}
}

func lockCmd() (string, []string) {
	if runtime.GOOS == "darwin" {
		return "pmset", []string{"displaysleepnow"}
	}
	return "rundll32.exe", []string{"user32.dll,LockWorkStation"}
}

func logCmd() (string, []string) {
	if runtime.GOOS == "darwin" {
		return "log", []string{"show", "--last", "5m", "--style", "compact"}
	}
	return "wevtutil", []string{"qe", "System", "/c:50", "/f:text"}
}

func runSystem(bin string, args []string, timeout time.Duration) (ExecResult, error) {
	c := exec.Command(bin, args...)
	var out ExecResult
	done := make(chan error, 1)
	go func() {
		b, err := c.CombinedOutput()
		out.Stdout = string(b)
		out.Stderr = string(b)
		if err != nil {
			if ee, ok := err.(*exec.ExitError); ok {
				out.ExitCode = ee.ExitCode()
			} else {
				out.ExitCode = 1
			}
			done <- err
			return
		}
		out.ExitCode = 0
		done <- nil
	}()
	select {
	case err := <-done:
		return out, err
	case <-time.After(timeout):
		_ = c.Process.Kill()
		return out, fmt.Errorf("command timed out")
	}
}