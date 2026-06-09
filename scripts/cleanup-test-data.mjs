/**
 * Очистка тестовых операционных данных перед выходом в сеть.
 * Сохраняет: оборудование, типы, связи, подразделения (кроме тестовых),
 * справочники (категории склада/документов, шаблоны чеклистов, роли).
 *
 * Использование:
 *   node --env-file=.env scripts/cleanup-test-data.mjs           # dry-run
 *   node --env-file=.env scripts/cleanup-test-data.mjs --confirm # выполнить
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const confirm = process.argv.includes("--confirm");
const sql = postgres(url, { max: 1, connect_timeout: 30 });

const TEST_USER_EMAILS = [
  "Test@test.ru",
  "oper@test.ru",
  "test.sub.a@test.local",
  "test.sub.b@test.local",
];

const TEST_SUBDIVISION_PREFIX = "Тест —";

/** Таблицы для полной очистки (порядок: дочерние → родительские). */
const TABLES_TO_CLEAR = [
  "warehouse_alert_resolutions",
  "warehouse_stock_alerts",
  "warehouse_part_comments",
  "warehouse_movements",
  "part_reservations",
  "request_checklist_items",
  "request_parts",
  "request_coexecutors",
  "request_links",
  "request_audit_log",
  "request_comments",
  "request_status_history",
  "request_time_entries",
  "task_coexecutors",
  "task_comments",
  "task_status_history",
  "maintenance_status_history",
  "notifications",
  "activities",
  "metrics",
  "budget_entries",
  "documents",
  "contacts",
  "suppliers",
  "remarks",
  "daily_inspections",
  "inspection_checklists",
  "service_requests",
  "tasks",
  "maintenance_records",
  "warehouse_parts",
  "equipment_event_log",
  "campaigns",
];

async function countTable(table) {
  const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return count;
}

async function countRows(tables) {
  const result = {};
  for (const table of tables) {
    result[table] = await countTable(table);
  }
  return result;
}

function printCounts(label, counts) {
  console.log(`\n${label}:`);
  let total = 0;
  for (const [table, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(`  ${table}: ${count}`);
      total += count;
    }
  }
  console.log(`  итого строк: ${total}`);
}

async function resetSerialSequence(table) {
  await sql.unsafe(`
    SELECT setval(
      pg_get_serial_sequence('${table}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
      false
    )
  `).catch(() => {
    /* таблица без serial id — пропускаем */
  });
}

async function run() {
  console.log(confirm ? "Режим: ВЫПОЛНЕНИЕ" : "Режим: dry-run (добавьте --confirm для удаления)");

  const before = await countRows(TABLES_TO_CLEAR);
  printCounts("Данные к удалению", before);

  const testUsers = await sql`
    SELECT id, email, name FROM users
    WHERE email = ANY(${TEST_USER_EMAILS})
       OR email LIKE '%@test.local'
  `;
  const testSubs = await sql`
    SELECT id, name FROM subdivisions WHERE name LIKE ${TEST_SUBDIVISION_PREFIX + "%"}
  `;

  console.log("\nТестовые пользователи к удалению:");
  for (const u of testUsers) console.log(`  [${u.id}] ${u.email} (${u.name})`);

  console.log("\nТестовые подразделения к удалению:");
  for (const s of testSubs) console.log(`  [${s.id}] ${s.name}`);

  const equipmentCount = await countTable("equipment");
  const usersKept = await sql`
    SELECT id, email, name FROM users
    WHERE NOT (email = ANY(${TEST_USER_EMAILS}) OR email LIKE '%@test.local')
    ORDER BY id
  `;
  console.log(`\nОборудование сохраняется: ${equipmentCount} ед.`);
  console.log("Пользователи сохраняются:");
  for (const u of usersKept) console.log(`  [${u.id}] ${u.email} (${u.name})`);

  if (!confirm) {
    console.log("\nДля выполнения: node --env-file=.env scripts/cleanup-test-data.mjs --confirm");
    return;
  }

  await sql.begin(async (tx) => {
    for (const table of TABLES_TO_CLEAR) {
      const deleted = await tx.unsafe(`DELETE FROM ${table}`);
      console.log(`  очищено ${table}: ${deleted.count} строк`);
    }

    if (testSubs.length > 0) {
      const fallback = await tx`
        SELECT id, name FROM subdivisions
        WHERE name NOT LIKE ${TEST_SUBDIVISION_PREFIX + "%"}
        ORDER BY
          CASE WHEN name = 'Инструментальный Цех' THEN 0 ELSE 1 END,
          id
        LIMIT 1
      `;
      if (fallback.length > 0) {
        const { id, name } = fallback[0];
        const testSubIds = testSubs.map((s) => s.id);
        const moved = await tx`
          UPDATE equipment SET
            subdivision_id = ${id},
            subdivision_name = ${name},
            department = ${name},
            repair_subdivision_id = NULL,
            repair_subdivision_name = NULL
          WHERE subdivision_id = ANY(${testSubIds})
             OR repair_subdivision_id = ANY(${testSubIds})
          RETURNING id
        `;
        if (moved.length > 0) {
          console.log(`  оборудование переназначено на «${name}»: ${moved.map((r) => r.id).join(", ")}`);
        }
      }

      for (const sub of testSubs) {
        await tx`DELETE FROM subdivisions WHERE id = ${sub.id}`;
        console.log(`  удалено подразделение: ${sub.name}`);
      }
    }

    for (const user of testUsers) {
      await tx`DELETE FROM users WHERE id = ${user.id}`;
      console.log(`  удалён пользователь: ${user.email}`);
    }

    await tx`
      UPDATE equipment SET
        last_maintenance = '',
        next_maintenance = '',
        status = 'active',
        repair_subdivision_id = NULL,
        repair_subdivision_name = NULL
    `;
    console.log("  сброшены даты ТО и статусы оборудования");
  });

  for (const table of TABLES_TO_CLEAR) {
    await resetSerialSequence(table);
  }

  const after = await countRows(TABLES_TO_CLEAR);
  printCounts("После очистки", after);

  console.log("\nГотово. База подготовлена к работе с чистого листа (оборудование сохранено).");
}

try {
  await run();
} catch (err) {
  console.error("Ошибка:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
