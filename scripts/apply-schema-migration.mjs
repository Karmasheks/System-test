/**
 * Idempotent migration for subdivisions, presence, categories, equipment types.
 * Run: node --env-file=.env scripts/apply-schema-migration.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS subdivisions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_subdivision_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS view_all_subdivisions BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_subdivision_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS subdivision_name TEXT`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS home_subdivision_id INTEGER`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS home_subdivision_name TEXT`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_subdivision_id INTEGER`,
  `ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_subdivision_name TEXT`,
  `ALTER TABLE warehouse_parts ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE warehouse_parts ADD COLUMN IF NOT EXISTS subdivision_name TEXT`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE remarks ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS equipment_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS subdivision_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS equipment_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS subdivision_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS subdivision_id INTEGER`,
  `ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS subdivision_name TEXT`,
  `ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS external_link TEXT`,
  `ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS approval_link TEXT`,
  `CREATE TABLE IF NOT EXISTS equipment_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS warehouse_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours REAL`,
  `DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'actual_hours'
        AND data_type NOT IN ('real', 'double precision')
    ) THEN
      ALTER TABLE tasks ALTER COLUMN actual_hours TYPE REAL
        USING NULLIF(TRIM(actual_hours::text), '')::real;
    END IF;
  END $$`,
];

try {
  for (const stmt of statements) {
    await sql.unsafe(stmt);
    console.log("OK:", stmt.split("\n")[0].slice(0, 72));
  }
  console.log("Migration completed.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
