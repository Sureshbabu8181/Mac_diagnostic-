package agent

import (
	"bufio"
	"encoding/json"
	"os"
	"sync"
)

type queuedResult struct {
	JobTargetID string `json:"job_target_id"`
	Status      string `json:"status"`
	ExitCode    *int   `json:"exit_code"`
	Stdout      string `json:"stdout"`
	Stderr      string `json:"stderr"`
	Attempt     int    `json:"attempt"`
}

type Queue struct {
	path string
	mu   sync.Mutex
}

func NewQueue(path string) *Queue { return &Queue{path: path} }

func (q *Queue) Enqueue(r queuedResult) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(q.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(b, '\n'))
	return err
}

func (q *Queue) ReadAll() ([]queuedResult, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	f, err := os.Open(q.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()
	var items []queuedResult
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var r queuedResult
		if err := json.Unmarshal(sc.Bytes(), &r); err != nil {
			continue
		}
		items = append(items, r)
	}
	return items, sc.Err()
}

func (q *Queue) Rewrite(items []queuedResult) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	f, err := os.Create(q.path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for _, r := range items {
		b, _ := json.Marshal(r)
		w.Write(append(b, '\n'))
	}
	return w.Flush()
}

func (a *Agent) syncQueue() {
	items, err := a.queue.ReadAll()
	if err != nil || len(items) == 0 {
		return
	}
	var keep []queuedResult
	for _, r := range items {
		if err := a.client.SubmitResult(r.JobTargetID, r.Status, r.ExitCode, r.Stdout, r.Stderr, r.Attempt); err != nil {
			keep = append(keep, r)
		}
	}
	if err := a.queue.Rewrite(keep); err != nil {
		return
	}
}