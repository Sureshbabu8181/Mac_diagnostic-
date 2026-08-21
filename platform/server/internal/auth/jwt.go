package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID      string   `json:"uid"`
	TenantID    string   `json:"tid"`
	Role        string   `json:"role"`
	Departments []string `json:"depts,omitempty"`
	Email       string   `json:"email"`
	DeviceID    string   `json:"did,omitempty"`
	Purpose     string   `json:"purpose,omitempty"`
	jwt.RegisteredClaims
}

func Sign(secret, issuer string, claims Claims, ttl time.Duration) (string, error) {
	claims.Issuer = issuer
	claims.IssuedAt = jwt.NewNumericDate(time.Now())
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(ttl))
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func Parse(secret string, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	return claims, nil
}
