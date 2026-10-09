# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (Railway). All paths below are server/-relative.
FROM golang:1.26-alpine AS build
WORKDIR /app
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -o /api ./cmd/api && \
    CGO_ENABLED=0 go build -o /migrate ./cmd/migrate && \
    CGO_ENABLED=0 go build -o /worker ./cmd/worker

FROM alpine:3.21
RUN adduser -D -u 10001 app && \
    mkdir -p /home/app && chown app:app /home/app
COPY server/entrypoint.sh /entrypoint.sh
COPY --from=build /api /migrate /worker /usr/local/bin/
USER app
# PORT is injected by Railway at runtime; config reads $PORT.
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
