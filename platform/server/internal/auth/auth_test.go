package auth

import (
	"testing"
	"time"
)

const testSecret = "unit-test-secret"

func TestSignParseRoundtrip(t *testing.T) {
	tok, err := Sign(testSecret, "sunrise-mdm", Claims{
		UserID: "u1", TenantID: "t1", Role: "Super Admin", Email: "a@b.c", Purpose: "device", DeviceID: "d1",
	}, 15*time.Minute)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	c, err := Parse(testSecret, tok)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c.UserID != "u1" || c.TenantID != "t1" || c.Role != "Super Admin" || c.Email != "a@b.c" {
		t.Fatalf("claims not preserved: %+v", c)
	}
	if c.Purpose != "device" || c.DeviceID != "d1" {
		t.Fatalf("device claims not preserved: %+v", c)
	}
	if c.Issuer != "sunrise-mdm" {
		t.Fatalf("issuer not set: %+v", c.Issuer)
	}
}

func TestParseRejectsWrongSecret(t *testing.T) {
	tok, _ := Sign(testSecret, "issuer", Claims{UserID: "u"}, time.Minute)
	if _, err := Parse("other-secret", tok); err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestParseRejectsTamperedToken(t *testing.T) {
	tok, _ := Sign(testSecret, "issuer", Claims{UserID: "u"}, time.Minute)
	if _, err := Parse(testSecret, tok+"x"); err == nil {
		t.Fatal("expected error for tampered token")
	}
}

func TestParseRejectsExpiredToken(t *testing.T) {
	tok, _ := Sign(testSecret, "issuer", Claims{UserID: "u"}, -time.Minute)
	if _, err := Parse(testSecret, tok); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestParseRejectsNonHS256(t *testing.T) {
	// Sign with the default method is HS256; craft via RS256 is unnecessary —
	// verify the algorithm allow-list rejects a token signed with none/HS512.
	tok := "eyJhbGciOiJub25lIn0.eyJ1aWQiOiJ1In0."
	if _, err := Parse(testSecret, tok); err == nil {
		t.Fatal("expected error for alg:none token")
	}
}

func TestHasPermission(t *testing.T) {
	cases := []struct {
		role, perm string
		want       bool
	}{
		{"Super Admin", "anything:at:all", true},
		{"IT Admin", "jobs:approve", true},
		{"Helpdesk", "jobs:create", true},
		{"Helpdesk", "jobs:approve", false},
		{"Asset Manager", "devices:read", true},
		{"Asset Manager", "jobs:create", false},
		{"Security Admin", "patches:approve", true},
		{"Read Only", "jobs:read", true},
		{"Read Only", "jobs:create", false},
		{"Auditor", "audit:read", true},
		{"Auditor", "devices:write", false},
		{"Unknown Role", "devices:read", false},
	}
	for _, c := range cases {
		if got := HasPermission(c.role, c.perm); got != c.want {
			t.Errorf("HasPermission(%q, %q) = %v, want %v", c.role, c.perm, got, c.want)
		}
	}
}
