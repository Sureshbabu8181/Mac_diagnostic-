package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPaginationDefaults(t *testing.T) {
	r := httptest.NewRequest("GET", "/?page=0&page_size=0", nil)
	page, size := Pagination(r)
	if page != 1 || size != 50 {
		t.Fatalf("got page=%d size=%d, want 1,50", page, size)
	}
}

func TestPaginationParsesAndClamps(t *testing.T) {
	r := httptest.NewRequest("GET", "/?page=3&page_size=500", nil)
	page, size := Pagination(r)
	if page != 3 || size != 200 {
		t.Fatalf("got page=%d size=%d, want 3,200", page, size)
	}
}

func TestPaginationIgnoresGarbage(t *testing.T) {
	r := httptest.NewRequest("GET", "/?page=abc&page_size=xyz", nil)
	page, size := Pagination(r)
	if page != 1 || size != 50 {
		t.Fatalf("got page=%d size=%d, want 1,50", page, size)
	}
}

func TestError(t *testing.T) {
	rec := httptest.NewRecorder()
	Error(rec, http.StatusForbidden, "forbidden", "nope")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q", ct)
	}
	var body ErrorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.Error.Code != "forbidden" || body.Error.Message != "nope" {
		t.Fatalf("body = %+v", body.Error)
	}
}

func TestJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	JSON(rec, http.StatusOK, map[string]int{"n": 1})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var got map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got["n"] != 1 {
		t.Fatalf("body = %v", got)
	}
}
