/**
 * Перенос данных PostgreSQL на другой сервер (без pg_dump).
 *
 * 1) Создайте пустую БД на новом хосте.
 * 2) Примените схему на целевой БД:
 *      $env:DATABASE_URL="postgresql://..."; npm run db:push
 * 3) Запустите перенос:
 *      node --env-file=.env scripts/migrate-database.mjs --target "postgresql://..."
 *      node --env-file=.env scripts/migrate-database.mjs --target "postgresql://..." --confirm
 *
 * Переменные:
 *   DATABASE_URL         — источник (текущая БД из .env)
 *   TARGET_DATABASE_URL  — цель (можно вместо --target)
 */
import postgres from "postgres";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const pushSchema = args.includes("--push-schema");
const updateEnv = args.includes("--update-env");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = argValue("--target") || process.env.TARGET_DATABASE_URL;

if (!sourceUrl) {
  console.error("DATABASE_URL не задан (источник)");
  process.exit(1);
}
if (!targetUrl) {
  console.error("Укажите целевую БД: --target \"postgresql://...\" или TARGET_DATABASE_URL");
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error("Источник и цель совпадают");
  process.exit(1);
}

/** Порядок копирования: родители → дети (остальные — в конце). */
const TABLE_ORDER = [
  "subdivisions",
  "roles",
  "role_access_profiles",
  "users",
  "equipment_types",
  "warehouse_categories",
  "document_categories",
  "checklist_templates",
  "equipment",
  "equipment_links",
  "campaigns",
  "maintenance_records",
  "maintenance_status_history",
  "tasks",
  "task_status_history",
  "task_comments",
  "task_coexecutors",
  "service_requests",
  "request_time_entries",
  "request_status_history",
  "request_comments",
  "request_audit_log",
  "request_parts",
  "request_coexecutors",
  "request_links",
  "request_checklist_items",
  "remarks",
  "inspection_checklists",
  "daily_inspections",
  "warehouse_parts",
  "warehouse_movements",
  "warehouse_part_comments",
  "warehouse_stock_alerts",
  "warehouse_alert_resolutions",
  "part_reservations",
  "budget_entries",
  "contacts",
  "suppliers",
  "documents",
  "notifications",
  "activities",
  "metrics",
  "equipment_event_log",
];

function withSsl(url) {
  if (/sslmode=/i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sslmode=require`;
}

const source = postgres(withSsl(sourceUrl), { max: 1, connect_timeout: 60 });
const target = postgres(withSsl(targetUrl), { max: 1, connect_timeout: 60 });

async function listTables(sql) {
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((r) => r.table_name);
}

async function countRows(sql, table) {
  const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  return count;
}

function sortTables(tables) {
  const orderIndex = new Map(TABLE_ORDER.map((t, i) => [t, i]));
  return [...tables].sort((a, b) => {
    const ai = orderIndex.has(a) ? orderIndex.get(a) : 9999;
    const bi = orderIndex.has(b) ? orderIndex.get(b) : 9999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

async function resetSequences(sql, table) {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_default LIKE 'nextval%'
  `;
  for (const { column_name } of cols) {
    await sql.unsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', '${column_name}'),
        COALESCE((SELECT MAX("${column_name}") FROM "${table}"), 1),
        (SELECT COUNT(*) > 0 FROM "${table}")
      )
    `).catch(() => {});
  }
}

async function runPushSchema() {
  console.log("Применение схемы Drizzle на целевой БД (db:push)...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["run", "db:push"], {
    env: { ...process.env, DATABASE_URL: withSsl(targetUrl) },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error("db:push завершился с ошибкой");
  }
}

async function migrate() {
  console.log(confirm ? "Режим: ПЕРЕНОС" : "Режим: dry-run");

  const [srcInfo] = await source`SELECT current_database() AS db, inet_server_addr()::text AS host`;
  const [tgtInfo] = await target`SELECT current_database() AS db, inet_server_addr()::text AS host`;
  console.log(`Источник: ${srcInfo.db} @ ${srcInfo.host ?? "local"}`);
  console.log(`Цель:     ${tgtInfo.db} @ ${tgtInfo.host ?? "local"}`);

  if (pushSchema && confirm) {
    await runPushSchema();
    const mig = spawnSync(process.execPath, ["scripts/apply-schema-migration.mjs"], {
      env: { ...process.env, DATABASE_URL: withSsl(targetUrl) },
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (mig.status !== 0) throw new Error("apply-schema-migration failed");
  }

  const sourceTables = await listTables(source);
  const targetTables = await listTables(target);
  const missingOnTarget = sourceTables.filter((t) => !targetTables.includes(t));

  if (missingOnTarget.length > 0) {
    console.error("\nНа целевой БД нет таблиц:", missingOnTarget.join(", "));
    console.error("Запустите с флагом --push-schema --confirm для создания схемы.");
    process.exit(1);
  }

  const tables = sortTables(sourceTables);
  const plan = [];

  for (const table of tables) {
    const srcCount = await countRows(source, table);
    const tgtCount = await countRows(target, table);
    plan.push({ table, srcCount, tgtCount });
  }

  console.log("\nПлан переноса:");
  let totalSrc = 0;
  for (const { table, srcCount, tgtCount } of plan) {
    if (srcCount > 0 || tgtCount > 0) {
      console.log(`  ${table}: ${srcCount} → (сейчас на цели: ${tgtCount})`);
      totalSrc += srcCount;
    }
  }
  console.log(`  всего строк к копированию: ${totalSrc}`);

  if (!confirm) {
    console.log("\nДля переноса добавьте: --confirm");
    console.log("Для создания схемы на пустой БД: --push-schema --confirm");
    return;
  }

  const nonEmpty = plan.filter((p) => p.tgtCount > 0 && p.srcCount > 0);
  if (nonEmpty.length > 0) {
    console.error("\nЦелевая БД уже содержит данные в таблицах:");
    for (const p of nonEmpty) console.error(`  ${p.table}: ${p.tgtCount}`);
    console.error("Очистите целевую БД или используйте пустой инстанс.");
    process.exit(1);
  }

  await target.begin(async (tx) => {
    for (const table of [...tables].reverse()) {
      const n = await countRows(tx, table);
      if (n > 0) {
        await tx.unsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      }
    }

    for (const { table, srcCount } of plan) {
      if (srcCount === 0) continue;
      const rows = await source.unsafe(`SELECT * FROM "${table}"`);
      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(", ");
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const placeholders = chunk
          .map(
            (_, ri) =>
              `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(", ")})`
          )
          .join(", ");
        const values = chunk.flatMap((row) => columns.map((c) => row[c]));
        await tx.unsafe(
          `INSERT INTO "${table}" (${colList}) VALUES ${placeholders}`,
          values
        );
      }
      console.log(`  скопировано ${table}: ${srcCount}`);
    }
  });

  for (const { table } of plan) {
    await resetSequences(target, table);
  }

  console.log("\nПроверка:");
  let ok = true;
  for (const { table, srcCount } of plan) {
    if (srcCount === 0) continue;
    const tgtCount = await countRows(target, table);
    const match = tgtCount === srcCount;
    if (!match) ok = false;
    console.log(`  ${match ? "OK" : "FAIL"} ${table}: ${srcCount} / ${tgtCount}`);
  }

  if (!ok) {
    console.error("\nПеренос завершён с расхождениями");
    process.exit(1);
  }

  if (updateEnv) {
    const envPath = resolve(process.cwd(), ".env");
    if (!existsSync(envPath)) {
      console.warn(".env не найден — обновите DATABASE_URL вручную");
    } else {
      let content = readFileSync(envPath, "utf8");
      if (/^DATABASE_URL=.*/m.test(content)) {
        content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${withSsl(targetUrl)}`);
      } else {
        content += `\nDATABASE_URL=${targetUrl}\n`;
      }
      writeFileSync(envPath, content, "utf8");
      console.log("\n.env обновлён: DATABASE_URL → новая БД");
    }
  } else {
    console.log("\nОбновите DATABASE_URL в .env на новую строку подключения.");
    console.log("Или перезапустите с --update-env для автозамены.");
  }

  console.log("\nПроверка подключения к новой БД:");
  const check = spawnSync(process.execPath, ["scripts/test-db-connection.mjs"], {
    env: { ...process.env, DATABASE_URL: withSsl(targetUrl) },
    encoding: "utf8",
  });
  process.stdout.write(check.stdout ?? "");
  process.stderr.write(check.stderr ?? "");

  console.log("\nГотово. Перезапустите dev-сервер: npm run dev");
}

try {
  await migrate();
} catch (err) {
  console.error("Ошибка:", err.message);
  process.exit(1);
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
