package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type EnrollResponse struct {
	DeviceID string `json:"device_id"`
	Token    string `json:"token"`
}

type Job struct {
	JobTargetID   string         `json:"job_target_id"`
	Command       string         `json:"command"`
	TimeoutSeconds int           `json:"timeout_seconds"`
	Args          map[string]any `json:"args"`
}

type Client struct {
	Base   string
	Token  string
	HTTP   *http.Client
}

func NewClient(base, token string) *Client {
	return &Client{Base: base, Token: token, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func Enroll(base, enrollToken, deviceUUID string, info osInfo) (*EnrollResponse, error) {
	body, _ := json.Marshal(map[string]any{
		"enrollment_token": enrollToken,
		"device_uuid":      deviceUUID,
		"hostname":         info.Hostname,
		"os":               info.OS,
		"os_version":       info.OSVersion,
		"os_build":         info.OSBuild,
		"manufacturer":     info.Manufacturer,
		"model":            info.Model,
		"serial_number":    info.SerialNumber,
		"agent_version":    Version,
	})
	resp, err := http.Post(base+"/api/v1/agent/enroll", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("enroll status %d: %s", resp.StatusCode, string(b))
	}
	var out EnrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Heartbeat(agentVersion, ip string) error {
	body, _ := json.Marshal(map[string]any{"agent_version": agentVersion, "ip": ip})
	return c.post("/api/v1/agent/heartbeat", body)
}

func (c *Client) PostInventory(hw map[string]any, sw []Software, net []Network) error {
	body, _ := json.Marshal(map[string]any{"hardware": hw, "software": sw, "network": net})
	return c.post("/api/v1/agent/inventory", body)
}

func (c *Client) PollJobs() ([]Job, error) {
	req, err := http.NewRequest(http.MethodGet, c.Base+"/api/v1/agent/jobs", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Items []Job `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

func (c *Client) SubmitResult(jobTargetID, status string, exitCode *int, stdout, stderr string, attempt int) error {
	body, _ := json.Marshal(map[string]any{
		"status": status, "exit_code": exitCode, "stdout": stdout, "stderr": stderr, "attempt": attempt,
	})
	return c.post("/api/v1/agent/jobs/"+jobTargetID+"/result", body)
}

func (c *Client) post(path string, body []byte) error {
	req, err := http.NewRequest(http.MethodPost, c.Base+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s: %s", resp.Status, string(b))
	}
	return nil
}

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }
func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }