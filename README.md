# Restaurant Staff Scheduling Platform

[![Backend Tests](https://img.shields.io/badge/backend-183%20tests-brightgreen)]()
[![Mobile Tests](https://img.shields.io/badge/mobile-310%20tests-brightgreen)]()
[![Web Tests](https://img.shields.io/badge/web-444%20tests-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-green)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

A modern, full-stack scheduling platform for restaurants featuring **multi-employer networks**, **self-service shift management**, and **ghost kitchen operations**. Built with a focus on reducing manager overhead while maximizing worker flexibility.

![Platform Overview](docs/assets/platform-overview.png)

## Key Features

### For Workers (Mobile App)
- **Multi-Restaurant Employment** - Work at multiple restaurants within trusted networks
- **Self-Service Shift Claiming** - Browse and claim open shifts instantly
- **Shift Swaps & Trades** - Direct swaps with coworkers or post to the shift pool
- **Real-Time Notifications** - Push alerts for new shifts, swap requests, and reminders
- **Ghost Kitchen Mode** - Pick up delivery-only shifts during high-demand periods

### For Managers (Web Dashboard)
- **Visual Schedule Builder** - Drag-and-drop shift creation and assignment
- **Smart Coverage Alerts** - Identify gaps before they become problems
- **Claim Approval Queue** - Review and approve shift claims with priority scoring
- **Ghost Kitchen Control** - One-click activation of delivery-only operations
- **Cross-Restaurant Visibility** - See availability across your network

### Ghost Kitchen Operations
- **Demand Forecasting** - Weather-aware predictions for dine-in vs. delivery
- **Order Aggregation** - Unified interface for DoorDash, UberEats, Grubhub
- **Capacity Management** - Real-time order throttling and acceptance
- **Separate P&L Tracking** - Analytics specifically for delivery operations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile App (React Native)                 │
│     Workers: Schedule, Claim Shifts, Swap, Availability     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Web Dashboard (Refine + React)             │
│   Managers: Scheduling, Approvals, Analytics, Ghost Mode    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Modular Monolith                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Identity │ │Scheduling│ │Shift Pool│ │  Ghost   │       │
│  │  Module  │ │  Module  │ │  Module  │ │ Kitchen  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│        PostgreSQL (RLS)  │  Redis  │  BullMQ               │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile** | React Native 0.83 + Expo SDK 55 |
| **Web** | React 19 + Refine + Ant Design |
| **Backend** | Node.js 22 + NestJS + TypeScript |
| **Database** | PostgreSQL 16 with Row-Level Security |
| **Cache/Realtime** | Redis + WebSockets |
| **Queue** | BullMQ for background jobs |
| **Testing** | Jest (Mobile/Backend) + Vitest (Web) |

## Quick Start

### Prerequisites

- Node.js 22+ (LTS)
- pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL 16+
- Redis 7+
- Docker (optional, for local services)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/restaurant-scheduler.git
cd restaurant-scheduler

# Install dependencies
pnpm install

# Set up environment variables
cp .env.production.example .env

# Start local services (PostgreSQL + Redis)
docker-compose up -d

# Run database migrations
pnpm backend:migrate

# Start all services
pnpm backend:dev    # API server on :3000
pnpm web:dev        # Web dashboard on :5173
pnpm mobile:start   # Expo dev server
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm backend:test   # 183 tests
pnpm --filter mobile test   # 310 tests
pnpm --filter web test      # 444 tests
```

## Project Structure

```
restaurant-scheduler/
├── backend/                 # NestJS API server
│   ├── src/
│   │   ├── modules/
│   │   │   ├── identity/    # User & worker profiles
│   │   │   ├── scheduling/  # Shifts & assignments
│   │   │   ├── shift-pool/  # Claims & matching
│   │   │   ├── network/     # Multi-restaurant networks
│   │   │   └── ghost-kitchen/ # Delivery operations
│   │   └── common/          # Shared utilities
│   └── prisma/              # Database schema & migrations
│
├── mobile/                  # React Native (Expo) app
│   ├── app/                 # File-based routing (Expo Router)
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API clients
│   │   └── stores/          # Zustand state management
│   └── test/                # Test utilities & mocks
│
├── web/                     # Refine admin dashboard
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/           # Route pages
│   │   ├── hooks/           # Custom hooks
│   │   └── providers/       # Context providers
│   └── test/                # Test utilities
│
├── shared/                  # Shared types & utilities
│   └── types/               # TypeScript interfaces
│
└── docs/                    # Additional documentation
```

## Core Concepts

### Shift Lifecycle

```
DRAFT → PUBLISHED_UNASSIGNED → PUBLISHED_CLAIMED → CONFIRMED → IN_PROGRESS → COMPLETED
              ↓                        ↓
       PUBLISHED_OFFERED         (swap/trade flows)
              ↓
         back to pool
```

### Priority Scoring System

When multiple workers claim the same shift, priority is calculated as:

| Factor | Points |
|--------|--------|
| Own employee (same restaurant) | +1000 |
| Primary tier employee | +100 |
| Reputation score (0-5 rating) | 0-500 |
| Reliability bonus (>4.5 rating) | +50 |
| No-show penalty (per incident) | -25 |
| Claim time (minutes early) | +1 (max 60) |

### Network Visibility Phases

1. **0-2 hours**: Own employees only see the shift
2. **2+ hours**: Network workers can view and claim (filtered by reputation, distance)

## API Documentation

API documentation is available at `/api/docs` when running the backend in development mode.

Key endpoints:

```
# Shifts
GET    /api/shifts              # List shifts
POST   /api/shifts              # Create shift
PATCH  /api/shifts/:id          # Update shift

# Shift Pool
GET    /api/pool/available      # Available shifts
POST   /api/pool/claim/:id      # Claim a shift
POST   /api/pool/release/:id    # Release a shift

# Ghost Kitchen
POST   /api/ghost-kitchen/enable   # Enable ghost mode
POST   /api/ghost-kitchen/disable  # Disable ghost mode
GET    /api/ghost-kitchen/status   # Current status
GET    /api/ghost-kitchen/orders   # Active orders
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/restaurant_scheduler

# Redis
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRATION=7d

# Ghost Kitchen (KitchenHub API)
KITCHENHUB_API_KEY=your-api-key
KITCHENHUB_WEBHOOK_SECRET=your-webhook-secret

# Push Notifications (Firebase)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
```

## Deployment

### Docker

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Mobile App

```bash
# Build for iOS
cd mobile && eas build --platform ios

# Build for Android
cd mobile && eas build --platform android
```

See [SETUP.md](SETUP.md) for detailed deployment instructions.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Roadmap

- [x] **Phase 1: MVP** - Single restaurant scheduling with basic shift pool
- [ ] **Phase 2: Networks** - Multi-restaurant support, cross-training
- [ ] **Phase 3: Ghost Kitchen** - KitchenHub integration, demand forecasting
- [ ] **Phase 4: AI & Pay** - ML forecasting, instant pay integration

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Refine](https://refine.dev/) - React framework for admin panels
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Expo](https://expo.dev/) - React Native development platform
- [Ant Design](https://ant.design/) - Enterprise UI design system

---

**Built with care for the restaurant industry** - Making scheduling less painful, one shift at a time.
