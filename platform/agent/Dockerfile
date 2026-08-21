# syntax=docker/dockerfile:1
# Cross-compile the Sunrise agent for macOS (amd64/arm64) and Windows (amd64).
# Run: docker build --build-arg GOOS=darwin --build-arg GOARCH=arm64 -o out/agent-darwin-arm64 .
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG GOOS=linux
ARG GOARCH=amd64
RUN CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH go build -trimpath -ldflags="-s -w" -o /out/agent ./cmd/agent

FROM scratch AS export
COPY --from=build /out/agent /agent
