# syntax=docker/dockerfile:1
FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /api ./cmd/api

FROM alpine:3.21
RUN adduser -D -u 10001 app
USER app
COPY --from=build /api /api
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/api"]
