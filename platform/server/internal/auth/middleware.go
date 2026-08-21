package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

type ctxKey string

const claimsKey ctxKey = "claims"

func ClaimsFrom(ctx context.Context) *Claims {
	if c, ok := ctx.Value(claimsKey).(*Claims); ok {
		return c
	}
	return nil
}

func withClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

// Middleware validates the Bearer token and stores claims in the context.
func Middleware(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" || !strings.HasPrefix(header, "Bearer ") {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
				return
			}
			claims, err := Parse(secret, strings.TrimPrefix(header, "Bearer "))
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "invalid token")
				return
			}
			next.ServeHTTP(w, r.WithContext(withClaims(r.Context(), claims)))
		})
	}
}
