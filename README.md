# Restaurant Staff Scheduling - Development Scaffold

A monorepo development scaffold for a restaurant scheduling application. This codebase provides **foundational architecture** and **test coverage** for building a scheduling platform—it is not a production-ready system.

## What This Is

This is a **development starting point** that includes:

- **937 passing tests** across backend (183), mobile (310), and web (444)
- **Comprehensive database schema** using Prisma ORM
- **NestJS modular backend** with organized service layers
- **React Native mobile shell** with Expo SDK 55
- **Web dashboard shell** using Refine + React 19

## What This Is NOT

This is **not** a working production application. Key limitations:

- **External integrations are mocked** - KitchenHub aggregator logs mock messages
- **Notifications require configuration** - Firebase push works only with valid credentials; SMS and email are stubs
- **No production deployment** - Not tested in any production environment
- **API keys required** - Weather, payments, and other services need real credentials

## Repository Structure

```
restaurant-scheduler/
├── backend/                 # NestJS API server
│   ├── src/modules/
│   │   ├── identity/        # User/worker profile management
│   │   ├── scheduling/      # Shift CRUD and state machine
│   │   ├── shift-pool/      # Claims and matching logic
│   │   ├── network/         # Multi-restaurant scaffolding
│   │   ├── ghost-kitchen/   # Session tracking (mocked integrations)
│   │   ├── notification/    # Push/SMS/Email (stubs for SMS/Email)
│   │   └── payments/        # DailyPay client (requires credentials)
│   └── prisma/schema.prisma # Full database schema
│
├── mobile/                  # React Native (Expo) app shell
│   ├── app/                 # Expo Router file-based routing
│   └── src/                 # Components, hooks, stores
│
├── web/                     # Refine admin dashboard shell
│   └── src/                 # Pages and components
│
└── shared/                  # TypeScript types
```

## Database Schema

The Prisma schema defines models for:

| Model | Purpose |
|-------|---------|
| User | Global identity across restaurants |
| WorkerProfile | Per-restaurant employment record |
| Restaurant | Restaurant entity with settings |
| Shift | Shift with state machine lifecycle |
| ShiftClaim | Worker claims on open shifts |
| ShiftSwap | Swap requests between workers |
| GhostKitchenSession | Delivery mode session tracking |
| Notification | Push notification records |
| InstantPayEnrollment | DailyPay enrollment tracking |

## Implemented Logic

### Shift Priority Scoring

The `shift-matcher.service.ts` calculates claim priority:

```typescript
// Factors considered:
// - Own employee bonus: +1000
// - Primary tier: +100
// - Reputation: 0-500 based on rating
// - Reliability bonus: +50 if >4.5
// - No-show penalty: -25 per incident
```

### Ghost Kitchen Sessions

Session management tracks:
- Session start/end with user attribution
- Order counts and revenue totals
- Platform breakdown (stored as JSON)
- Status: ACTIVE, PAUSED, ENDED

### Notification Service

Multi-channel with fatigue prevention:
- **Push**: Firebase Cloud Messaging (works if configured)
- **SMS**: Stub that logs messages (TODO: Twilio)
- **Email**: Stub that logs messages (TODO: SendGrid)
- Quiet hours, rate limiting, and deduplication implemented

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.production.example .env
# Edit .env with your database credentials

# Run migrations
pnpm backend:migrate

# Start services
pnpm backend:dev    # API on :3000
pnpm web:dev        # Web on :5173
pnpm mobile:start   # Expo dev server
```

### Running Tests

```bash
# All tests
pnpm test

# By package
pnpm backend:test        # 183 tests
pnpm --filter mobile test # 310 tests
pnpm --filter web test    # 444 tests
```

## Known Stubs and Mocks

| Component | Status | Notes |
|-----------|--------|-------|
| `AggregatorClientService` | **Mocked** | Logs "[Mock]" messages, no real API calls |
| `WeatherService` | Partial | Makes real API calls with key, otherwise mock data |
| `DailyPayClient` | Client code | Would work with valid credentials |
| SMS notifications | **Stub** | `TODO: Implement Twilio SMS sending` |
| Email notifications | **Stub** | `TODO: Implement email sending` |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native 0.83, Expo SDK 55 |
| Web | React 19, Refine, Ant Design |
| Backend | Node.js 22, NestJS, TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Cache | Redis |
| Testing | Jest (backend/mobile), Vitest (web) |

## Development Roadmap

If continuing development:

1. **Wire up real integrations** - Replace mocks with actual API implementations
2. **Add authentication** - JWT flows are scaffolded but need verification
3. **Deploy to staging** - Test with real PostgreSQL/Redis instances
4. **Mobile builds** - Configure EAS Build for iOS/Android
5. **Add end-to-end tests** - Current tests are unit/integration only

## License

MIT - See [LICENSE](LICENSE)

---

*This scaffold was generated to demonstrate architecture patterns for restaurant scheduling. It requires significant additional work before production use.*
