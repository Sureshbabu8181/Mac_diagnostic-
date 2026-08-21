package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/auth"
)

// perm is exercised through the real auth middleware so the claims path is tested.
func permHandler(secret, role, permCode string) http.Handler {
	h := &Handler{}
	fn := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}
	mw := auth.Middleware(secret)
	return mw(perm(h, permCode, fn))
}

func testToken(t *testing.T, secret, role string) string {
	t.Helper()
	tok, err := auth.Sign(secret, "sunrise-mdm", auth.Claims{
		UserID: "u1", TenantID: "t1", Role: role,
	}, 5*time.Minute)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	return tok
}

func TestPermAllowsAuthorizedRole(t *testing.T) {
	h := permHandler("sec", "Security Admin", "patches:approve")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+testToken(t, "sec", "Security Admin"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestPermRejectsUnauthorizedRole(t *testing.T) {
	h := permHandler("sec", "Helpdesk", "patches:approve")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+testToken(t, "sec", "Helpdesk"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestPermRejectsMissingToken(t *testing.T) {
	h := permHandler("sec", "Helpdesk", "devices:read")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestPermRejectsInvalidToken(t *testing.T) {
	h := permHandler("sec", "Helpdesk", "devices:read")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
