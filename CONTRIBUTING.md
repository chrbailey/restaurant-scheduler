# Contributing to Restaurant Staff Scheduling Platform

First off, thank you for considering contributing to this project! It's people like you that make this platform better for restaurant workers and managers everywhere.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Style Guide](#style-guide)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming environment. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 22+ (LTS recommended)
- pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (recommended for local development)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/restaurant-scheduler.git
   cd restaurant-scheduler
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.production.example .env
   # Edit .env with your local configuration
   ```

4. **Start local services**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   cd backend && npx prisma migrate dev
   ```

6. **Start development servers**
   ```bash
   # In separate terminals:
   pnpm backend:dev    # API on http://localhost:3000
   pnpm web:dev        # Web on http://localhost:5173
   pnpm mobile:start   # Expo DevTools
   ```

## Project Structure

```
restaurant-scheduler/
├── backend/          # NestJS API (TypeScript)
├── mobile/           # React Native + Expo
├── web/              # Refine + React admin dashboard
├── shared/           # Shared TypeScript types
└── docs/             # Documentation
```

### Package-Specific Guidelines

#### Backend (`/backend`)
- Uses NestJS with modular architecture
- Each feature is a self-contained module
- Prisma ORM for database operations
- Jest for testing

#### Mobile (`/mobile`)
- React Native with Expo SDK 55
- File-based routing via Expo Router
- Zustand for state management
- Jest + React Native Testing Library

#### Web (`/web`)
- Refine framework with Ant Design
- React Query for data fetching
- Vitest for testing

## Making Changes

### Branch Naming Convention

- `feature/` - New features (e.g., `feature/shift-swap-notifications`)
- `fix/` - Bug fixes (e.g., `fix/claim-priority-calculation`)
- `docs/` - Documentation updates
- `refactor/` - Code refactoring without functional changes
- `test/` - Adding or updating tests

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(shift-pool): add priority scoring for network workers

fix(mobile): resolve claim button not responding on iOS

docs(readme): update installation instructions
```

## Testing Guidelines

### Running Tests

```bash
# All tests
pnpm test

# Specific packages
pnpm backend:test
pnpm --filter mobile test
pnpm --filter web test

# Watch mode (during development)
cd backend && npm run test:watch
cd web && npm run test -- --watch
```

### Writing Tests

#### Backend Tests
```typescript
// Example: Testing a service
describe('ShiftMatcherService', () => {
  let service: ShiftMatcherService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ShiftMatcherService],
    }).compile();

    service = module.get<ShiftMatcherService>(ShiftMatcherService);
  });

  it('should calculate priority score correctly', () => {
    const result = service.calculatePriority(mockClaim, mockShift);
    expect(result).toBeGreaterThan(0);
  });
});
```

#### Mobile Tests (React Native Testing Library)
```typescript
// Example: Testing a component
it('renders shift card with correct details', async () => {
  const { findByText } = render(
    <ShiftCard shift={mockShift} onClaim={jest.fn()} />
  );

  expect(await findByText('BARTENDER')).toBeTruthy();
  expect(await findByText('$25/hr')).toBeTruthy();
});
```

#### Web Tests (Vitest + Testing Library)
```typescript
// Example: Testing with Ant Design components
it('displays order statistics', async () => {
  renderDashboard();

  await waitFor(() => {
    // Use getAllByText for text that appears multiple times
    const elements = screen.getAllByText('Orders');
    expect(elements.length).toBeGreaterThan(0);
  });
});
```

### Test Coverage Goals

- Backend: 80%+ coverage for services
- Mobile: Component and hook tests
- Web: Integration tests for key workflows

## Pull Request Process

1. **Ensure tests pass**
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

2. **Update documentation** if your changes affect:
   - API endpoints
   - Environment variables
   - Setup instructions
   - Component props/interfaces

3. **Create the Pull Request**
   - Use a descriptive title following commit conventions
   - Fill out the PR template
   - Link any related issues

4. **PR Review Checklist**
   - [ ] Tests added/updated
   - [ ] Documentation updated
   - [ ] No console.log statements
   - [ ] Types are properly defined
   - [ ] No breaking changes (or clearly documented)

## Style Guide

### TypeScript

- Use explicit types (avoid `any`)
- Prefer interfaces over type aliases for object shapes
- Use enums for fixed sets of values

```typescript
// Good
interface Shift {
  id: string;
  status: ShiftStatus;
  startTime: Date;
}

// Avoid
const shift: any = { ... };
```

### React Components

- Use functional components with hooks
- Destructure props at the function signature
- Use meaningful component names

```typescript
// Good
function ShiftCard({ shift, onClaim }: ShiftCardProps) {
  return (/* ... */);
}

// Avoid
const SC = (props: any) => { ... };
```

### File Naming

- Components: `PascalCase.tsx` (e.g., `ShiftCard.tsx`)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useShiftClaim.ts`)
- Services: `kebab-case.service.ts` (e.g., `shift-matcher.service.ts`)
- Tests: `*.test.ts` or `*.spec.ts`

### Imports

```typescript
// Order: React, external, internal, relative, styles
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from 'antd';
import { useAuth } from '@/hooks/useAuth';
import { ShiftCard } from './ShiftCard';
import styles from './styles.module.css';
```

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the codebase

Thank you for contributing!
