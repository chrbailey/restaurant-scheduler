# =============================================================================
# Backend Dockerfile - Multi-stage build for NestJS application
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

# Copy backend package files
COPY backend/package.json backend/
COPY backend/tsconfig.json backend/
COPY backend/nest-cli.json backend/
COPY backend/prisma backend/prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy backend source code
COPY backend/src backend/src/

# Generate Prisma client
WORKDIR /app/backend
RUN pnpm exec prisma generate

# Build shared package first
WORKDIR /app/shared
RUN pnpm exec tsc

# Build the application
WORKDIR /app/backend
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:22-alpine AS production

# Install pnpm for production dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# Copy package files for production install
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY shared/package.json shared/
COPY backend/package.json backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy Prisma schema and generate client
COPY backend/prisma backend/prisma/
WORKDIR /app/backend
RUN pnpm exec prisma generate

# Copy built applications
COPY --from=builder /app/shared/dist /app/shared/dist
COPY --from=builder /app/backend/dist /app/backend/dist

# Set ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

WORKDIR /app/backend

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
