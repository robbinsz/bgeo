# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-alpine
ARG GO_IMAGE=golang:1.26.6-alpine
ARG RUNTIME_IMAGE=alpine:3.23

FROM ${NODE_IMAGE} AS frontend
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM ${GO_IMAGE} AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY pkg/ ./pkg/
# PostgreSQL is the only production driver. SQLite's CGO implementation is not needed.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/server ./cmd/worker ./cmd/manage

FROM ${RUNTIME_IMAGE} AS production
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 10001 app \
    && adduser -D -H -u 10001 -G app app \
    && mkdir -p /app/data/uploads/avatars \
    && chown -R app:app /app
WORKDIR /app
COPY --from=backend /out/ /usr/local/bin/
COPY --from=frontend --chown=app:app /src/web/dist/ ./web/dist/
USER 10001:10001
EXPOSE 8080
CMD ["server"]
