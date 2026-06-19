import postgres from "postgres";

export async function bootstrapSchema(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });

  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false`;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id serial PRIMARY KEY,
        type text NOT NULL,
        title text,
        created_by_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_conversation_members (
        id serial PRIMARY KEY,
        conversation_id integer NOT NULL,
        user_id integer NOT NULL,
        role text NOT NULL DEFAULT 'member',
        joined_at timestamp NOT NULL DEFAULT now(),
        last_read_at timestamp,
        UNIQUE (conversation_id, user_id)
      )`;

    await sql`ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS left_at timestamp`;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id serial PRIMARY KEY,
        conversation_id integer NOT NULL,
        sender_id integer NOT NULL,
        body text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        edited_at timestamp,
        deleted_at timestamp
      )`;

    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamp`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamp`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_kind text`;
    await sql`UPDATE chat_messages SET message_kind = 'user' WHERE message_kind IS NULL`;

    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cycles_until_guarantee integer`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS maintenance_cycle_interval integer`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cycle_counter_total integer NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cycle_counter_registry_base integer`;
    await sql`UPDATE production_tooling
      SET cycle_counter_registry_base = cycle_counter_total
      WHERE cycle_counter_registry_base IS NULL AND cycle_counter_total > 0`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cycles_since_maintenance integer NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cycles_at_last_maintenance integer`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS last_maintenance_at timestamp`;

    await sql`
      CREATE TABLE IF NOT EXISTS production_tooling_products (
        id serial PRIMARY KEY,
        tooling_id integer NOT NULL,
        product_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (tooling_id, product_id)
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS production_tooling_maintenance (
        id serial PRIMARY KEY,
        tooling_id integer NOT NULL,
        performed_at timestamp NOT NULL DEFAULT now(),
        cycles_at_maintenance integer NOT NULL DEFAULT 0,
        comment text,
        performed_by_id integer,
        performed_by_name text,
        created_at timestamp NOT NULL DEFAULT now()
      )`;

    await sql`ALTER TABLE production_daily_plan ADD COLUMN IF NOT EXISTS tooling_id integer`;

    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS sprue_weight real`;
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE materials ADD COLUMN IF NOT EXISTS product_id integer`;

    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS fixed_asset_number text`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS info_updated_at timestamp`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS next_maintenance_planned_at timestamp`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS last_maintenance_duration_hours real`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS estimated_maintenance_hours real`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS cavities_layout text`;
    await sql`ALTER TABLE production_tooling ADD COLUMN IF NOT EXISTS pieces_per_cycle integer`;

    await sql`
      CREATE TABLE IF NOT EXISTS shift_schedule_templates (
        id serial PRIMARY KEY,
        subdivision_id integer,
        name text NOT NULL,
        description text,
        pattern jsonb NOT NULL,
        timezone text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS product_shift_norms (
        id serial PRIMARY KEY,
        product_id integer NOT NULL,
        subdivision_id integer NOT NULL,
        shift_code text NOT NULL,
        shift_norm real NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (product_id, subdivision_id, shift_code)
      )`;

    // Миграция product_id → junction (один раз)
    await sql`
      INSERT INTO production_tooling_products (tooling_id, product_id)
      SELECT id, product_id FROM production_tooling
      WHERE product_id IS NOT NULL
      ON CONFLICT (tooling_id, product_id) DO NOTHING`;

    // Первый системный admin — супер-администратор (если ещё не назначен)
    await sql`CREATE INDEX IF NOT EXISTS production_orders_subdivision_idx ON production_orders (subdivision_id)`;
    await sql`CREATE INDEX IF NOT EXISTS production_fact_subdivision_report_date_idx ON production_fact (subdivision_id, report_date)`;
    await sql`CREATE INDEX IF NOT EXISTS production_fact_order_id_idx ON production_fact (order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS products_subdivision_id_idx ON products (subdivision_id)`;
    await sql`CREATE INDEX IF NOT EXISTS production_plan_conflicts_subdivision_resolved_idx ON production_plan_conflicts (subdivision_id, is_resolved)`;
    await sql`CREATE INDEX IF NOT EXISTS production_tooling_products_tooling_id_idx ON production_tooling_products (tooling_id)`;
    await sql`CREATE INDEX IF NOT EXISTS product_bom_product_subdivision_idx ON product_bom (product_id, subdivision_id)`;

    await sql`
      UPDATE notifications
      SET is_archived = true
      WHERE is_read = true AND is_archived = false
    `;

    await sql`
      UPDATE users
      SET is_super_admin = true
      WHERE id = (
        SELECT id FROM users
        WHERE is_super_admin = false
          AND role = 'admin'
          AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = true)
        ORDER BY id ASC
        LIMIT 1
      )`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
