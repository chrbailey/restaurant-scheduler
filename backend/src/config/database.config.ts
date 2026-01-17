import { registerAs } from '@nestjs/config';

/**
 * Database Configuration
 *
 * Uses PostgreSQL with Row-Level Security (RLS) for multi-tenancy.
 * RLS policies ensure data isolation at the database level, preventing
 * cross-tenant data leakage even if application logic has bugs.
 *
 * The tenant context is set via `SET app.current_tenant_id = 'uuid'`
 * at the start of each request, and RLS policies reference this variable.
 */
export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
  poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),

  // Redis for caching and pub/sub
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    prefix: process.env.REDIS_PREFIX || 'rs:',
  },
}));

/**
 * RLS Policy Setup SQL (run during migration)
 *
 * This SQL creates the RLS policies that enforce multi-tenancy:
 *
 * ```sql
 * -- Enable RLS on tenant-scoped tables
 * ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE shift_claims ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;
 *
 * -- Policy for workers table
 * CREATE POLICY tenant_isolation ON workers
 *   USING (restaurant_id = current_setting('app.current_tenant_id')::uuid);
 *
 * -- Policy for shifts table
 * CREATE POLICY tenant_isolation ON shifts
 *   USING (restaurant_id = current_setting('app.current_tenant_id')::uuid);
 *
 * -- Network visibility policy (allows cross-restaurant access within network)
 * CREATE POLICY network_visibility ON shifts
 *   USING (
 *     restaurant_id = current_setting('app.current_tenant_id')::uuid
 *     OR EXISTS (
 *       SELECT 1 FROM restaurant_networks rn
 *       WHERE rn.id = (
 *         SELECT network_id FROM restaurants
 *         WHERE id = current_setting('app.current_tenant_id')::uuid
 *       )
 *       AND shifts.restaurant_id = ANY(rn.member_restaurant_ids)
 *     )
 *   );
 * ```
 */
export const RLS_SETUP_NOTES = `
See prisma/migrations/ for RLS policy setup.
The PrismaService sets app.current_tenant_id at connection time.
`;
