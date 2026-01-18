# Contributing to Restaurant Staff Scheduling Scaffold

This is a development scaffold—not a production system. Contributions should focus on improving the foundational architecture, fixing bugs, or completing stubbed functionality.

## Project State

Before contributing, understand what exists:

- **937 passing tests** but no end-to-end tests
- **Mocked external integrations** (KitchenHub aggregator, SMS, email)
- **Scaffolded modules** with varying completeness
- **No production deployment** has been tested

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+
- Docker (optional, for local services)

### Development Setup

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/restaurant-scheduler.git
cd restaurant-scheduler
pnpm install

# Set up environment
cp .env.production.example .env
# Edit .env with your local configuration

# Start services (optional: use Docker)
docker-compose up -d

# Run migrations
cd backend && npx prisma migrate dev

# Start dev servers
pnpm backend:dev    # API on :3000
pnpm web:dev        # Web on :5173
pnpm mobile:start   # Expo DevTools
```

## Project Structure

```
backend/          # NestJS API
  src/modules/    # Feature modules (varying completeness)
  prisma/         # Database schema

mobile/           # React Native + Expo
  app/            # Expo Router pages
  src/            # Components, hooks, stores

web/              # Refine admin dashboard
  src/pages/      # Route pages

shared/           # TypeScript types
```

## Making Changes

### Branch Names

- `feature/` - New functionality
- `fix/` - Bug fixes
- `docs/` - Documentation
- `stub/` - Completing stubbed code

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(shift-pool): add priority scoring for claims
fix(mobile): resolve button not responding
stub(notification): implement Twilio SMS delivery
```

## Testing

### Running Tests

```bash
pnpm test                    # All tests
pnpm backend:test            # 183 backend tests
pnpm --filter mobile test    # 310 mobile tests
pnpm --filter web test       # 444 web tests
```

### Test Patterns

**Backend (Jest + NestJS testing)**
```typescript
describe('ClaimsService', () => {
  it('should calculate priority score', () => {
    // ...
  });
});
```

**Mobile (Jest + React Native Testing Library)**
```typescript
it('renders shift details', async () => {
  const { findByText } = render(<ShiftCard shift={mock} />);
  expect(await findByText('BARTENDER')).toBeTruthy();
});
```

**Web (Vitest + Testing Library)**
```typescript
it('displays dashboard stats', async () => {
  renderDashboard();
  await waitFor(() => {
    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0);
  });
});
```

## High-Value Contributions

Areas that would benefit most:

1. **Complete stubbed integrations**
   - `notification.service.ts`: Twilio SMS (line 265)
   - `notification.service.ts`: SendGrid email (line 272)
   - `aggregator-client.service.ts`: Real KitchenHub API calls

2. **Add end-to-end tests**
   - No E2E tests exist currently

3. **Fix authentication flow**
   - JWT is scaffolded but not fully tested

4. **Add API documentation**
   - Swagger/OpenAPI generation exists but isn't verified

## Pull Request Process

1. Run tests: `pnpm test`
2. Run type check: `pnpm typecheck`
3. Run lint: `pnpm lint`
4. Fill out PR template
5. Link related issues

## Style Guide

### TypeScript
- Explicit types, avoid `any`
- Interfaces for object shapes
- Enums for fixed value sets

### React
- Functional components with hooks
- Destructure props
- Meaningful names

### Files
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Services: `kebab-case.service.ts`
- Tests: `*.test.ts` or `*.spec.ts`

## Questions

Open an issue for bugs, questions, or suggestions.
