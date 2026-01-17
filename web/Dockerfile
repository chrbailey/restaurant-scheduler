# =============================================================================
# Web Dockerfile - Multi-stage build for Vite/Refine application
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Copy shared package
COPY shared/package.json shared/
COPY shared/src shared/src/
COPY shared/tsconfig.json shared/

# Copy web package files
COPY web/package.json web/
COPY web/tsconfig.json web/
COPY web/tsconfig.node.json web/
COPY web/vite.config.ts web/
COPY web/index.html web/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy web source code
COPY web/src web/src/
COPY web/public web/public/ 2>/dev/null || true

# Build shared package first
WORKDIR /app/shared
RUN pnpm exec tsc

# Build the application
WORKDIR /app/web

# Set build-time environment variables (can be overridden at build time)
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Production with Nginx
# -----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom nginx configuration
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/web/dist /usr/share/nginx/html

# Add non-root user permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
