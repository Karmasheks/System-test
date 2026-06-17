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

    // Первый системный admin — супер-администратор (если ещё не назначен)
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
