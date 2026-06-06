# syntax=docker/dockerfile:1
ARG BUILDPLATFORM=linux/amd64
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build

WORKDIR /src
COPY apps/postal-sendgrid-shim/go.mod apps/postal-sendgrid-shim/go.sum ./
RUN go mod download
COPY apps/postal-sendgrid-shim ./
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/postal-sendgrid-shim .

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/postal-sendgrid-shim /app/postal-sendgrid-shim
VOLUME ["/data"]
ENV LISTEN_ADDR=:8080
ENV DATABASE_PATH=/data/postal-sendgrid-shim.db
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/postal-sendgrid-shim"]
