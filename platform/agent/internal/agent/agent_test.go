package agent

import (
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestWSBaseDerivation(t *testing.T) {
	cases := []struct {
		api, ws, want string
	}{
		{"http://localhost:8080", "", "ws://localhost:8090"},
		{"https://mdm.example.com", "", "wss://mdm.example.com"},
		{"https://mdm.example.com:9443", "", "wss://mdm.example.com:9443"},
		{"http://api.internal:8080", "wss://ws.internal", "wss://ws.internal"},
	}
	for _, c := range cases {
		a := &Agent{cfg: Config{ServerAPI: c.api, ServerWS: c.ws}}
		if got := a.wsBase(); got != c.want {
			t.Errorf("wsBase(%q, %q) = %q, want %q", c.api, c.ws, got, c.want)
		}
	}
}

func TestWSBaseParseErrorFallback(t *testing.T) {
	a := &Agent{cfg: Config{ServerAPI: "://bad"}}
	if got := a.wsBase(); got != "ws://localhost:8090" {
		t.Errorf("wsBase fallback = %q", got)
	}
}

func TestExecuteRejectsUnknownCommand(t *testing.T) {
	if _, err := execute("rm -rf /", time.Second); err == nil {
		t.Fatal("expected error for unknown command code")
	}
}

func TestSystemCommandMapping(t *testing.T) {
	bin, args := restartCmd()
	if runtime.GOOS == "darwin" {
		if bin != "shutdown" || len(args) == 0 {
			t.Fatalf("restartCmd darwin = %q %v", bin, args)
		}
	} else {
		if bin != "shutdown" || len(args) == 0 {
			t.Fatalf("restartCmd windows = %q %v", bin, args)
		}
	}
	lockBin, _ := lockCmd()
	if runtime.GOOS == "windows" && lockBin != "rundll32.exe" {
		t.Fatalf("lockCmd windows = %q", lockBin)
	}
}

func TestCollectSoftwareSkipsSystemPlaceholders(t *testing.T) {
	list := []Software{{Name: "Foo.app", InstallPath: "/Applications/Foo.app"}}
	if len(list) != 1 {
		t.Fatal("expected one item")
	}
	if !strings.Contains(list[0].Name, "Foo") {
		t.Fatal("name mangled")
	}
}
