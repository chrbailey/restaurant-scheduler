# Restaurant Scheduler - Local Development Setup

This guide covers setting up the local development environment for the Restaurant Scheduler application.

## Prerequisites

- **Node.js** >= 22.0.0
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- **npm** (comes with Node.js)

## Quick Start

### 1. Start Docker Services

Start PostgreSQL and Redis containers:

```bash
# Start services in background
docker compose up -d

# Verify services are running
docker compose ps

# Check service health
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

Wait for both services to be healthy before proceeding.

### 2. Configure Environment Variables

The backend `.env` file should already be configured. If not, copy from the example:

```bash
cp backend/.env.example backend/.env
```

Verify the database connection string in `backend/.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurant_scheduler?schema=public"
```

### 3. Install Dependencies

From the project root:

```bash
npm install
```

### 4. Run Database Migrations

Generate Prisma client and run migrations:

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations to create database schema
npx prisma migrate dev

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 5. Seed the Database (Optional)

If a seed script exists:

```bash
cd backend
npx prisma db seed
```

### 6. Start the Development Servers

From the project root:

```bash
# Start backend
npm run backend:dev

# In another terminal - Start web dashboard
npm run web:dev

# In another terminal - Start mobile app
npm run mobile:start
```

## Docker Commands Reference

### Service Management

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Stop and remove volumes (DESTROYS DATA)
docker compose down -v

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f postgres
docker compose logs -f redis
```

### Database Operations

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d restaurant_scheduler

# Create database dump
docker compose exec postgres pg_dump -U postgres restaurant_scheduler > backup.sql

# Restore database
docker compose exec -T postgres psql -U postgres restaurant_scheduler < backup.sql
```

### Redis Operations

```bash
# Connect to Redis CLI
docker compose exec redis redis-cli

# Check Redis info
docker compose exec redis redis-cli INFO
```

## Prisma Commands Reference

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create and apply migrations (development)
npx prisma migrate dev --name descriptive_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (DESTROYS DATA)
npx prisma migrate reset

# View database in browser
npx prisma studio

# Format schema file
npx prisma format

# Validate schema
npx prisma validate
```

## Environment Variables

Key environment variables in `backend/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/restaurant_scheduler?schema=public` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for JWT token signing | (generated) |
| `PORT` | Backend server port | `3000` |

## Troubleshooting

### Port Already in Use

If port 5432 or 6379 is already in use:

```bash
# Check what's using the port
lsof -i :5432
lsof -i :6379

# Or modify docker-compose.yml to use different ports
```

### Database Connection Issues

1. Verify Docker containers are running: `docker compose ps`
2. Check container logs: `docker compose logs postgres`
3. Verify DATABASE_URL in `.env` matches docker-compose settings

### Prisma Migration Issues

```bash
# Reset database and reapply all migrations
npx prisma migrate reset

# If schema is out of sync
npx prisma db push --force-reset
```

### Permission Issues on Mac/Linux

```bash
# If volume permissions are problematic
docker compose down -v
docker compose up -d
```

## Architecture Overview

```
restaurant-scheduler/
├── backend/           # NestJS API server
│   ├── prisma/        # Database schema and migrations
│   └── src/           # Source code
├── mobile/            # React Native (Expo) mobile app
├── web/               # React admin dashboard
├── shared/            # Shared TypeScript types
└── docker-compose.yml # Local development services
```

## Ports

| Service | Port |
|---------|------|
| Backend API | 3000 |
| Web Dashboard | 5173 (Vite default) |
| Mobile (Expo) | 8081 |
| PostgreSQL | 5432 |
| Redis | 6379 |
