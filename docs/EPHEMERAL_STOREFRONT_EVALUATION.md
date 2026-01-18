# Ephemeral Storefront - Feature Proposal

**Status**: Proposal / Not Implemented

**Use Case**: Spin up an on-demand storefront, schedule workers, conduct operations, pay everyone, then disappear cleanly.

---

## What Exists Today

The current scaffold provides building blocks that could support ephemeral operations:

| Component | Current State |
|-----------|---------------|
| Ghost Kitchen Sessions | Schema exists, session start/end tracking works |
| Worker Profiles | Multi-employer model exists in Prisma schema |
| Shift Claims | Priority scoring and matching logic implemented |
| Instant Pay | DailyPay client code exists (requires credentials) |
| Order Tracking | `GhostKitchenOrder` model defined |

**However**, the following do NOT exist:

| Missing Piece | Impact |
|---------------|--------|
| No `EphemeralVenue` model | Can't mark venues as temporary |
| No geo-location on workers | Can't find nearby available staff |
| No auto-dissolution logic | Manual cleanup required |
| Aggregator is mocked | No real order flow from platforms |
| No settlement workflow | No automated end-of-operation payroll |

---

## Proposed Architecture

The following sections describe **code that would need to be written**, not code that exists.

### 1. EphemeralVenue Model (Proposed)

```prisma
// This does NOT exist in the current schema

model EphemeralVenue {
  id              String   @id @default(uuid())
  name            String
  status          VenueStatus @default(SPAWNING)

  scheduledStart  DateTime
  scheduledEnd    DateTime?
  actualStart     DateTime?
  actualEnd       DateTime?
  autoDissolveAt  DateTime?

  latitude        Float
  longitude       Float
  address         String

  ghostSessionId  String?
  platforms       Platform[]
  maxWorkers      Int

  settlementStatus SettlementStatus @default(PENDING)
  totalRevenue     Decimal?
  totalLabor       Decimal?

  createdAt       DateTime @default(now())
  dissolvedAt     DateTime?
}

enum VenueStatus {
  SPAWNING
  RECRUITING
  READY
  LIVE
  WINDING_DOWN
  SETTLING
  DISSOLVED
}
```

### 2. Geo-Based Worker Matching (Proposed)

Would require:
- Adding `lat`/`lng` fields to `WorkerProfile`
- PostGIS extension or application-level distance calculation
- Notification targeting by radius

### 3. Auto-Dissolution Service (Proposed)

```typescript
// This does NOT exist

class DissolutionService {
  async initiateWindDown(venueId: string): Promise<void> {
    // 1. Stop accepting orders
    // 2. Wait for in-progress orders
    // 3. Calculate final earnings
    // 4. Process instant pay for all workers
    // 5. Archive venue
  }
}
```

### 4. Settlement Workflow (Proposed)

Would connect:
- Completed shifts to earnings calculation
- Earnings to DailyPay transfer requests
- Transfer status tracking

---

## Implementation Estimate

If starting from the current scaffold:

| Phase | Effort | Description |
|-------|--------|-------------|
| Schema additions | 1-2 days | Add EphemeralVenue, geo fields |
| Geo matching | 3-5 days | Worker location, radius queries |
| Dissolution service | 3-5 days | Orderly shutdown, settlement |
| Real aggregator | 5-10 days | Replace mock with actual KitchenHub |
| Settlement automation | 3-5 days | Batch pay on venue close |
| Testing | 5-7 days | E2E tests for full flow |

**Total**: 3-5 weeks for a testable ephemeral flow

---

## What Would Need to Be True

For ephemeral storefronts to work in production:

1. **Real KitchenHub integration** - Currently mocked
2. **Real DailyPay credentials** - Client code exists but untested
3. **Push notifications working** - Firebase configured
4. **Worker mobile app deployed** - Currently dev-only
5. **Settlement accounting verified** - No actual money has moved

---

## Conclusion

The scaffold provides useful primitives (shifts, claims, sessions, payments model) but ephemeral storefront support would require:

- New database models
- New services for spawning/dissolution
- Real integration work
- Production testing

This is a **feature proposal**, not an evaluation of existing capability.
