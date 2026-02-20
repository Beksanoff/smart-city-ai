# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build args for Vite (embedded at build time)
ARG VITE_API_URL
ARG VITE_YANDEX_MAPS_API_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_YANDEX_MAPS_API_KEY=${VITE_YANDEX_MAPS_API_KEY}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
