/**
 * Apply a SQL migration file to the Supabase Postgres database.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/run-migration.ts <path/to/file.sql>
 *
 * Example:
 *   npx ts-node --project tsconfig.scripts.json scripts/run-migration.ts supabase/migrations/002_review_workflow.sql
 *
 * Requires SUPABASE_DB_URL in .env.local — the full Postgres connection
 * string from Supabase Dashboard → Project Settings → Database →
 * "Connection string" (URI mode). Format:
 *   postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres
 * or direct:
 *   postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
 *
 * The script wraps the migration in BEGIN/COMMIT if not already present.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_URL = process.env.SUPABASE_DB_URL

if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL in .env.local.')
  console.error('')
  console.error('Get it from: Supabase Dashboard → Project Settings → Database')
  console.error('→ Connection string → "URI" tab. It looks like:')
  console.error('  postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres')
  console.error('')
  console.error('Add a line to .env.local:')
  console.error('  SUPABASE_DB_URL=<paste full URI here>')
  process.exit(1)
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: run-migration.ts <path/to/file.sql>')
    process.exit(1)
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(filePath, 'utf-8')
  const sizeKb = (sql.length / 1024).toFixed(1)
  console.log(`Loading ${filePath} (${sizeKb} KB)\n`)

  // Mask credentials in display
  const display = DB_URL!.replace(/:([^:@]+)@/, ':********@')
  console.log(`Connecting to: ${display}`)

  const client = new Client({
    connectionString: DB_URL,
    // Supabase requires SSL
    ssl: { rejectUnauthorized: false },
    // Generous timeouts for big migrations
    statement_timeout: 5 * 60 * 1000,
    query_timeout:     5 * 60 * 1000,
  })

  try {
    await client.connect()
    console.log('Connected.\n')
    console.log('Executing migration...')
    const start = Date.now()
    await client.query(sql)
    const ms = Date.now() - start
    console.log(`✓ Done in ${ms} ms`)
  } catch (err: any) {
    console.error('\n✗ Migration failed:')
    console.error(`  ${err?.message ?? err}`)
    if (err?.position) console.error(`  at SQL position ${err.position}`)
    if (err?.where) console.error(`  ${err.where}`)
    if (err?.hint) console.error(`  hint: ${err.hint}`)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
