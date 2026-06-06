import postgres from "postgres";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "admin@admin.ru";
const ADMIN_NAME = "Admin";
const ADMIN_PASSWORD = "admin";
const ADMIN_ROLE = "admin";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 15 });
const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

try {
  const existing = await sql`
    SELECT id, email FROM users WHERE email = ${ADMIN_EMAIL} OR role = ${ADMIN_ROLE}
    LIMIT 5
  `;

  await sql`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`;

  const [user] = await sql`
    INSERT INTO users (name, email, password, role, department, position, is_active)
    VALUES (
      ${ADMIN_NAME},
      ${ADMIN_EMAIL},
      ${hash},
      ${ADMIN_ROLE},
      'Администрирование',
      'Суперпользователь',
      true
    )
    RETURNING id, name, email, role
  `;

  console.log("Администратор создан:");
  console.log("  Email:", user.email);
  console.log("  Пароль:", ADMIN_PASSWORD);
  console.log("  Роль:", user.role);
  if (existing.length > 0) {
    console.log("(предыдущая запись с этим email заменена)");
  }
} catch (err) {
  console.error("Ошибка:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
