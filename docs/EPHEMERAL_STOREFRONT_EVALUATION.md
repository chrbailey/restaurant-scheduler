# Ephemeral Storefront Evaluation

## Executive Summary

**Use Case**: Spin up an on-demand storefront, schedule workers, conduct operations, pay everyone, then disappear cleanly.

**Current Readiness**: 7.5/10 - Strong foundation with targeted gaps to address

**Estimated Enhancement Effort**: 2-3 weeks for full ephemeral support

---

## The Ephemeral Commerce Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EPHEMERAL STOREFRONT LIFECYCLE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │  SPAWN   │ → │  STAFF   │ → │  OPERATE │ → │   PAY    │ → END    │
│   │          │    │          │    │          │    │          │         │
│   │ • Create │    │ • Notify │    │ • Accept │    │ • Calc   │         │
│   │   venue  │    │   workers│    │   orders │    │   wages  │         │
│   │ • Config │    │ • Quick  │    │ • Fulfill│    │ • Instant│         │
│   │   menu   │    │   assign │    │ • Track  │    │   pay    │         │
│   │ • Enable │    │ • Verify │    │ • Monitor│    │ • Settle │         │
│   │   platforms│  │   arrival│    │          │    │          │         │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│                                                                          │
│   Duration: Minutes → Hours → Hours/Days → Minutes → Archive           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Current Capabilities Assessment

### ✅ What Works Today

| Capability | Implementation | Readiness |
|------------|----------------|-----------|
| **Ghost Kitchen Sessions** | Full session lifecycle with enable/disable/pause | ✅ Excellent |
| **Multi-Platform Orders** | DoorDash, UberEats, Grubhub via KitchenHub | ✅ Ready |
| **Instant Pay** | DailyPay integration with same-day transfers | ✅ Strong |
| **Worker Pool** | Multi-employer model, phone-based identity | ✅ Strong |
| **Real-Time Tracking** | WebSocket for orders, capacity, earnings | ✅ Excellent |
| **Shift Claiming** | Self-service with priority scoring | ✅ Ready |
| **Earnings Tracking** | Per-shift with tips, hourly rate | ✅ Complete |

### ❌ Gaps for Ephemeral Model

| Gap | Impact | Priority |
|-----|--------|----------|
| **No Storefront Status Field** | Can't mark venues as temporary/archived | 🔴 Critical |
| **No Expedited Onboarding** | Workers need full verification flow | 🔴 High |
| **No Auto-Dissolution** | Manual cleanup required after operations | 🟡 Medium |
| **No Geo-Based Worker Matching** | Can't find nearby available workers | 🟡 Medium |
| **Limited Final Settlement** | No automated end-of-operation payroll | 🟡 Medium |

---

## Proposed Architecture Enhancements

### 1. Ephemeral Venue Entity

```typescript
// New: EphemeralVenue model
model EphemeralVenue {
  id              String   @id @default(uuid())
  name            String
  status          VenueStatus @default(SPAWNING)

  // Lifecycle
  scheduledStart  DateTime
  scheduledEnd    DateTime?
  actualStart     DateTime?
  actualEnd       DateTime?
  autoDissolveAt  DateTime?  // Auto-archive after this time

  // Location (for geo-matching)
  latitude        Float
  longitude       Float
  address         String

  // Operations
  ghostSessionId  String?    // Links to active ghost session
  platforms       Platform[] // Which delivery platforms
  maxWorkers      Int

  // Settlement
  settlementStatus SettlementStatus @default(PENDING)
  totalRevenue     Decimal?
  totalLabor       Decimal?
  totalPlatformFees Decimal?

  // Relations
  shifts          EphemeralShift[]
  workers         EphemeralAssignment[]

  createdAt       DateTime @default(now())
  dissolvedAt     DateTime?
}

enum VenueStatus {
  SPAWNING      // Being configured
  RECRUITING    // Finding workers
  READY         // Workers assigned, ready to go live
  LIVE          // Accepting orders
  WINDING_DOWN  // No new orders, completing existing
  SETTLING      // Paying workers
  DISSOLVED     // Complete, archived
}

enum SettlementStatus {
  PENDING
  CALCULATING
  PAYING
  COMPLETED
  FAILED
}
```

### 2. Rapid Worker Assignment

```typescript
// EphemeralStaffingService
class EphemeralStaffingService {

  // Find workers within radius who are available
  async findNearbyAvailable(
    latitude: number,
    longitude: number,
    radiusMiles: number,
    positions: Position[],
    startTime: Date,
    endTime: Date
  ): Promise<AvailableWorker[]> {
    // Geo-query with PostGIS or similar
    // Filter by: position, availability, active status
    // Sort by: distance, reliability score
  }

  // Blast notification to nearby workers
  async broadcastOpportunity(
    venueId: string,
    positions: Position[],
    payRate: number,
    startTime: Date
  ): Promise<void> {
    // Push notification to qualified nearby workers
    // First-come-first-served claiming
  }

  // Quick onboard for new workers (minimal verification)
  async quickOnboard(
    phone: string,
    positions: Position[],
    venueId: string
  ): Promise<WorkerProfile> {
    // 1. Verify phone (OTP)
    // 2. Collect name, payment info
    // 3. Skip background check (for certain venue types)
    // 4. Immediately assignable
  }
}
```

### 3. Auto-Dissolution Engine

```typescript
// DissolutionService - handles clean shutdown
class DissolutionService {

  async initiateWindDown(venueId: string): Promise<void> {
    // 1. Stop accepting new orders
    await this.ghostKitchen.pauseGhostMode(venueId);

    // 2. Mark venue as WINDING_DOWN
    await this.updateVenueStatus(venueId, 'WINDING_DOWN');

    // 3. Wait for in-progress orders
    await this.waitForOrderCompletion(venueId);

    // 4. Trigger settlement
    await this.settlement.calculateAndPay(venueId);
  }

  async calculateAndPay(venueId: string): Promise<SettlementResult> {
    // 1. Mark all shifts as complete
    const shifts = await this.completeAllShifts(venueId);

    // 2. Calculate earnings per worker
    const earnings = await this.calculateEarnings(shifts);

    // 3. Process instant pay for all workers
    for (const worker of earnings) {
      await this.instantPay.requestTransfer(
        worker.profileId,
        worker.amount,
        'INSTANT',
        `Settlement: ${venueId}`
      );
    }

    // 4. Generate final P&L
    const pnl = await this.generatePnL(venueId);

    // 5. Archive venue
    await this.dissolve(venueId, pnl);

    return { success: true, pnl, workersPaid: earnings.length };
  }
}
```

### 4. One-Click Spawn Flow

```typescript
// VenueSpawnerService - creates ephemeral venues
class VenueSpawnerService {

  async spawn(config: SpawnConfig): Promise<EphemeralVenue> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Create venue
      const venue = await tx.ephemeralVenue.create({
        data: {
          name: config.name,
          latitude: config.location.lat,
          longitude: config.location.lng,
          address: config.location.address,
          scheduledStart: config.startTime,
          scheduledEnd: config.endTime,
          autoDissolveAt: addHours(config.endTime, 2),
          platforms: config.platforms,
          maxWorkers: config.workerCount,
        }
      });

      // 2. Create shifts
      const shifts = await this.createShifts(
        tx,
        venue.id,
        config.positions,
        config.startTime,
        config.endTime
      );

      // 3. Broadcast to nearby workers
      await this.staffing.broadcastOpportunity(
        venue.id,
        config.positions,
        config.payRate,
        config.startTime
      );

      // 4. Pre-configure ghost kitchen
      await this.ghostKitchen.prepareSession(venue.id, {
        platforms: config.platforms,
        menuId: config.menuId,
        maxOrders: config.maxConcurrentOrders,
      });

      return venue;
    });
  }
}
```

---

## Complete Ephemeral Flow

```
                                    EPHEMERAL STOREFRONT FLOW

    OPERATOR                           SYSTEM                              WORKERS
       │                                  │                                    │
       │  1. spawn({                      │                                    │
       │     name: "Pop-Up Kitchen",      │                                    │
       │     location: {...},             │                                    │
       │     startTime: "2pm",            │                                    │
       │     endTime: "8pm",              │                                    │
       │     positions: [COOK, PACKER],   │                                    │
       │     payRate: $22/hr              │                                    │
       │  })                              │                                    │
       │─────────────────────────────────>│                                    │
       │                                  │                                    │
       │                                  │  2. Create venue                   │
       │                                  │  3. Create shifts                  │
       │                                  │  4. Find nearby workers            │
       │                                  │─────────────────────────────────────>│
       │                                  │     Push: "Pop-Up Kitchen needs    │
       │                                  │     COOK, $22/hr, 2pm-8pm, 1.2mi"  │
       │                                  │                                    │
       │                                  │<─────────────────────────────────────│
       │                                  │     Worker claims shift            │
       │                                  │                                    │
       │  Venue status: RECRUITING        │                                    │
       │<─────────────────────────────────│                                    │
       │                                  │                                    │
       │                                  │  5. Workers assigned               │
       │  Venue status: READY             │  6. Prepare ghost session          │
       │<─────────────────────────────────│                                    │
       │                                  │                                    │
       │  goLive(venueId)                 │                                    │
       │─────────────────────────────────>│                                    │
       │                                  │  7. Enable ghost mode              │
       │                                  │  8. Accept orders from platforms   │
       │  Venue status: LIVE              │                                    │
       │<─────────────────────────────────│                                    │
       │                                  │                                    │
       │       ══════════════════════════════════════════════════════         │
       │                    OPERATIONS (Orders flowing)                        │
       │       ══════════════════════════════════════════════════════         │
       │                                  │                                    │
       │  windDown(venueId)               │                                    │
       │  OR auto-trigger at endTime      │                                    │
       │─────────────────────────────────>│                                    │
       │                                  │  9. Stop accepting orders          │
       │  Venue status: WINDING_DOWN      │  10. Complete pending orders       │
       │<─────────────────────────────────│                                    │
       │                                  │                                    │
       │                                  │  11. Calculate earnings            │
       │                                  │  12. Process instant pay           │
       │  Venue status: SETTLING          │─────────────────────────────────────>│
       │<─────────────────────────────────│     Transfer: $176.00              │
       │                                  │     (8 hrs × $22)                  │
       │                                  │                                    │
       │  Settlement complete             │                                    │
       │  Revenue: $2,340                 │                                    │
       │  Labor: $528                     │                                    │
       │  Fees: $280                      │                                    │
       │  Net: $1,532                     │                                    │
       │                                  │                                    │
       │  Venue status: DISSOLVED         │  13. Archive all data              │
       │<─────────────────────────────────│                                    │
       │                                  │                                    │
       ▼                                  ▼                                    ▼
```

---

## Use Cases Enabled

### 1. Pop-Up Restaurant
```typescript
await spawner.spawn({
  name: "Chef's Table Pop-Up",
  location: { lat: 40.7128, lng: -74.0060, address: "123 Main St" },
  startTime: new Date('2024-02-14T17:00:00'),
  endTime: new Date('2024-02-14T23:00:00'),
  positions: ['LINE_COOK', 'LINE_COOK', 'SERVER', 'BARTENDER'],
  payRate: 25.00,
  platforms: ['DOORDASH', 'UBEREATS'],
  menuId: 'valentines-menu-2024'
});
```

### 2. Food Festival Booth
```typescript
await spawner.spawn({
  name: "Taco Booth - Food Fest",
  location: { lat: 34.0522, lng: -118.2437, address: "Grand Park" },
  startTime: new Date('2024-03-15T11:00:00'),
  endTime: new Date('2024-03-15T20:00:00'),
  positions: ['LINE_COOK', 'LINE_COOK', 'CASHIER'],
  payRate: 20.00,
  platforms: [], // Walk-up only
  autoDissolveAfterHours: 3
});
```

### 3. Catering Event
```typescript
await spawner.spawn({
  name: "Corporate Lunch Catering",
  location: { lat: 37.7749, lng: -122.4194, address: "Tech HQ" },
  startTime: new Date('2024-02-20T10:00:00'),
  endTime: new Date('2024-02-20T14:00:00'),
  positions: ['LINE_COOK', 'SERVER', 'SERVER'],
  payRate: 28.00,
  platforms: [], // Private event
  settlementTiming: 'IMMEDIATE' // Pay as soon as event ends
});
```

### 4. Ghost Kitchen Surge
```typescript
// Automatically spawn during predicted high-demand
await spawner.spawnOnDemand({
  triggerCondition: 'DEMAND_FORECAST_HIGH',
  autoSpawnWhen: {
    predictedOrders: '>50/hour',
    currentCapacity: '<70%'
  },
  duration: 4, // hours
  positions: ['LINE_COOK'],
  payRate: 24.00
});
```

---

## Implementation Roadmap

### Week 1: Core Ephemeral Infrastructure
- [ ] Add `EphemeralVenue` model to Prisma schema
- [ ] Create `VenueSpawnerService` for one-click creation
- [ ] Add geo-location fields to `WorkerProfile`
- [ ] Implement `findNearbyAvailable()` query

### Week 2: Staffing & Operations
- [ ] Create `EphemeralStaffingService` for rapid assignment
- [ ] Add broadcast notification for opportunities
- [ ] Connect ephemeral venue to ghost kitchen session
- [ ] Implement go-live and wind-down flows

### Week 3: Settlement & Dissolution
- [ ] Create `DissolutionService` for clean shutdown
- [ ] Implement automatic earnings calculation
- [ ] Add batch instant pay for all workers
- [ ] Generate final P&L reports
- [ ] Implement venue archival

### Week 4: Polish & API
- [ ] REST API for ephemeral operations
- [ ] Mobile app integration for workers
- [ ] Operator dashboard for ephemeral venues
- [ ] Testing and documentation

---

## API Design

```yaml
# Ephemeral Storefront API

POST /api/ephemeral/spawn
  → Create new ephemeral venue
  Body: { name, location, startTime, endTime, positions, payRate, platforms }
  Returns: { venueId, status: "SPAWNING", shareableLink }

GET /api/ephemeral/:venueId/status
  → Get current venue status and metrics
  Returns: { status, workersAssigned, ordersCompleted, revenue }

POST /api/ephemeral/:venueId/go-live
  → Activate the venue (start accepting orders)
  Returns: { status: "LIVE", ghostSessionId }

POST /api/ephemeral/:venueId/wind-down
  → Begin shutdown process
  Returns: { status: "WINDING_DOWN", pendingOrders }

POST /api/ephemeral/:venueId/settle
  → Force immediate settlement (skip wind-down)
  Returns: { settlementId, workersPaid, totalPaid }

GET /api/ephemeral/:venueId/settlement
  → Get settlement details
  Returns: { revenue, labor, fees, net, workerPayments[] }

DELETE /api/ephemeral/:venueId
  → Archive/dissolve venue (after settlement)
  Returns: { status: "DISSOLVED", archivedAt }
```

---

## Conclusion

The Restaurant Staff Scheduling Platform provides a **strong foundation** for ephemeral storefront operations:

| Aspect | Current State | With Enhancements |
|--------|---------------|-------------------|
| Spawn Storefront | Manual setup | One-click spawn |
| Staff Workers | Shift-based claiming | Geo-broadcast + instant assign |
| Conduct Work | Ghost kitchen ready | Fully integrated |
| Pay Everyone | Instant pay available | Auto-settlement |
| Disappear | Manual cleanup | Auto-dissolution |

**Recommendation**: Implement the proposed enhancements over 3-4 weeks to enable full ephemeral commerce capabilities. The ghost kitchen and instant pay foundations make this achievable with focused development.

---

*This evaluation was generated based on codebase analysis of the restaurant-scheduler platform.*
