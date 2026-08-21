package agent

import (
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const Version = "0.1.0-mvp"

type osInfo struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	OSVersion    string `json:"os_version"`
	OSBuild      string `json:"os_build"`
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	SerialNumber string `json:"serial_number"`
}

type Software struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Publisher   string `json:"publisher"`
	InstallPath string `json:"install_path"`
	PackageID   string `json:"package_id"`
	InstallDate string `json:"install_date"`
}

type Network struct {
	Iface   string `json:"iface"`
	IPv4    string `json:"ipv4"`
	IPv6    string `json:"ipv6"`
	MAC     string `json:"mac"`
	SSID    string `json:"ssid"`
	Gateway string `json:"gateway"`
}

func run(cmd string, args ...string) string {
	c := exec.Command(cmd, args...)
	done := make(chan string, 1)
	go func() {
		out, err := c.Output()
		if err != nil {
			done <- ""
			return
		}
		done <- strings.TrimSpace(string(out))
	}()
	select {
	case r := <-done:
		return r
	case <-time.After(5 * time.Second):
		_ = c.Process.Kill()
		return ""
	}
}

func osName() string {
	switch runtime.GOOS {
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	default:
		return runtime.GOOS
	}
}

func collectOSInfo() osInfo {
	h, _ := os.Hostname()
	info := osInfo{Hostname: h, OS: osName()}
	if runtime.GOOS == "darwin" {
		info.OSVersion = run("sw_vers", "-productVersion")
		info.OSBuild = run("sw_vers", "-buildVersion")
	} else if runtime.GOOS == "windows" {
		info.OSVersion = run("cmd", "/c", "ver")
	} else {
		info.OSVersion = run("uname", "-r")
	}
	return info
}

func collectHardware() map[string]any {
	hw := map[string]any{}
	info := collectOSInfo()
	hw["os_version"] = info.OSVersion
	hw["os_build"] = info.OSBuild
	hw["manufacturer"] = info.Manufacturer
	hw["model"] = info.Model

	if runtime.GOOS == "darwin" {
		if mem := run("sysctl", "-n", "hw.memsize"); mem != "" {
			if mb, err := strconv.ParseInt(mem, 10, 64); err == nil {
				hw["ram_mb"] = mb / 1024 / 1024
			}
		}
		hw["cpu"] = run("sysctl", "-n", "machdep.cpu.brand_string")
		hw["gpu"] = run("system_profiler", "SPDisplaysDataType", "-detailLevel", "mini")
	} else if runtime.GOOS == "windows" {
		hw["cpu"] = run("wmic", "cpu", "get", "name")
		hw["ram_mb"] = run("wmic", "computersystem", "get", "TotalPhysicalMemory")
	}
	return hw
}

func collectSoftware() []Software {
	list := []Software{}
	if runtime.GOOS == "darwin" {
		for _, dir := range []string{"/Applications", "/System/Applications"} {
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, e := range entries {
				if e.IsDir() && strings.HasSuffix(e.Name(), ".app") {
					list = append(list, Software{
						Name:        strings.TrimSuffix(e.Name(), ".app"),
						InstallPath: dir + "/" + e.Name(),
					})
				}
			}
		}
	} else if runtime.GOOS == "windows" {
		out := run("wmic", "product", "get", "name,version")
		for _, line := range strings.Split(out, "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 && !strings.Contains(line, "Name") {
				name := strings.Join(fields[:len(fields)-1], " ")
				ver := fields[len(fields)-1]
				list = append(list, Software{Name: strings.TrimSpace(name), Version: strings.TrimSpace(ver)})
			}
		}
	}
	return list
}

func collectNetwork() []Network {
	list := []Network{}
	ifaces, err := net.Interfaces()
	if err != nil {
		return list
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		n := Network{Iface: iface.Name, MAC: iface.HardwareAddr.String()}
		for _, a := range addrs {
			ip, _, err := net.ParseCIDR(a.String())
			if err != nil {
				continue
			}
			if ip.To4() != nil {
				n.IPv4 = ip.String()
			} else if ip.To16() != nil {
				n.IPv6 = ip.String()
			}
		}
		if n.IPv4 != "" || n.MAC != "" {
			list = append(list, n)
		}
	}
	return list
}

func primaryIP() (string, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ip, _, err := net.ParseCIDR(a.String())
			if err != nil {
				continue
			}
			if ip.To4() != nil {
				return ip.String(), nil
			}
		}
	}
	return "", os.ErrNotExist
}