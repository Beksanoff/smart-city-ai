# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy source code
COPY . .

# Generate go.sum and download dependencies
RUN go mod tidy
RUN go mod download

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS calls
RUN apk --no-cache add ca-certificates wget

# Copy binary from builder
COPY --from=builder /app/main .

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
CMD ["./main"]
