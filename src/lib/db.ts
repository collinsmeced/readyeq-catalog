/**
 * Server-side Postgres pool for admin server actions.
 *
 * Uses SUPABASE_DB_URL (the pooler endpoint) — works well from Vercel
 * serverless functions because Supabase's transaction-mode pooler at
 * port 6543 handles connection multiplexing across many short-lived
 * function invocations.
 *
 * Singleton pattern: in warm Vercel instances, the pool persists across
 * invocations. Cold starts create a new pool. Lazy-instantiated so we
 * don't crash on import if SUPABASE_DB_URL isn't set (e.g. at build time).
 */

import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

export function db(): Pool {
  if (!global._pgPool) {
    const connectionString = process.env.SUPABASE_DB_URL
    if (!connectionString) {
      throw new Error('SUPABASE_DB_URL not set')
    }
    global._pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,           // serverless: keep small per-instance
      idleTimeoutMillis: 30_000,
      // Tell the pooler we're transaction-mode so it can multiplex
      statement_timeout: 30_000,
    })
  }
  return global._pgPool
}
