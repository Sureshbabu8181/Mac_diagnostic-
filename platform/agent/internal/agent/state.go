package agent

import (
	"os"
	"path/filepath"
)

type state struct {
	DeviceUUID string `json:"device_uuid"`
	DeviceID   string `json:"device_id"`
	Token      string `json:"token"`
}

func statePath(dir string) string { return filepath.Join(dir, "state.json") }

func loadState(dir string) (state, error) {
	var s state
	b, err := os.ReadFile(statePath(dir))
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return s, err
	}
	_ = jsonUnmarshal(b, &s)
	return s, nil
}

func saveState(dir string, s state) error {
	b, _ := jsonMarshal(s)
	return os.WriteFile(statePath(dir), b, 0600)
}