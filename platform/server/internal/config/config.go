package config

import "os"

type Config struct {
	DatabaseURL    string
	RedisURL       string
	NATSURL        string
	JWTSecret      string
	JWTIssuer      string
	TokenTTLMin    int
	RefreshTTLHours int
	APIPort        string
	GatewayPort    string
}

func Load() Config {
	return Config{
		DatabaseURL:     getenv("DATABASE_URL", "postgres://sunrise:sunrise_dev_password@localhost:5432/sunrise?sslmode=disable"),
		RedisURL:        getenv("REDIS_URL", "redis://localhost:6379"),
		NATSURL:         getenv("NATS_URL", "nats://localhost:4222"),
		JWTSecret:       getenv("JWT_SECRET", "dev-secret-change-me"),
		JWTIssuer:       getenv("JWT_ISSUER", "sunrise-mdm"),
		TokenTTLMin:     15,
		RefreshTTLHours: 8,
		APIPort:         getenv("API_PORT", "8080"),
		GatewayPort:     getenv("GATEWAY_PORT", "8090"),
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
