import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(url, { connect_timeout: 15, max: 1 });
try {
  const rows = await sql`SELECT current_database() AS db, version() AS version`;
  console.log("OK: подключение успешно");
  console.log("База:", rows[0].db);
} catch (err) {
  console.error("Ошибка:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
