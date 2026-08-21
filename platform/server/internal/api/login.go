package api

import (
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

// Dev login for local MVP. Production authentication is Keycloak OIDC/SAML.
func (a *Handler) devLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}

	var userID, tenantID, role string
	var departments []byte
	var hash *string
	err := a.DB.QueryRow(r.Context(), `
		SELECT u.id, u.tenant_id, r.name, u.password_hash, ur.department_ids
		FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN roles r ON r.id = ur.role_id
		WHERE u.email = $1 AND u.status = 'active' LIMIT 1`, in.Email).
		Scan(&userID, &tenantID, &role, &hash, &departments)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}
	if hash == nil || bcrypt.CompareHashAndPassword([]byte(*hash), []byte(in.Password)) != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}

	depts := []string{}
	_ = jsonUnmarshal(departments, &depts)

	token, err := auth.Sign(a.Cfg.JWTSecret, a.Cfg.JWTIssuer, auth.Claims{
		UserID: userID, TenantID: tenantID, Role: role, Departments: depts, Email: in.Email,
	}, time.Duration(a.Cfg.TokenTTLMin)*time.Minute)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "token_type": "bearer", "expires_in": a.Cfg.TokenTTLMin * 60})
}
